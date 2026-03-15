// ============================================================================
// BeeClaw Benchmark — EventBus 高并发事件分发性能
// 测试事件注入、消费、监听器分发和清理性能
// ============================================================================

import { bench, describe } from 'vitest';
import { EventBus } from '@beeclaw/event-bus';
import type { EventCategory } from '@beeclaw/shared';

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function createEventBus(retention = 100): EventBus {
  return new EventBus(retention);
}

const CATEGORIES: EventCategory[] = ['finance', 'politics', 'tech', 'social', 'general'];

function injectBatch(bus: EventBus, count: number, tick: number): void {
  for (let i = 0; i < count; i++) {
    bus.injectEvent({
      title: `事件-${i}`,
      content: `测试事件内容 #${i}`,
      category: CATEGORIES[i % CATEGORIES.length],
      source: 'benchmark',
      importance: Math.random(),
      propagationRadius: Math.random(),
      tick,
      tags: ['bench'],
    });
  }
}

// ── 事件注入性能 ───────────────────────────────────────────────────────────────

describe('EventBus — 事件注入', () => {
  bench(
    '100 事件批量注入',
    () => {
      const bus = createEventBus();
      injectBatch(bus, 100, 1);
    },
    { iterations: 200, warmupIterations: 20 },
  );

  bench(
    '500 事件批量注入',
    () => {
      const bus = createEventBus();
      injectBatch(bus, 500, 1);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '1000 事件批量注入',
    () => {
      const bus = createEventBus();
      injectBatch(bus, 1000, 1);
    },
    { iterations: 30, warmupIterations: 3 },
  );

  bench(
    '5000 事件批量注入',
    () => {
      const bus = createEventBus();
      injectBatch(bus, 5000, 1);
    },
    { iterations: 10, warmupIterations: 2 },
  );
});

// ── 事件消费性能 ───────────────────────────────────────────────────────────────

describe('EventBus — 事件消费', () => {
  bench(
    '消费 1000 事件 (consumeEvents)',
    () => {
      const bus = createEventBus();
      injectBatch(bus, 1000, 1);
      bus.consumeEvents();
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '查看 1000 事件 (peekEvents)',
    () => {
      const bus = createEventBus();
      injectBatch(bus, 1000, 1);
      bus.peekEvents();
    },
    { iterations: 50, warmupIterations: 5 },
  );
});

// ── 监听器分发性能 ─────────────────────────────────────────────────────────────

describe('EventBus — 监听器分发', () => {
  bench(
    '10 监听器 × 100 事件',
    () => {
      const bus = createEventBus();
      // 注册 10 个监听器
      for (let i = 0; i < 10; i++) {
        bus.on('*', () => {});
      }
      injectBatch(bus, 100, 1);
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    '50 监听器 × 100 事件',
    () => {
      const bus = createEventBus();
      for (let i = 0; i < 50; i++) {
        bus.on('*', () => {});
      }
      injectBatch(bus, 100, 1);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '10 监听器 × 1000 事件',
    () => {
      const bus = createEventBus();
      for (let i = 0; i < 10; i++) {
        bus.on('*', () => {});
      }
      injectBatch(bus, 1000, 1);
    },
    { iterations: 30, warmupIterations: 3 },
  );
});

// ── Agent 事件发射性能 ─────────────────────────────────────────────────────────

describe('EventBus — Agent 事件发射', () => {
  bench(
    '500 Agent 同时发射事件',
    () => {
      const bus = createEventBus();
      for (let i = 0; i < 500; i++) {
        bus.emitAgentEvent({
          agentId: `agent_${i}`,
          agentName: `Agent-${i}`,
          title: `Agent ${i} 的观点`,
          content: '看好后市发展',
          category: 'finance',
          importance: 0.5,
          propagationRadius: 0.3,
          tick: 1,
          tags: ['观点'],
        });
      }
    },
    { iterations: 50, warmupIterations: 5 },
  );
});

// ── 历史查询与清理性能 ─────────────────────────────────────────────────────────

describe('EventBus — 历史查询 & 清理', () => {
  bench(
    'getRecentEvents (10000 历史中取最近 50)',
    () => {
      const bus = createEventBus(200);
      // 预填充历史
      for (let t = 1; t <= 100; t++) {
        injectBatch(bus, 100, t);
        bus.consumeEvents();
      }
      bus.getRecentEvents(50);
    },
    { iterations: 10, warmupIterations: 2 },
  );

  bench(
    'cleanup — 清理过期事件 (10000 条历史)',
    () => {
      const bus = createEventBus(50);
      for (let t = 1; t <= 100; t++) {
        injectBatch(bus, 100, t);
        bus.consumeEvents();
      }
      bus.cleanup(100);
    },
    { iterations: 10, warmupIterations: 2 },
  );
});
