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

  // ========================================================================
  // 补充测试 — 提高覆盖率
  // ========================================================================

  describe('trimDeduplicationWindow 精确触发', () => {
    it('恰好 windowSize*2 个事件时不触发清理', () => {
      const relay2 = new EventRelay(3);

      // 填入恰好 6 个 (3*2)，不应触发 trim
      for (let i = 0; i < 6; i++) {
        relay2.collectEvents([createTestEvent(`t${i}`)]);
      }

      // 早期事件仍在去重窗口中，重新收集应被去重
      const count = relay2.collectEvents([createTestEvent('t0')]);
      expect(count).toBe(0);
    });

    it('windowSize*2 + 1 个事件时触发清理，早期 ID 被淘汰', () => {
      const relay2 = new EventRelay(3);

      // 填入 7 个 (3*2 + 1)，应触发 trim，保留后 3 个 (t4, t5, t6)
      for (let i = 0; i < 7; i++) {
        relay2.collectEvents([createTestEvent(`t${i}`)]);
      }

      // t0 已被淘汰出去重窗口，可以重新收集
      const countOld = relay2.collectEvents([createTestEvent('t0')]);
      expect(countOld).toBe(1);

      // t6 仍在去重窗口中，应被去重
      const countRecent = relay2.collectEvents([createTestEvent('t6')]);
      expect(countRecent).toBe(0);
    });

    it('trim 后 pending 队列不受影响', () => {
      const relay2 = new EventRelay(2);

      // 填入 5 个 (2*2 + 1)，触发 trim
      for (let i = 0; i < 5; i++) {
        relay2.collectEvents([createTestEvent(`p${i}`)]);
      }

      // pending 队列应包含所有 5 个事件
      expect(relay2.getPendingCount()).toBe(5);
      const consumed = relay2.consumePendingEvents();
      expect(consumed).toHaveLength(5);
    });
  });

  describe('极端 deduplicationWindowSize', () => {
    it('windowSize=0 时每批次后都触发清理，不保留任何历史 ID', () => {
      const relay0 = new EventRelay(0);

      // 第一个事件成功收集，此时 size=1 > 0*2=0，触发 trim，保留 slice(-0) = 空
      relay0.collectEvents([createTestEvent('x1')]);

      // x1 已被清理出去重窗口，可以再次收集
      const count = relay0.collectEvents([createTestEvent('x1')]);
      expect(count).toBe(1);
    });

    it('windowSize=1 时只保留最近 1 个 ID', () => {
      const relay1 = new EventRelay(1);

      // 填入 3 个 (> 1*2=2)，触发 trim，保留后 1 个 (c2)
      relay1.collectEvents([createTestEvent('c0')]);
      relay1.collectEvents([createTestEvent('c1')]);
      relay1.collectEvents([createTestEvent('c2')]);

      // c0 应被淘汰，可重新收集
      const countOld = relay1.collectEvents([createTestEvent('c0')]);
      expect(countOld).toBe(1);

      // c2 仍在窗口中，应被去重
      const countRecent = relay1.collectEvents([createTestEvent('c2')]);
      expect(countRecent).toBe(0);
    });
  });

  describe('大批量事件去重', () => {
    it('单次 collectEvents 传入大量事件含重复 ID', () => {
      const events = [];
      for (let i = 0; i < 100; i++) {
        // 50 个唯一 ID, 每个重复一次
        events.push(createTestEvent(`batch${i % 50}`));
      }

      const count = relay.collectEvents(events);
      expect(count).toBe(50);
      expect(relay.getPendingCount()).toBe(50);
    });

    it('单次传入大量唯一事件全部被收集', () => {
      const events = [];
      for (let i = 0; i < 200; i++) {
        events.push(createTestEvent(`u${i}`));
      }

      const count = relay.collectEvents(events);
      expect(count).toBe(200);
      expect(relay.getPendingCount()).toBe(200);
    });
  });

  describe('连续多次 consumePendingEvents', () => {
    it('第一次消费后连续调用应返回空数组', () => {
      relay.collectEvents([createTestEvent('e1'), createTestEvent('e2')]);

      const first = relay.consumePendingEvents();
      expect(first).toHaveLength(2);

      const second = relay.consumePendingEvents();
      expect(second).toEqual([]);

      const third = relay.consumePendingEvents();
      expect(third).toEqual([]);

      expect(relay.getPendingCount()).toBe(0);
    });
  });

  describe('collect → consume 交替混合场景', () => {
    it('多轮交替操作状态正确', () => {
      // 第一轮 collect → consume
      relay.collectEvents([createTestEvent('r1-a'), createTestEvent('r1-b')]);
      expect(relay.getPendingCount()).toBe(2);

      const round1 = relay.consumePendingEvents();
      expect(round1).toHaveLength(2);
      expect(relay.getPendingCount()).toBe(0);

      // 第二轮 collect → consume（新 ID）
      const count2 = relay.collectEvents([createTestEvent('r2-a'), createTestEvent('r2-b')]);
      expect(count2).toBe(2);
      expect(relay.getPendingCount()).toBe(2);

      const round2 = relay.consumePendingEvents();
      expect(round2).toHaveLength(2);
      expect(round2[0]!.id).toBe('r2-a');
      expect(round2[1]!.id).toBe('r2-b');

      // 第三轮 — 混合新旧 ID
      const count3 = relay.collectEvents([
        createTestEvent('r1-a'), // 旧 ID，应被去重
        createTestEvent('r3-a'), // 新 ID
      ]);
      expect(count3).toBe(1); // 只有 r3-a 通过
      expect(relay.getPendingCount()).toBe(1);

      const round3 = relay.consumePendingEvents();
      expect(round3).toHaveLength(1);
      expect(round3[0]!.id).toBe('r3-a');
    });

    it('consume 不影响去重窗口中的 ID', () => {
      relay.collectEvents([createTestEvent('keep1')]);
      relay.consumePendingEvents();

      // 队列已空，但 keep1 仍在去重窗口
      relay.collectEvents([createTestEvent('keep1')]);
      expect(relay.getPendingCount()).toBe(0);
    });
  });

  describe('只按 ID 去重，不按其他字段', () => {
    it('不同 ID 但其他字段完全相同的事件不被去重', () => {
      const sharedFields: Partial<WorldEvent> = {
        type: 'external',
        category: 'general',
        title: '相同标题',
        content: '相同内容',
        source: 'agent',
        importance: 0.8,
        propagationRadius: 0.5,
        tick: 42,
        tags: ['tag1'],
      };

      const count = relay.collectEvents([
        createTestEvent('diff-id-1', sharedFields),
        createTestEvent('diff-id-2', sharedFields),
        createTestEvent('diff-id-3', sharedFields),
      ]);

      expect(count).toBe(3);
      expect(relay.getPendingCount()).toBe(3);

      const consumed = relay.consumePendingEvents();
      expect(consumed.map((e) => e.id)).toEqual(['diff-id-1', 'diff-id-2', 'diff-id-3']);
    });

    it('相同 ID 但不同内容的事件仍被去重', () => {
      const count = relay.collectEvents([
        createTestEvent('same-id', { title: '标题A', content: '内容A', importance: 0.1 }),
        createTestEvent('same-id', { title: '标题B', content: '内容B', importance: 0.9 }),
      ]);

      expect(count).toBe(1);
      expect(relay.getPendingCount()).toBe(1);

      // 保留的是第一个出现的事件
      const consumed = relay.consumePendingEvents();
      expect(consumed[0]!.title).toBe('标题A');
      expect(consumed[0]!.importance).toBe(0.1);
    });
  });
});
