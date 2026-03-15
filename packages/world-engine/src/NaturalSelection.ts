// ============================================================================
// NaturalSelection — 自然选择（信誉淘汰）模块
// 定期评估 Agent 信誉和活跃度，淘汰低效 Agent，补充新 Agent 维持种群规模
// ============================================================================

import type { Agent, AgentSpawner } from '@beeclaw/agent-runtime';

/**
 * 自然选择配置
 */
export interface NaturalSelectionConfig {
  /** 每 N 个 tick 触发一次淘汰检查，默认 100 */
  checkIntervalTicks: number;
  /** 信誉低于此阈值的 Agent 标记为 dormant（0-1 范围），默认 0.2 */
  credibilityThreshold: number;
  /** 超过 M 个 tick 没响应则视为不活跃，默认 50 */
  inactivityTicks: number;
  /** dormant 超过此 tick 数则标记为 dead，默认 200 */
  dormantDeathTicks: number;
  /** 目标种群规模（淘汰后补充到此数量），0 表示不补充 */
  targetPopulation: number;
}

/**
 * 单次淘汰检查的结果
 */
export interface SelectionResult {
  tick: number;
  /** 本次被标记为 dormant 的 Agent */
  newDormant: SelectionRecord[];
  /** 本次被标记为 dead 的 Agent */
  newDead: SelectionRecord[];
  /** 本次新孵化的 Agent */
  newSpawned: string[];
  /** 检查前的活跃 Agent 数量 */
  activeCountBefore: number;
  /** 检查后的活跃 Agent 数量 */
  activeCountAfter: number;
}

/**
 * 淘汰记录
 */
export interface SelectionRecord {
  agentId: string;
  agentName: string;
  reason: SelectionReason;
  credibility: number;
  lastActiveTick: number;
}

/**
 * 淘汰原因
 */
export type SelectionReason = 'low_credibility' | 'inactivity' | 'dormant_timeout';

/**
 * NaturalSelectionEvent —— 自然选择事件，记录每次淘汰/新生信息
 */
export interface NaturalSelectionEvent {
  id: string;
  type: 'system';
  category: 'general';
  title: string;
  content: string;
  source: 'natural-selection';
  importance: number;
  propagationRadius: number;
  tick: number;
  tags: string[];
  selectionResult: SelectionResult;
}

// ── 默认配置 ──

export const DEFAULT_SELECTION_CONFIG: NaturalSelectionConfig = {
  checkIntervalTicks: 100,
  credibilityThreshold: 0.2,
  inactivityTicks: 50,
  dormantDeathTicks: 200,
  targetPopulation: 0,
};

/**
 * NaturalSelection 类
 * 负责根据信誉和活跃度淘汰低效 Agent，并触发孵化器补充种群
 */
export class NaturalSelection {
  private config: NaturalSelectionConfig;
  private history: SelectionResult[] = [];

