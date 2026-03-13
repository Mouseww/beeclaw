// ============================================================================
// WorldState — 世界状态管理器
// 管理全局事实、情绪地图、活跃事件等世界级状态
// ============================================================================

import type { WorldState, WorldEvent } from '@beeclaw/shared';

export class WorldStateManager {
  private state: WorldState;

  constructor(initialState?: Partial<WorldState>) {
    this.state = {
      tick: initialState?.tick ?? 0,
      timestamp: initialState?.timestamp ?? new Date(),
      globalFacts: initialState?.globalFacts ?? [],
      sentiment: initialState?.sentiment ?? {},
      activeEvents: initialState?.activeEvents ?? [],
      agentCount: initialState?.agentCount ?? 0,
    };
  }

  /**
   * 获取当前世界状态快照
   */
  getState(): WorldState {
    return { ...this.state };
  }

  /**
   * 推进 tick
   */
  advanceTick(tick: number): void {
    this.state.tick = tick;
    this.state.timestamp = new Date();
  }

  /**
   * 更新 Agent 数量
   */
  setAgentCount(count: number): void {
    this.state.agentCount = count;
  }

  /**
   * 添加全局事实
   */
  addFact(fact: string): void {
    this.state.globalFacts.push(fact);
    // 保留最近 100 条
    if (this.state.globalFacts.length > 100) {
      this.state.globalFacts = this.state.globalFacts.slice(-100);
    }
  }

  /**
   * 更新情绪地图
   */
  updateSentiment(topic: string, value: number): void {
    this.state.sentiment[topic] = Math.max(-1, Math.min(1, value));
  }

  /**
   * 批量更新情绪
   */
  updateSentiments(sentiments: Record<string, number>): void {
    for (const [topic, value] of Object.entries(sentiments)) {
      this.updateSentiment(topic, value);
    }
  }

  /**
   * 设置活跃事件列表
   */
  setActiveEvents(events: WorldEvent[]): void {
    this.state.activeEvents = events;
  }

  /**
   * 获取当前 tick
   */
  getCurrentTick(): number {
    return this.state.tick;
  }

  /**
   * 格式化状态信息（用于显示）
   */
  formatStatus(): string {
    const lines: string[] = [
      '═══════════════════════════════════════',
      `  🐝 BeeWorld 世界状态`,
      '═══════════════════════════════════════',
      `  Tick: ${this.state.tick}`,
      `  时间: ${this.state.timestamp.toLocaleString()}`,
      `  Agent 数量: ${this.state.agentCount}`,
      `  活跃事件: ${this.state.activeEvents.length}`,
      `  全局事实: ${this.state.globalFacts.length} 条`,
    ];

    const sentimentEntries = Object.entries(this.state.sentiment);
    if (sentimentEntries.length > 0) {
      lines.push('  ── 情绪地图 ──');
      for (const [topic, rawValue] of sentimentEntries.slice(0, 10)) {
        const value = rawValue as number;
        const bar = value > 0 ? '📈' : value < 0 ? '📉' : '➡️';
        lines.push(`    ${bar} ${topic}: ${value > 0 ? '+' : ''}${value.toFixed(2)}`);
      }
    }

    if (this.state.activeEvents.length > 0) {
      lines.push('  ── 最近事件 ──');
      for (const event of this.state.activeEvents.slice(-5)) {
        lines.push(`    [${event.type}] ${event.title} (重要性: ${(event.importance * 100).toFixed(0)}%)`);
      }
    }

    lines.push('═══════════════════════════════════════');
    return lines.join('\n');
  }
}
