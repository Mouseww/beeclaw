// ============================================================================
// EventRelay — 跨 Worker 事件中继
// 收集各 Worker 产生的内部事件，在下一 Tick 分发
// ============================================================================

import type { WorldEvent } from '@beeclaw/shared';

export class EventRelay {
  /** 待在下一 tick 分发的事件队列 */
  private pendingEvents: WorldEvent[] = [];
  /** 已处理事件 ID 集合（去重用） */
  private processedEventIds: Set<string> = new Set();
  /** 去重窗口大小 */
  private readonly deduplicationWindowSize: number;

  constructor(deduplicationWindowSize: number = 1000) {
    this.deduplicationWindowSize = deduplicationWindowSize;
  }

  /**
   * 收集 Worker 上报的新事件（去重）
   */
  collectEvents(events: WorldEvent[]): number {
    let collected = 0;
    for (const event of events) {
      if (this.processedEventIds.has(event.id)) {
        continue; // 已处理，跳过
      }
      this.processedEventIds.add(event.id);
      this.pendingEvents.push(event);
      collected++;
    }

    // 清理去重窗口
    if (this.processedEventIds.size > this.deduplicationWindowSize * 2) {
      this.trimDeduplicationWindow();
    }

    return collected;
  }

  /**
   * 消费所有待分发事件（清空队列）
   */
  consumePendingEvents(): WorldEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /**
   * 查看待分发事件数量
   */
  getPendingCount(): number {
    return this.pendingEvents.length;
  }

  /**
   * 清理去重窗口，保留最近的 N 个
   */
  private trimDeduplicationWindow(): void {
    const ids = [...this.processedEventIds];
    const keep = ids.slice(-this.deduplicationWindowSize);
    this.processedEventIds = new Set(keep);
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.pendingEvents = [];
    this.processedEventIds.clear();
  }
}
