// ============================================================================
// @beeclaw/event-bus EventBus 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './EventBus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    // 静默 console.log
    vi.spyOn(console, 'log').mockImplementation(() => {});
    bus = new EventBus(10); // retentionTicks = 10
  });

  // ── 事件注入 ──

  describe('injectEvent', () => {
    it('应创建事件并加入队列和历史', () => {
      const event = bus.injectEvent({
        title: '央行降息',
        content: '央行宣布降息 25 个基点',
        tick: 1,
      });

      expect(event.id).toMatch(/^evt_/);
      expect(event.title).toBe('央行降息');
      expect(event.content).toBe('央行宣布降息 25 个基点');
      expect(event.type).toBe('external');
      expect(event.category).toBe('general');
      expect(event.source).toBe('manual');
      expect(event.importance).toBe(0.5);
      expect(event.propagationRadius).toBe(0.3);
      expect(event.tick).toBe(1);
      expect(event.tags).toEqual([]);

      expect(bus.getQueueLength()).toBe(1);
      expect(bus.getHistoryLength()).toBe(1);
    });

    it('应支持自定义所有参数', () => {
      const event = bus.injectEvent({
        title: '测试',
        content: '内容',
        category: 'finance',
        source: 'api',
        importance: 0.9,
        propagationRadius: 0.8,
        tick: 5,
        tags: ['金融', '利率'],
        type: 'system',
      });

      expect(event.category).toBe('finance');
      expect(event.source).toBe('api');
      expect(event.importance).toBe(0.9);
      expect(event.propagationRadius).toBe(0.8);
      expect(event.type).toBe('system');
      expect(event.tags).toEqual(['金融', '利率']);
    });

    it('多次注入应累积在队列中', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.injectEvent({ title: 'B', content: 'b', tick: 2 });
      bus.injectEvent({ title: 'C', content: 'c', tick: 3 });

      expect(bus.getQueueLength()).toBe(3);
      expect(bus.getHistoryLength()).toBe(3);
    });
  });

  // ── Agent 事件 ──

  describe('emitAgentEvent', () => {
    it('应创建 agent_action 类型的事件', () => {
      const event = bus.emitAgentEvent({
        agentId: 'agent_001',
        agentName: '张明',
        title: '张明的观点',
        content: '我认为市场将会上涨',
        tick: 5,
      });

      expect(event.type).toBe('agent_action');
      expect(event.source).toBe('agent:agent_001(张明)');
      expect(event.importance).toBe(0.3);
      expect(event.propagationRadius).toBe(0.15);
    });

    it('应支持自定义重要性', () => {
      const event = bus.emitAgentEvent({
        agentId: 'agent_002',
        agentName: '李华',
        title: '预测',
        content: '重大预测',
        tick: 3,
        importance: 0.7,
      });

      expect(event.importance).toBe(0.7);
    });
  });

  // ── 消费事件 ──

  describe('consumeEvents', () => {
    it('应返回所有队列中的事件并清空队列', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.injectEvent({ title: 'B', content: 'b', tick: 2 });

      const events = bus.consumeEvents();
      expect(events).toHaveLength(2);
      expect(events[0]!.title).toBe('A');
      expect(events[1]!.title).toBe('B');

      // 队列被清空
      expect(bus.getQueueLength()).toBe(0);
      // 历史保留
      expect(bus.getHistoryLength()).toBe(2);
    });

    it('空队列应返回空数组', () => {
      expect(bus.consumeEvents()).toEqual([]);
    });

    it('消费后再注入应只返回新事件', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.consumeEvents();

      bus.injectEvent({ title: 'B', content: 'b', tick: 2 });
      const events = bus.consumeEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.title).toBe('B');
    });
  });

  // ── peekEvents ──

  describe('peekEvents', () => {
    it('应返回队列副本而不清空队列', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      const peeked = bus.peekEvents();
      expect(peeked).toHaveLength(1);
      expect(bus.getQueueLength()).toBe(1); // 未清空
    });
  });

  // ── 历史查询 ──

  describe('getEventsAtTick', () => {
    it('应返回指定 tick 的事件', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.injectEvent({ title: 'B', content: 'b', tick: 2 });
      bus.injectEvent({ title: 'C', content: 'c', tick: 2 });

      const eventsAtTick2 = bus.getEventsAtTick(2);
      expect(eventsAtTick2).toHaveLength(2);
      expect(eventsAtTick2.map(e => e.title)).toEqual(['B', 'C']);
    });

    it('无事件的 tick 应返回空数组', () => {
      expect(bus.getEventsAtTick(999)).toEqual([]);
    });
  });

  describe('getRecentEvents', () => {
    it('应返回最近 N 个事件', () => {
      for (let i = 1; i <= 20; i++) {
        bus.injectEvent({ title: `Event ${i}`, content: `${i}`, tick: i });
      }

      const recent = bus.getRecentEvents(5);
      expect(recent).toHaveLength(5);
      expect(recent[0]!.title).toBe('Event 16');
      expect(recent[4]!.title).toBe('Event 20');
    });

    it('默认返回最近 10 个', () => {
      for (let i = 1; i <= 20; i++) {
        bus.injectEvent({ title: `E${i}`, content: `${i}`, tick: i });
      }
      const recent = bus.getRecentEvents();
      expect(recent).toHaveLength(10);
    });
  });

  describe('getActiveEvents', () => {
    it('应返回保留期内的事件', () => {
      // retentionTicks = 10
      bus.injectEvent({ title: 'old', content: 'old', tick: 1 });
      bus.injectEvent({ title: 'recent', content: 'recent', tick: 15 });

      const active = bus.getActiveEvents(15);
      // threshold = 15 - 10 = 5, tick >= 5 的事件
      expect(active).toHaveLength(1);
      expect(active[0]!.title).toBe('recent');
    });
  });

  // ── 事件监听 ──

  describe('on / listeners', () => {
    it('应在事件注入时通知对应类型监听器', () => {
      const listener = vi.fn();
      bus.on('external', listener);

      const event = bus.injectEvent({ title: 'Test', content: 'test', tick: 1 });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('不匹配的类型不应触发监听器', () => {
      const listener = vi.fn();
      bus.on('system', listener);

      bus.injectEvent({ title: 'Test', content: 'test', tick: 1 }); // type=external

      expect(listener).not.toHaveBeenCalled();
    });

    it('通配监听器（*）应接收所有事件', () => {
      const listener = vi.fn();
      bus.on('*', listener);

      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.emitAgentEvent({
        agentId: 'agent_001',
        agentName: '张明',
        title: 'B',
        content: 'b',
        tick: 2,
      });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('监听器抛出异常不应影响事件处理', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      bus.on('external', () => {
        throw new Error('listener error');
      });

      // 不应抛出
      expect(() => bus.injectEvent({ title: 'Test', content: 'test', tick: 1 })).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // ── cleanup ──

  describe('cleanup', () => {
    it('应清除过期事件', () => {
      bus.injectEvent({ title: 'old1', content: '', tick: 1 });
      bus.injectEvent({ title: 'old2', content: '', tick: 3 });
      bus.injectEvent({ title: 'new1', content: '', tick: 12 });
      bus.injectEvent({ title: 'new2', content: '', tick: 15 });

      // retentionTicks = 10, currentTick = 15, threshold = 5
      const removed = bus.cleanup(15);
      expect(removed).toBe(2); // tick 1 和 3 被清除
      expect(bus.getHistoryLength()).toBe(2);
    });

    it('无过期事件时应返回 0', () => {
      bus.injectEvent({ title: 'A', content: '', tick: 10 });
      expect(bus.cleanup(10)).toBe(0);
    });
  });
});
