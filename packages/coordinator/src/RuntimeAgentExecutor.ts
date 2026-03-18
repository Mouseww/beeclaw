// ============================================================================
// RuntimeAgentExecutor — 真实的 AgentExecutor 实现
//
// 利用 @beeclaw/agent-runtime 的 Agent 和 ModelRouter，在 Worker 进程内
// 加载、缓存和执行 Agent 对世界事件的反应。
//
// 设计要点：
// - Worker 进程持有 Agent 实例的本地缓存（in-memory Map）
// - Agent 数据通过 loadAgent(data) / loadAgents(data[]) 方法注入
//   （由 Coordinator 通过消息传递或 worker-entry 初始化时加载）
// - 每次 executeAgent 调用真实的 agent.react() → LLM 调用
// - 产生的新事件遵循 WorldEngine 中的相同逻辑
// ============================================================================

import { Agent, ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldEvent, BeeAgent, ModelRouterConfig } from '@beeclaw/shared';
import type { AgentResponseRecord } from '@beeclaw/consensus';
import type { AgentExecutor } from './Worker.js';
import type { AgentStateSnapshot, AgentChangedField } from './types.js';

export interface RuntimeAgentExecutorConfig {
  /** ModelRouter 配置，不传则使用环境变量默认配置 */
  modelRouterConfig?: ModelRouterConfig;
  /** 单个 Agent 执行超时（毫秒），默认 30000 */
  agentTimeoutMs?: number;
  /** 是否启用执行日志，默认 true */
  enableLogging?: boolean;
}

/**
 * RuntimeAgentExecutor — 基于 agent-runtime 的真实 AgentExecutor。
 *
 * 责任：
 * 1. 管理本地 Agent 实例缓存
 * 2. 通过 Agent.react() 调用 LLM 获取结构化响应
 * 3. 将响应转换为 AgentResponseRecord + 新产生的 WorldEvent
 * 4. 判断 Agent 是否对事件感兴趣、是否活跃
 */
export class RuntimeAgentExecutor implements AgentExecutor {
  private agents: Map<string, Agent> = new Map();
  private modelRouter: ModelRouter;
  private agentTimeoutMs: number;
  private enableLogging: boolean;

  constructor(config: RuntimeAgentExecutorConfig = {}) {
    this.modelRouter = new ModelRouter(config.modelRouterConfig);
    this.agentTimeoutMs = config.agentTimeoutMs ?? 30_000;
    this.enableLogging = config.enableLogging ?? true;
  }

  // ── Agent 生命周期管理 ──

  /**
   * 从序列化数据加载单个 Agent 到本地缓存
   */
  loadAgent(data: BeeAgent): void {
    const agent = Agent.fromData(data);
    this.agents.set(agent.id, agent);
    if (this.enableLogging) {
      console.log(`[RuntimeAgentExecutor] Agent 已加载: ${agent.name} (${agent.id})`);
    }
  }

  /**
   * 批量加载 Agent
   */
  loadAgents(dataList: BeeAgent[]): void {
    for (const data of dataList) {
      this.loadAgent(data);
    }
    if (this.enableLogging) {
      console.log(`[RuntimeAgentExecutor] 批量加载完成，共 ${dataList.length} 个 Agent`);
    }
  }

  /**
   * 从缓存移除指定 Agent
   */
  unloadAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * 清空所有本地 Agent 缓存
   */
  unloadAll(): void {
    this.agents.clear();
  }

  /**
   * 获取指定 Agent 实例（用于外部检查状态）
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有已加载 Agent 的 ID
   */
  getLoadedAgentIds(): string[] {
    return [...this.agents.keys()];
  }

  /**
   * 获取已加载 Agent 数量
   */
  getLoadedAgentCount(): number {
    return this.agents.size;
  }

  /**
   * 导出指定 Agent 的序列化数据（用于状态同步回 Coordinator）
   */
  exportAgent(agentId: string): BeeAgent | undefined {
    const agent = this.agents.get(agentId);
    return agent?.toData();
  }

  /**
   * 导出所有已加载 Agent 的序列化数据
   */
  exportAllAgents(): BeeAgent[] {
    return [...this.agents.values()].map((a) => a.toData());
  }

  /**
   * 获取 ModelRouter 实例（用于外部配置更新）
   */
  getModelRouter(): ModelRouter {
    return this.modelRouter;
  }

  // ── Agent 状态快照 ──

