// ============================================================================
// @beeclaw/server 单元测试
// 测试 API 路由注册函数 + Store 持久化 + WebSocket 广播
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from './persistence/database.js';
import { Store } from './persistence/store.js';
import { broadcast, getConnectionCount } from './ws/handler.js';
import type { TickResult } from '@beeclaw/world-engine';

// ── Database + Store 测试 ──

describe('initDatabase', () => {
  it('应该创建内存数据库并建表', () => {
    // 使用 :memory: 避免磁盘 I/O
    const db = initDatabase(':memory:');
    expect(db).toBeDefined();

    // 验证表已创建
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('world_state');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('tick_history');
    expect(tableNames).toContain('consensus_signals');

    db.close();
  });
});

describe('Store', () => {
  let db: ReturnType<typeof initDatabase>;
  let store: Store;

  beforeEach(() => {
    db = initDatabase(':memory:');
    store = new Store(db);
  });

  // ── KV State ──

  it('getState / setState 应正确读写', () => {
    expect(store.getState('nonexist')).toBeUndefined();
    store.setState('hello', 'world');
    expect(store.getState('hello')).toBe('world');
  });

  it('setState 覆盖已有值', () => {
    store.setState('key', 'v1');
    store.setState('key', 'v2');
    expect(store.getState('key')).toBe('v2');
  });

  it('getTick / setTick 应正确读写', () => {
    expect(store.getTick()).toBe(0);
    store.setTick(42);
    expect(store.getTick()).toBe(42);
  });

  // ── Tick History ──

  it('saveTickResult / getTickHistory 应正确读写', () => {
    const result: TickResult = {
      tick: 1,
      eventsProcessed: 3,
      agentsActivated: 5,
      responsesCollected: 4,
      newAgentsSpawned: 0,
      signals: 1,
      durationMs: 120,
    };

    store.saveTickResult(result);

    const history = store.getTickHistory(10);
    expect(history.length).toBe(1);
    expect(history[0]!.tick).toBe(1);
    expect(history[0]!.eventsProcessed).toBe(3);
    expect(history[0]!.agentsActivated).toBe(5);
    expect(history[0]!.responsesCollected).toBe(4);
    expect(history[0]!.durationMs).toBe(120);
  });

  it('getTickHistory 应按 tick 降序排列', () => {
    for (let i = 1; i <= 5; i++) {
      store.saveTickResult({
        tick: i,
        eventsProcessed: i,
        agentsActivated: 0,
        responsesCollected: 0,
        newAgentsSpawned: 0,
        signals: 0,
        durationMs: 10,
      });
    }

    const history = store.getTickHistory(3);
    expect(history.length).toBe(3);
    expect(history[0]!.tick).toBe(5);
    expect(history[1]!.tick).toBe(4);
    expect(history[2]!.tick).toBe(3);
  });

  // ── Consensus Signals ──

  it('saveConsensusSignal / getLatestSignals 应正确读写', () => {
    const signal = {
      tick: 1,
      topic: '股市',
      sentimentDistribution: { bullish: 0.6, bearish: 0.2, neutral: 0.2 },
      averageConfidence: 0.7,
      dominantStance: 'bullish' as const,
      consensusDegree: 0.6,
      participantCount: 5,
      trend: 'forming' as const,
      alerts: [],
    };

    store.saveConsensusSignal(signal);

    const signals = store.getLatestSignals(10);
    expect(signals.length).toBe(1);
    expect(signals[0]!.topic).toBe('股市');
    expect(signals[0]!.tick).toBe(1);
  });

  it('getSignalsByTopic 应按 topic 过滤', () => {
    const signal1 = {
      tick: 1,
      topic: '股市',
      sentimentDistribution: { bullish: 0.5, bearish: 0.3, neutral: 0.2 },
      averageConfidence: 0.6,
      dominantStance: 'bullish' as const,
      consensusDegree: 0.5,
      participantCount: 3,
      trend: 'forming' as const,
      alerts: [],
    };
    const signal2 = {
      tick: 2,
      topic: '科技',
      sentimentDistribution: { bullish: 0.4, bearish: 0.4, neutral: 0.2 },
      averageConfidence: 0.5,
      dominantStance: 'neutral' as const,
      consensusDegree: 0.3,
      participantCount: 4,
      trend: 'forming' as const,
      alerts: [],
    };

    store.saveConsensusSignal(signal1);
    store.saveConsensusSignal(signal2);

    const stockSignals = store.getSignalsByTopic('股市');
    expect(stockSignals.length).toBe(1);
    expect(stockSignals[0]!.topic).toBe('股市');

    const techSignals = store.getSignalsByTopic('科技');
    expect(techSignals.length).toBe(1);
    expect(techSignals[0]!.topic).toBe('科技');
  });

  // ── Agents（基础 row 操作）──

  it('loadAgentRows 初始应为空', () => {
    const rows = store.loadAgentRows();
    expect(rows).toEqual([]);
  });
});

// ── WebSocket handler 测试 ──

describe('ws/handler', () => {
  it('getConnectionCount 初始为 0', () => {
    // 不注册任何连接时应为 0
    expect(getConnectionCount()).toBe(0);
  });

  it('broadcast 在无连接时不报错', () => {
    // 即使没有客户端也不应抛出
    expect(() => broadcast('test', { hello: 'world' })).not.toThrow();
  });
});