  constructor(config?: Partial<NaturalSelectionConfig>) {
    this.config = { ...DEFAULT_SELECTION_CONFIG, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<NaturalSelectionConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<NaturalSelectionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 判断当前 tick 是否应该执行淘汰检查
   */
  shouldCheck(tick: number): boolean {
    if (tick <= 0) return false;
    return tick % this.config.checkIntervalTicks === 0;
  }

  /**
   * 执行自然选择检查
   *
   * @param tick 当前 tick
   * @param agents 所有 Agent 列表
   * @param spawner Agent 孵化器（用于补充种群）
   * @param addAgentsFn 将新 Agent 注册到 WorldEngine 的回调
   * @returns 淘汰结果和生成的 NaturalSelectionEvent
   */
  evaluate(
    tick: number,
    agents: Agent[],
    spawner: AgentSpawner,
    addAgentsFn: (newAgents: Agent[]) => void,
  ): { result: SelectionResult; event: NaturalSelectionEvent } {
    const activeCountBefore = agents.filter(a => a.status === 'active').length;

    const newDormant: SelectionRecord[] = [];
    const newDead: SelectionRecord[] = [];

    // ── 阶段 1：评估活跃 Agent，决定是否标记为 dormant ──
    for (const agent of agents) {
      if (agent.status !== 'active') continue;

      // 检查 a) 信誉低于阈值
      if (agent.credibility < this.config.credibilityThreshold) {
        agent.setStatus('dormant');
        newDormant.push({
          agentId: agent.id,
          agentName: agent.name,
          reason: 'low_credibility',
          credibility: agent.credibility,
          lastActiveTick: agent.lastActiveTick,
        });
        continue; // 已标记，跳过后续检查
      }

      // 检查 b) 长期不活跃
      const inactiveTicks = tick - agent.lastActiveTick;
      if (inactiveTicks > this.config.inactivityTicks) {
        agent.setStatus('dormant');
        newDormant.push({
          agentId: agent.id,
          agentName: agent.name,
          reason: 'inactivity',
          credibility: agent.credibility,
          lastActiveTick: agent.lastActiveTick,
        });
      }
    }

    // ── 阶段 2：检查 dormant Agent，决定是否标记为 dead ──
    for (const agent of agents) {
      if (agent.status !== 'dormant') continue;

      // 跳过本轮刚被标记为 dormant 的（给它们一些恢复时间）
      if (newDormant.some(r => r.agentId === agent.id)) continue;

      // 检查 c) dormant 超时
      const dormantDuration = tick - agent.lastActiveTick;
      if (dormantDuration > this.config.dormantDeathTicks) {
        agent.setStatus('dead');
        newDead.push({
          agentId: agent.id,
          agentName: agent.name,
          reason: 'dormant_timeout',
          credibility: agent.credibility,
          lastActiveTick: agent.lastActiveTick,
        });
      }
    }

    // ── 阶段 3：补充种群 ──
    const newSpawned: string[] = [];
    if (this.config.targetPopulation > 0) {
      const currentActive = agents.filter(a => a.status === 'active').length;
      const deficit = this.config.targetPopulation - currentActive;

      if (deficit > 0) {
        const spawnedAgents = spawner.spawnBatch(deficit, tick);
        addAgentsFn(spawnedAgents);
        for (const agent of spawnedAgents) {
          newSpawned.push(agent.id);
        }
      }
    }

    const activeCountAfter = agents.filter(a => a.status === 'active').length + newSpawned.length;

    const result: SelectionResult = {
      tick,
      newDormant,
      newDead,
      newSpawned,
      activeCountBefore,
      activeCountAfter,
    };

    this.history.push(result);
    // 保留最近 100 次检查结果
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    const event = this.buildSelectionEvent(tick, result);

    return { result, event };
  }

  /**
   * 构建 NaturalSelectionEvent
   */
  private buildSelectionEvent(tick: number, result: SelectionResult): NaturalSelectionEvent {
    const dormantNames = result.newDormant.map(r => `${r.agentName}(${r.reason})`);
    const deadNames = result.newDead.map(r => r.agentName);

    const lines: string[] = [
      `[自然选择] Tick ${tick} 淘汰检查完成`,
      `活跃 Agent: ${result.activeCountBefore} → ${result.activeCountAfter}`,
    ];

    if (result.newDormant.length > 0) {
      lines.push(`新休眠: ${dormantNames.join(', ')}`);
    }
    if (result.newDead.length > 0) {
      lines.push(`新死亡: ${deadNames.join(', ')}`);
    }
    if (result.newSpawned.length > 0) {
      lines.push(`新孵化: ${result.newSpawned.length} 个 Agent`);
    }

    const totalChanges = result.newDormant.length + result.newDead.length + result.newSpawned.length;
    const importance = Math.min(0.3 + totalChanges * 0.05, 0.8);

    return {
      id: `ns_${tick}`,
      type: 'system',
      category: 'general',
      title: `自然选择 Tick ${tick}：休眠 ${result.newDormant.length} / 死亡 ${result.newDead.length} / 新生 ${result.newSpawned.length}`,
      content: lines.join('\n'),
      source: 'natural-selection',
      importance,
      propagationRadius: 0, // 系统事件不传播给 Agent
      tick,
      tags: ['natural-selection', 'system'],
      selectionResult: result,
    };
  }

  /**
   * 获取历史检查记录
   */
  getHistory(): SelectionResult[] {
    return [...this.history];
  }

  /**
   * 获取最近一次检查结果
   */
  getLastResult(): SelectionResult | undefined {
    return this.history[this.history.length - 1];
  }
}