  /**
   * 为指定 Agent 生成状态快照。
   *
   * 快照基于 Agent.toData() 序列化，附带元信息。
   * changedFields 目前标记所有可能变化的字段（全量快照），
   * 后续可通过 diff 机制优化为增量。
   */
  createSnapshot(
    agentId: string,
    tick: number,
    workerId: string,
    changedFields?: AgentChangedField[],
  ): AgentStateSnapshot | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    return {
      agentData: agent.toData(),
      tick,
      timestamp: Date.now(),
      workerId,
      changedFields: changedFields ?? [
        'memory.shortTerm',
        'memory.opinions',
        'lastActiveTick',
        'credibility',
      ],
    };
  }

  /**
   * 为一组 Agent 批量生成状态快照。
   * 如果 agentIds 为空数组，则导出所有已加载 Agent 的快照。
   */
  createSnapshots(
    agentIds: string[],
    tick: number,
    workerId: string,
  ): AgentStateSnapshot[] {
    const ids = agentIds.length > 0 ? agentIds : this.getLoadedAgentIds();
    const snapshots: AgentStateSnapshot[] = [];

    for (const id of ids) {
      const snapshot = this.createSnapshot(id, tick, workerId);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  /**
   * 仅为已激活的（本 tick 中参与执行的）Agent 生成快照。
   * activatedIds 来自 Worker.processTick 中筛选出的参与执行的 Agent。
   * 注意：空数组表示没有 Agent 被激活，返回空结果（与 createSnapshots 不同）。
   */
  createSnapshotsForActivated(
    activatedIds: string[],
    tick: number,
    workerId: string,
  ): AgentStateSnapshot[] {
    if (activatedIds.length === 0) {
      return [];
    }
    return this.createSnapshots(activatedIds, tick, workerId);
  }

  // ── AgentExecutor 接口实现 ──

  /**
   * 执行指定 Agent 对事件的反应
   *
   * 流程：
   * 1. 查找本地 Agent 实例
   * 2. 调用 agent.react(event, modelRouter, tick) → LLM 调用
   * 3. 构建 AgentResponseRecord
   * 4. 如果 Agent 选择发言/转发，构建新的 WorldEvent
   */
  async executeAgent(
    agentId: string,
    event: WorldEvent,
    tick: number,
  ): Promise<{ record: AgentResponseRecord; newEvents: WorldEvent[] } | null> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      if (this.enableLogging) {
        console.warn(`[RuntimeAgentExecutor] Agent ${agentId} 未加载，跳过执行`);
      }
      return null;
    }

    try {
      // 带超时的 LLM 调用
      const response = await this.executeWithTimeout(
        agent.react(event, this.modelRouter, tick),
        this.agentTimeoutMs,
        agentId,
      );

      // 构建响应记录
      const record: AgentResponseRecord = {
        agentId: agent.id,
        agentName: agent.name,
        credibility: agent.credibility,
        response,
      };

      // 构建新事件（Agent 发言/转发 → 产生内部事件）
      const newEvents: WorldEvent[] = [];
      if (response.action === 'speak' || response.action === 'forward') {
        newEvents.push({
          id: `${agent.id}-${tick}-${Date.now()}`,
          type: 'agent_action',
          category: event.category,
          title: `${agent.name}的观点`,
          content: response.opinion,
          source: agent.id,
          importance: Math.min(event.importance * 0.5, agent.influence / 100),
          propagationRadius: 0.1,
          tick,
          tags: event.tags,
        });
      }

      if (this.enableLogging) {
        console.log(
          `[RuntimeAgentExecutor] Agent ${agent.name} 对"${event.title}"的反应: ` +
          `action=${response.action}, emotion=${response.emotionalState.toFixed(2)}`,
        );
      }

      return { record, newEvents };
    } catch (error) {
      if (this.enableLogging) {
        console.error(
          `[RuntimeAgentExecutor] Agent ${agent.name} (${agentId}) 执行失败:`,
          error instanceof Error ? error.message : String(error),
        );
      }
      // 执行失败返回 null，不影响其他 Agent
      return null;
    }
  }

  /**
   * 判断 Agent 是否对该事件感兴趣
   */
  isAgentInterested(agentId: string, event: WorldEvent): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    return agent.isInterestedIn(event);
  }

  /**
   * 判断 Agent 是否处于活跃状态
   */
  isAgentActive(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    return agent.status === 'active';
  }

  // ── 内部方法 ──

  /**
   * 带超时控制的 Promise 执行
   */
  private executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    agentId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent ${agentId} LLM 调用超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
