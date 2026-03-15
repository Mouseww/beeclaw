// ============================================================================
// @beeclaw/event-bus 补充测试
// 覆盖 index.ts 导出 + EventBus 额外边界用例
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './index.js';
import type { EventListener } from './index.js';

describe('index.ts 导出', () => {
  it('应正确导出 EventBus 类', () => {
    expect(EventBus).toBeDefined();
    expect(typeof EventBus).toBe('function');
    const bus = new EventBus();
    expect(bus).toBeInstanceOf(EventBus);
  });
});

describe('EventBus 补充测试', () => {
  let bus: EventBus;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bus = new EventBus(10);
  });

  // ── emitAgentEvent 补充 ──

  describe('emitAgentEvent 补充', () => {
    it('应支持自定义 category 和 tags', () => {
      const event = bus.emitAgentEvent({
        agentId: 'agent_003',
        agentName: '王芳',
        title: '市场分析',
        content: '发布市场分析报告',
        category: 'finance',
        tags: ['分析', '报告'],
        tick: 10,
      });

      expect(event.category).toBe('finance');
      expect(event.tags).toEqual(['分析', '报告']);
    });

    it('应支持自定义 propagationRadius', () => {
      const event = bus.emitAgentEvent({
        agentId: 'agent_004',
        agentName: '赵强',
        title: '重大发现',
        content: '一个重大发现',
        propagationRadius: 0.9,
        tick: 5,
      });

      expect(event.propagationRadius).toBe(0.9);
    });

    it('默认 category 应为 general', () => {
      const event = bus.emitAgentEvent({
        agentId: 'agent_005',
        agentName: '刘明',
        title: '日常',
        content: '日常活动',
        tick: 1,
      });

      expect(event.category).toBe('general');
    });
  });

  // ── peekEvents 补充 ──

  describe('peekEvents 补充', () => {
    it('空队列应返回空数组', () => {
      expect(bus.peekEvents()).toEqual([]);
    });

    it('多次 peek 不应改变队列状态', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.injectEvent({ title: 'B', content: 'b', tick: 2 });

      const first = bus.peekEvents();
      const second = bus.peekEvents();

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(2);
      expect(bus.getQueueLength()).toBe(2);
    });

    it('peek 返回的应是副本，修改不影响原队列', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      const peeked = bus.peekEvents();
      peeked.pop();

      expect(bus.getQueueLength()).toBe(1);
    });
  });

  // ── getRecentEvents 补充 ──

  describe('getRecentEvents 补充', () => {
    it('请求数量大于历史长度时应返回全部', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.injectEvent({ title: 'B', content: 'b', tick: 2 });

      const recent = bus.getRecentEvents(100);
      expect(recent).toHaveLength(2);
    });

    it('空历史应返回空数组', () => {
      expect(bus.getRecentEvents(5)).toEqual([]);
    });
  });

  // ── getActiveEvents 补充 ──

  describe('getActiveEvents 补充', () => {
    it('所有事件都在保留期内时应全部返回', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 5 });
      bus.injectEvent({ title: 'B', content: 'b', tick: 8 });

      const active = bus.getActiveEvents(10);
      // threshold = 10 - 10 = 0, 所有 tick >= 0
      expect(active).toHaveLength(2);
    });

    it('所有事件都过期时应返回空数组', () => {
      bus.injectEvent({ title: 'A', content: 'a', tick: 1 });
      bus.injectEvent({ title: 'B', content: 'b', tick: 2 });

      const active = bus.getActiveEvents(100);
      // threshold = 100 - 10 = 90, 没有 tick >= 90 的
      expect(active).toHaveLength(0);
    });

    it('边界 tick 的事件应被保留', () => {
      // retentionTicks = 10, currentTick = 15, threshold = 5
      bus.injectEvent({ title: 'boundary', content: '', tick: 5 });
      bus.injectEvent({ title: 'before', content: '', tick: 4 });

      const active = bus.getActiveEvents(15);
      expect(active).toHaveLength(1);
      expect(active[0]!.title).toBe('boundary');
    });
  });

  // ── 多监听器 ──

  describe('多监听器', () => {
    it('同类型多个监听器都应被调用', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      bus.on('external', listener1);
      bus.on('external', listener2);

      bus.injectEvent({ title: 'Test', content: 'test', tick: 1 });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('特定类型和通配监听器都应被调用', () => {
      const typedListener = vi.fn();
      const wildcardListener = vi.fn();
      bus.on('external', typedListener);
      bus.on('*', wildcardListener);

      bus.injectEvent({ title: 'Test', content: 'test', tick: 1 });

      expect(typedListener).toHaveBeenCalledOnce();
      expect(wildcardListener).toHaveBeenCalledOnce();
    });

    it('通配监听器异常不应影响后续通配监听器', () => {
      const listener1 = vi.fn(() => { throw new Error('fail'); });
      const listener2 = vi.fn();
      bus.on('*', listener1);
      bus.on('*', listener2);

      bus.injectEvent({ title: 'Test', content: 'test', tick: 1 });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });
  });

  // ── cleanup 补充 ──

  describe('cleanup 补充', () => {
    it('清理后不应影响队列中的事件', () => {
      bus.injectEvent({ title: 'old', content: '', tick: 1 });
      bus.injectEvent({ title: 'new', content: '', tick: 15 });

      bus.cleanup(15);

      // 队列中的事件仍然存在
      expect(bus.getQueueLength()).toBe(2);
      // 但历史中只剩下新事件
      expect(bus.getHistoryLength()).toBe(1);
    });

    it('多次清理应是幂等的', () => {
      bus.injectEvent({ title: 'A', content: '', tick: 1 });
      bus.injectEvent({ title: 'B', content: '', tick: 15 });

      const first = bus.cleanup(15);
      const second = bus.cleanup(15);

      expect(first).toBe(1);
      expect(second).toBe(0);
    });
  });

  // ── 默认 retentionTicks ──

  describe('默认 retentionTicks', () => {
    it('默认值应为 100', () => {
      const defaultBus = new EventBus();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      // 在 tick 1 注入，在 currentTick 100 时 threshold = 0，应该保留
      defaultBus.injectEvent({ title: 'A', content: '', tick: 1 });
      const active = defaultBus.getActiveEvents(100);
      expect(active).toHaveLength(1);

      // 在 currentTick 102 时 threshold = 2，tick=1 应被过滤
      const active2 = defaultBus.getActiveEvents(102);
      expect(active2).toHaveLength(0);
    });
  });
});
