// ============================================================================
// AgentActivationPool — Agent 激活池优化
// 基于社交图谱距离的智能激活，减少不必要的 LLM 调用
// ============================================================================

import type { WorldEvent } from '@beeclaw/shared';
import type { SocialGraph } from '@beeclaw/social-graph';

/**
 * 激活池配置
 */
export interface ActivationPoolConfig {
  /** 最大传播深度（BFS 层数），默认 3 */
  maxPropagationDepth: number;
  /** 最大激活 Agent 数量（限制单事件激活上限），默认 100 */
  maxActivatedAgents: number;
  /** 低重要性事件的激活衰减系数（0-1），默认 0.5 */
  importanceDecay: number;
  /** 是否启用激活池优化，默认 true */
  enabled: boolean;
}

/**
 * 激活池结果
 */
export interface ActivationResult {
  /** 激活的 Agent ID 列表 */
  activatedIds: string[];
  /** 每个 Agent 的传播距离 */
  distances: Map<string, number>;
  /** 被过滤掉的 Agent 数量 */
  filteredCount: number;
  /** 传播深度 */
  depth: number;
}

const DEFAULT_CONFIG: ActivationPoolConfig = {
  maxPropagationDepth: 3,
  maxActivatedAgents: 100,
  importanceDecay: 0.5,
  enabled: true,
};

export class AgentActivationPool {
  private config: ActivationPoolConfig;

  /** 统计信息 */
  private stats = {
    totalActivations: 0,
    totalFiltered: 0,
    totalAgentsActivated: 0,
  };

  constructor(config?: Partial<ActivationPoolConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 基于社交图谱距离计算应该激活的 Agent
   *
   * 算法：
   * 1. 根据事件的 propagationRadius 确定初始种子节点
   * 2. 从种子节点做 BFS，按距离逐层扩展
   * 3. 每层的激活概率随距离衰减
   * 4. 结合事件重要性和 Agent 影响力决定是否激活
   */
  computeActivation(
    event: WorldEvent,
    graph: SocialGraph,
    activeAgentIds: string[],
  ): ActivationResult {
    if (!this.config.enabled) {
      // 未启用时返回所有活跃 Agent
      const distances = new Map<string, number>();
      for (const id of activeAgentIds) {
        distances.set(id, 0);
      }
      return {
        activatedIds: activeAgentIds,
        distances,
        filteredCount: 0,
        depth: 0,
      };
    }

    const allNodes = graph.getAllNodes();
    if (allNodes.length === 0) {
      return { activatedIds: [], distances: new Map(), filteredCount: 0, depth: 0 };
    }

    // 高重要性事件激活所有 Agent
    if (event.importance >= 0.9) {
      const distances = new Map<string, number>();
      for (const id of activeAgentIds) {
        distances.set(id, 0);
      }
      // 更新统计
      this.stats.totalActivations++;
      this.stats.totalAgentsActivated += activeAgentIds.length;
      return {
        activatedIds: activeAgentIds,
        distances,
        filteredCount: 0,
        depth: 0,
      };
    }

    const activeSet = new Set(activeAgentIds);
    const reached = new Map<string, number>(); // agentId -> distance

    // 第一层：根据 propagationRadius 确定种子节点
    const directCount = Math.min(
      Math.max(1, Math.ceil(allNodes.length * event.propagationRadius)),
      this.config.maxActivatedAgents,
    );
    const shuffled = [...allNodes].sort(() => Math.random() - 0.5);
    const seeds = shuffled.slice(0, directCount);

    for (const node of seeds) {
      if (activeSet.has(node.agentId)) {
        reached.set(node.agentId, 0);
        if (reached.size >= this.config.maxActivatedAgents) break;
      }
    }

    // BFS 扩展
    let currentLayer = [...reached.keys()];
    let maxDepth = 0;

    const effectiveDepth = Math.ceil(
      this.config.maxPropagationDepth * event.importance,
    );

    for (let d = 1; d <= Math.max(1, effectiveDepth); d++) {
      if (reached.size >= this.config.maxActivatedAgents) break;

      const nextLayer: string[] = [];

      for (const agentId of currentLayer) {
        // 获取该 Agent 的邻居（followers + following）
        const neighbors = graph.getNeighbors(agentId);

        for (const neighborId of neighbors) {
          if (reached.has(neighborId)) continue;
          if (!activeSet.has(neighborId)) continue;

          // 激活概率随距离衰减
          const activationProb = event.importance * Math.pow(this.config.importanceDecay, d);
          if (Math.random() < activationProb) {
            reached.set(neighborId, d);
            nextLayer.push(neighborId);

            if (reached.size >= this.config.maxActivatedAgents) break;
          }
        }

        if (reached.size >= this.config.maxActivatedAgents) break;
      }

      if (nextLayer.length === 0) break;
      currentLayer = nextLayer;
      maxDepth = d;
    }

    const activatedIds = [...reached.keys()];
    const filteredCount = activeAgentIds.length - activatedIds.length;

    // 更新统计
    this.stats.totalActivations++;
    this.stats.totalFiltered += filteredCount;
    this.stats.totalAgentsActivated += activatedIds.length;

    return {
      activatedIds,
      distances: reached,
      filteredCount,
      depth: maxDepth,
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      avgActivated: this.stats.totalActivations > 0
        ? this.stats.totalAgentsActivated / this.stats.totalActivations
        : 0,
      avgFiltered: this.stats.totalActivations > 0
        ? this.stats.totalFiltered / this.stats.totalActivations
        : 0,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalActivations: 0,
      totalFiltered: 0,
      totalAgentsActivated: 0,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): ActivationPoolConfig {
    return { ...this.config };
  }

  /**
   * 动态更新配置
   */
  updateConfig(config: Partial<ActivationPoolConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
