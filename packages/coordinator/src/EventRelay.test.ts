// ============================================================================
// @beeclaw/coordinator EventRelay 单元测试
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { EventRelay } from './EventRelay.js';
import type { WorldEvent } from '@beeclaw/shared';

function createTestEvent(id: string, overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id,
    type: 'agent_action',
    category: 'general',
    title: `事件 ${id}`,
    content: `事件 ${id} 内容`,
    source: 'agent',
    importance: 0.5,
    propagationRadius: 0.3,
    tick: 1,
    tags: [],
    ...overrides,
  };
}

describe('EventRelay', () => {
  let relay: EventRelay;

  beforeEach(() => {
    relay = new EventRelay();
  });

  describe('collectEvents', () => {
    it('应收集事件并返回收集数量', () => {
      const events = [createTestEvent('e1'), createTestEvent('e2')];
      const count = relay.collectEvents(events);

      expect(count).toBe(2);
      expect(relay.getPendingCount()).toBe(2);
    });

    it('应对重复事件去重', () => {
      const events = [createTestEvent('e1'), createTestEvent('e1')];
      const count = relay.collectEvents(events);

      expect(count).toBe(1);
      expect(relay.getPendingCount()).toBe(1);
    });

    it('跨批次去重', () => {
      relay.collectEvents([createTestEvent('e1')]);
      const count = relay.collectEvents([createTestEvent('e1'), createTestEvent('e2')]);

      expect(count).toBe(1); // 只有 e2 是新的
      expect(relay.getPendingCount()).toBe(2);
    });

    it('空事件列表返回 0', () => {
      const count = relay.collectEvents([]);
      expect(count).toBe(0);
      expect(relay.getPendingCount()).toBe(0);
    });
  });

  describe('consumePendingEvents', () => {
    it('应返回所有待分发事件并清空队列', () => {
      relay.collectEvents([createTestEvent('e1'), createTestEvent('e2')]);

      const consumed = relay.consumePendingEvents();

      expect(consumed).toHaveLength(2);
      expect(consumed[0]!.id).toBe('e1');
      expect(consumed[1]!.id).toBe('e2');
      expect(relay.getPendingCount()).toBe(0);
    });

    it('空队列返回空数组', () => {
      const consumed = relay.consumePendingEvents();
      expect(consumed).toEqual([]);
    });

    it('消费后再收集同 ID 事件仍去重', () => {
      relay.collectEvents([createTestEvent('e1')]);
      relay.consumePendingEvents();

      // 再次收集同 ID 事件，应被去重
      const count = relay.collectEvents([createTestEvent('e1')]);
      expect(count).toBe(0);
    });
  });

  describe('去重窗口', () => {
    it('超出窗口大小时应自动清理', () => {
      const smallWindowRelay = new EventRelay(5);

      // 填充超过 2x 窗口大小的事件
      for (let i = 0; i < 12; i++) {
        smallWindowRelay.collectEvents([createTestEvent(`e${i}`)]);
      }

      // 早期事件应该被从去重窗口中清理
      // 重新收集早期事件应该可以通过（因为已不在去重窗口内）
      const count = smallWindowRelay.collectEvents([createTestEvent('e0')]);
      expect(count).toBe(1);
    });
  });

  describe('reset', () => {
    it('应清空所有状态', () => {
      relay.collectEvents([createTestEvent('e1'), createTestEvent('e2')]);

      relay.reset();

      expect(relay.getPendingCount()).toBe(0);
      expect(relay.consumePendingEvents()).toEqual([]);

      // reset 后同 ID 事件应该可以重新收集
      const count = relay.collectEvents([createTestEvent('e1')]);
      expect(count).toBe(1);
    });
  });

  describe('getPendingCount', () => {
    it('应返回正确的待分发数量', () => {
      expect(relay.getPendingCount()).toBe(0);

      relay.collectEvents([createTestEvent('e1')]);
      expect(relay.getPendingCount()).toBe(1);

      relay.collectEvents([createTestEvent('e2'), createTestEvent('e3')]);
      expect(relay.getPendingCount()).toBe(3);

      relay.consumePendingEvents();
      expect(relay.getPendingCount()).toBe(0);
    });
  });
});
