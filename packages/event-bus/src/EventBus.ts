// ============================================================================
// EventBus — 事件总线，事件分发与管理
// ============================================================================

import type { WorldEvent, EventType, EventCategory } from '@beeclaw/shared';
import { generateId } from '@beeclaw/shared';

/** 事件监听器回调 */
export type EventListener = (event: WorldEvent) => void | Promise<void>;

export class EventBus {
  private queue: WorldEvent[] = [];
  private history: WorldEvent[] = [];
  private listeners: Map<string, EventListener[]> = new Map();
  private retentionTicks: number;

  constructor(retentionTicks: number = 100) {
    this.retentionTicks = retentionTicks;
  }

  /**
   * 注入一个外部事件
   */
  injectEvent(params: {
    title: string;
    content: string;
    category?: EventCategory;
    source?: string;
    importance?: number;
    propagationRadius?: number;
    tick: number;
    tags?: string[];
    type?: EventType;
  }): WorldEvent {
    const event: WorldEvent = {
      id: generateId('evt'),
      type: params.type ?? 'external',
      category: params.category ?? 'general',
      title: params.title,
      content: params.content,
      source: params.source ?? 'manual',
      importance: params.importance ?? 0.5,
      propagationRadius: params.propagationRadius ?? 0.3,
      tick: params.tick,
      tags: params.tags ?? [],
    };

    this.queue.push(event);
    this.history.push(event);
    console.log(`[EventBus] 事件注入: "${event.title}" (重要性: ${(event.importance * 100).toFixed(0)}%, Tick: ${event.tick})`);

    // 触发监听器
    this.notifyListeners(event);

    return event;
  }

  /**
   * 创建 Agent 产生的内部事件
   */
  emitAgentEvent(params: {
    agentId: string;
    agentName: string;
    title: string;
    content: string;
    category?: EventCategory;
    importance?: number;
    propagationRadius?: number;
    tick: number;
    tags?: string[];
  }): WorldEvent {
    return this.injectEvent({
      ...params,
      type: 'agent_action',
      source: `agent:${params.agentId}(${params.agentName})`,
      importance: params.importance ?? 0.3,
      propagationRadius: params.propagationRadius ?? 0.15,
    });
  }

  /**
   * 消费当前队列中的所有事件
   */
  consumeEvents(): WorldEvent[] {
    const events = [...this.queue];
    this.queue = [];
    return events;
  }

  /**
   * 查看队列中的事件（不消费）
   */
  peekEvents(): WorldEvent[] {
    return [...this.queue];
  }

  /**
   * 获取指定 tick 的历史事件
   */
  getEventsAtTick(tick: number): WorldEvent[] {
    return this.history.filter(e => e.tick === tick);
  }

  /**
   * 获取最近 N 个事件
   */
  getRecentEvents(n: number = 10): WorldEvent[] {
    return this.history.slice(-n);
  }

  /**
   * 获取活跃事件（在保留期内）
   */
  getActiveEvents(currentTick: number): WorldEvent[] {
    const threshold = currentTick - this.retentionTicks;
    return this.history.filter(e => e.tick >= threshold);
  }

  /**
   * 注册事件监听器
   */
  on(eventType: string, listener: EventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
  }

  /**
   * 通知监听器
   */
  private notifyListeners(event: WorldEvent): void {
    // 通知特定类型监听器
    const typeListeners = this.listeners.get(event.type) ?? [];
    for (const listener of typeListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[EventBus] Listener error:', err);
      }
    }

    // 通知通配监听器
    const allListeners = this.listeners.get('*') ?? [];
    for (const listener of allListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[EventBus] Listener error:', err);
      }
    }
  }

  /**
   * 清理过期历史事件
   */
  cleanup(currentTick: number): number {
    const threshold = currentTick - this.retentionTicks;
    const before = this.history.length;
    this.history = this.history.filter(e => e.tick >= threshold);
    return before - this.history.length;
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 获取历史事件总数
   */
  getHistoryLength(): number {
    return this.history.length;
  }
}
