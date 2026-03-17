// ============================================================================
// BeeClaw Server — 持久化层：Agent 状态恢复器
//
// 功能：
// 1. 增量保存：维护 dirty set，仅保存自上次快照以来变化的 Agent
// 2. 恢复校验：加载时验证数据完整性，损坏记录自动标记
// 3. 启动恢复：服务启动时从数据库恢复所有 Agent 及 Social Graph 状态
// ============================================================================

import type { DatabaseAdapter } from './adapter.js';
import type { AgentRow } from './store.js';
import { Agent } from '@beeclaw/agent-runtime';
import { SocialGraph } from '@beeclaw/social-graph';
import type { AgentMemoryState, AgentPersona, ModelTier, AgentStatus } from '@beeclaw/shared';

// ── 校验结果 ──

export interface AgentValidationResult {
  /** 成功恢复的 Agent 列表 */
  recovered: Agent[];
  /** 损坏或无效的 Agent ID 列表及原因 */
  corrupted: Array<{ id: string; reason: string }>;
  /** 校验总耗时（毫秒） */
  durationMs: number;
}

export interface GraphRecoveryResult {
  /** 恢复的节点数量 */
  nodeCount: number;
  /** 恢复的边数量 */
  edgeCount: number;
  /** 跳过的无效记录数量（节点/边不匹配已恢复 Agent） */
  skipped: number;
}

export interface FullRecoveryResult {
  agents: AgentValidationResult;
  graph: GraphRecoveryResult;
  /** 恢复的起始 tick */
  tick: number;
}

// ── AgentStateRecovery 类 ──

/**
 * AgentStateRecovery — 服务启动时从数据库恢复完整世界状态
 *
 * 使用方法：
 * ```ts
 * const recovery = new AgentStateRecovery(store);
 * const result = await recovery.recoverAll();
 * for (const agent of result.agents.recovered) {
 *   worldEngine.addAgent(agent);
 * }
 * // 恢复 Social Graph 边关系（bypassing initializeRandomRelations）
 * ```
 */
export class AgentStateRecovery {
  private readonly db: DatabaseAdapter;

  /** 脏数据 Agent ID 集合（自上次保存以来有变更的 Agent） */
  private dirtyAgentIds: Set<string> = new Set();

  /** 是否有 Social Graph 变更需要持久化 */
  private graphDirty = false;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  // ── 增量保存（dirty tracking） ──

  /**
   * 标记某个 Agent 为脏（状态已变更，下次快照时需要保存）
   */
  markAgentDirty(agentId: string): void {
    this.dirtyAgentIds.add(agentId);
  }

  /**
   * 批量标记脏 Agent
   */
  markAgentsDirty(agentIds: string[]): void {
    for (const id of agentIds) {
      this.dirtyAgentIds.add(id);
    }
  }

  /**
   * 标记 Social Graph 为脏
   */
  markGraphDirty(): void {
    this.graphDirty = true;
  }

  /**
   * 获取当前脏数据 Agent ID 数量
   */
  getDirtyCount(): number {
    return this.dirtyAgentIds.size;
  }

  /**
   * 增量保存脏 Agent 到数据库（仅保存有变更的 Agent）
   *
   * @param agents 当前所有 Agent Map
   */
  async flushDirtyAgents(agents: Map<string, Agent>): Promise<number> {
    if (this.dirtyAgentIds.size === 0) return 0;

    const dirtyAgents: Agent[] = [];
    for (const id of this.dirtyAgentIds) {
      const agent = agents.get(id);
      if (agent) {
        dirtyAgents.push(agent);
      }
    }

    if (dirtyAgents.length > 0) {
      await this.db.saveDirtyAgents(dirtyAgents);
    }

    const count = dirtyAgents.length;
    this.dirtyAgentIds.clear();
    return count;
  }

  /**
   * 保存 Social Graph 边关系（全量覆盖，仅在 graphDirty 时执行）
   */
  async flushGraphIfDirty(graph: SocialGraph): Promise<boolean> {
    if (!this.graphDirty) return false;

    const { edges, nodes } = graph.toData();
    await this.db.saveSocialEdges(edges);
    await this.db.saveSocialNodes(nodes);
    this.graphDirty = false;
    return true;
  }

  /**
   * 强制立即保存所有 Agent 和 Social Graph（全量快照）
   */
  async forceFlush(agents: Map<string, Agent>, graph: SocialGraph): Promise<void> {
    const allAgents = Array.from(agents.values());
    if (allAgents.length > 0) {
      await this.db.saveAgents(allAgents);
    }

    const { edges, nodes } = graph.toData();
    await this.db.saveSocialEdges(edges);
    await this.db.saveSocialNodes(nodes);

    // 清空脏标记
    this.dirtyAgentIds.clear();
    this.graphDirty = false;
  }

  // ── 启动恢复 ──

  /**
   * 从数据库完整恢复所有 Agent 状态和 Social Graph
   *
   * 校验规则：
   * - persona 字段必须是合法 JSON 且包含必要键
   * - memory 字段必须包含 shortTerm、longTerm、opinions、predictions 四个数组/对象
   * - influence 必须是 0-100 的数值
   * - credibility 必须是 0-1 的数值
   * - status 必须是 'active'、'dormant'、'dead' 之一
   * - modelTier 必须是 'local'、'cheap'、'strong' 之一
   *
   * 损坏记录不会被加载，仅被记录到 corrupted 列表
   */
  async recoverAll(): Promise<FullRecoveryResult> {
    const startTime = Date.now();

    // 恢复 tick
    const tick = await this.db.getTick();

    // 恢复 Agents
    const agentRows = await this.db.loadAgentRows();
    const agentResult = this.validateAndRestoreAgents(agentRows, startTime);

    // 恢复 Social Graph
    const recoveredAgentIds = new Set(agentResult.recovered.map(a => a.id));
    const graphResult = await this.recoverGraph(recoveredAgentIds);

    return {
      agents: agentResult,
      graph: graphResult,
      tick,
    };
  }

  /**
   * 校验并恢复 Agent 列表
   */
  private validateAndRestoreAgents(rows: AgentRow[], startTime: number): AgentValidationResult {
    const recovered: Agent[] = [];
    const corrupted: Array<{ id: string; reason: string }> = [];

    for (const row of rows) {
      const validation = this.validateAgentRow(row);
      if (!validation.valid) {
        corrupted.push({ id: row.id, reason: validation.reason });
        continue;
      }

      try {
        const agent = this.restoreAgentFromRow(row);
        recovered.push(agent);
      } catch (err) {
        corrupted.push({
          id: row.id,
          reason: `恢复实例失败: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const durationMs = Date.now() - startTime;

    if (corrupted.length > 0) {
      console.warn(
        `[AgentStateRecovery] 发现 ${corrupted.length} 条损坏记录:`,
        corrupted.map(c => `${c.id}(${c.reason})`).join(', ')
      );
    }

    console.log(
      `[AgentStateRecovery] 恢复完成：成功 ${recovered.length} 个 Agent，` +
      `损坏 ${corrupted.length} 个，耗时 ${durationMs}ms`
    );

    return { recovered, corrupted, durationMs };
  }

  /**
   * 恢复 Social Graph（仅恢复与已知 Agent 相关的节点和边）
   */
  private async recoverGraph(knownAgentIds: Set<string>): Promise<GraphRecoveryResult> {
    const graph = new SocialGraph();
    let skipped = 0;

    const [nodes, edges] = await Promise.all([
      this.db.loadSocialNodes(),
      this.db.loadSocialEdges(),
    ]);

    // 恢复节点（仅限已知 Agent）
    let nodeCount = 0;
    for (const node of nodes) {
      if (knownAgentIds.has(node.agentId)) {
        graph.addNode(node.agentId, node.influence, node.community, node.role);
        nodeCount++;
      } else {
        skipped++;
      }
    }

    // 恢复边（仅限两端都是已知 Agent 且节点已存在的边）
    let edgeCount = 0;
    for (const edge of edges) {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
        graph.addEdge(edge.from, edge.to, edge.type, edge.strength, edge.formedAtTick);
        edgeCount++;
      } else {
        skipped++;
      }
    }

    console.log(
      `[AgentStateRecovery] Social Graph 恢复：节点 ${nodeCount} 个，边 ${edgeCount} 条，` +
      `跳过无效记录 ${skipped} 条`
    );

    return { nodeCount, edgeCount, skipped };
  }

  /**
   * 将恢复的 Social Graph 应用到 WorldEngine 的 socialGraph 实例
   * （直接操作传入的 graph 对象，避免创建新实例）
   */
  async applyGraphToEngine(graph: SocialGraph, knownAgentIds: Set<string>): Promise<GraphRecoveryResult> {
    let skipped = 0;

    const [nodes, edges] = await Promise.all([
      this.db.loadSocialNodes(),
      this.db.loadSocialEdges(),
    ]);

    let nodeCount = 0;
    for (const node of nodes) {
      if (knownAgentIds.has(node.agentId)) {
        graph.addNode(node.agentId, node.influence, node.community, node.role);
        nodeCount++;
      } else {
        skipped++;
      }
    }

    let edgeCount = 0;
    for (const edge of edges) {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
        graph.addEdge(edge.from, edge.to, edge.type, edge.strength, edge.formedAtTick);
        edgeCount++;
      } else {
        skipped++;
      }
    }

    console.log(
      `[AgentStateRecovery] Social Graph 已应用至 WorldEngine：` +
      `节点 ${nodeCount} 个，边 ${edgeCount} 条，跳过 ${skipped} 条`
    );

    return { nodeCount, edgeCount, skipped };
  }

  // ── 校验逻辑 ──

  /**
   * 校验 AgentRow 数据完整性
   */
  private validateAgentRow(row: AgentRow): { valid: true } | { valid: false; reason: string } {
    // 校验必要字段存在性
    if (!row.id || typeof row.id !== 'string') {
      return { valid: false, reason: '缺少或无效的 id' };
    }
    if (!row.name || typeof row.name !== 'string') {
      return { valid: false, reason: '缺少或无效的 name' };
    }

    // 校验 persona JSON
    let persona: unknown;
    try {
      persona = typeof row.persona === 'string' ? JSON.parse(row.persona) : row.persona;
    } catch {
      return { valid: false, reason: 'persona 字段 JSON 解析失败' };
    }
    if (!isValidPersona(persona)) {
      return { valid: false, reason: 'persona 字段缺少必要键（profession 或 traits）' };
    }

    // 校验 memory JSON
    let memory: unknown;
    try {
      memory = typeof row.memory === 'string' ? JSON.parse(row.memory) : row.memory;
    } catch {
      return { valid: false, reason: 'memory 字段 JSON 解析失败' };
    }
    if (!isValidMemoryState(memory)) {
      return { valid: false, reason: 'memory 字段结构不完整（缺少 shortTerm/longTerm/opinions/predictions）' };
    }

    // 校验数值范围
    if (typeof row.influence !== 'number' || row.influence < 0 || row.influence > 100) {
      return { valid: false, reason: `influence 值超出范围: ${row.influence}` };
    }
    if (typeof row.credibility !== 'number' || row.credibility < 0 || row.credibility > 1) {
      return { valid: false, reason: `credibility 值超出范围: ${row.credibility}` };
    }

    // 校验枚举值
    const validStatuses: AgentStatus[] = ['active', 'dormant', 'dead'];
    if (!validStatuses.includes(row.status as AgentStatus)) {
      return { valid: false, reason: `无效的 status: ${row.status}` };
    }

    const validTiers: ModelTier[] = ['local', 'cheap', 'strong'];
    if (!validTiers.includes(row.model_tier as ModelTier)) {
      return { valid: false, reason: `无效的 model_tier: ${row.model_tier}` };
    }

    return { valid: true };
  }

  /**
   * 从 AgentRow 恢复 Agent 实例
   */
  private restoreAgentFromRow(row: AgentRow): Agent {
    const persona = (typeof row.persona === 'string'
      ? JSON.parse(row.persona)
      : row.persona) as AgentPersona;

    const memory = (typeof row.memory === 'string'
      ? JSON.parse(row.memory)
      : row.memory) as AgentMemoryState;

    const followers = (typeof row.followers === 'string'
      ? JSON.parse(row.followers)
      : row.followers) as string[];

    const following = (typeof row.following === 'string'
      ? JSON.parse(row.following)
      : row.following) as string[];

    return Agent.fromData({
      id: row.id,
      name: row.name,
      persona,
      memory,
      relationships: [],
      followers,
      following,
      influence: row.influence,
      status: row.status as AgentStatus,
      credibility: row.credibility,
      spawnedAtTick: row.spawned_at_tick,
      lastActiveTick: row.last_active_tick,
      modelTier: row.model_tier as ModelTier,
      modelId: `${row.model_tier}-default`,
    });
  }
}

// ── 类型守卫辅助函数 ──

function isValidPersona(value: unknown): value is AgentPersona {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['profession'] === 'string' &&
    obj['traits'] !== null &&
    typeof obj['traits'] === 'object'
  );
}

function isValidMemoryState(value: unknown): value is AgentMemoryState {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj['shortTerm']) &&
    Array.isArray(obj['longTerm']) &&
    obj['opinions'] !== null &&
    typeof obj['opinions'] === 'object' &&
    Array.isArray(obj['predictions'])
  );
}
