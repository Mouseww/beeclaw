// ============================================================================
// @beeclaw/server — /api/consensus 路由测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ConsensusSignal } from '@beeclaw/shared';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerConsensusRoute } from './consensus.js';

// ── 共享 setup ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(0);
});

afterEach(async () => {
  await testCtx.app.close();
});

// ── Mock 数据 ──

function createMockSignal(overrides?: Partial<ConsensusSignal>): ConsensusSignal {
  return {
    topic: 'market-trend',
    tick: 1,
    sentimentDistribution: { bullish: 5, bearish: 3, neutral: 2 },
    intensity: 0.7,
    consensus: 0.6,
    trend: 'forming',
    topArguments: [],
    alerts: [],
    ...overrides,
  };
}

// ════════════════════════════════════════
// GET /api/consensus — 内存模式（默认）
// ════════════════════════════════════════

describe('GET /api/consensus (memory)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerConsensusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('无 topic 参数时应返回 topics 和 latest', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/consensus' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('topics');
    expect(body).toHaveProperty('latest');
    expect(Array.isArray(body.topics)).toBe(true);
    expect(Array.isArray(body.latest)).toBe(true);
  });

  it('指定 topic 时应返回对应信号历史', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/consensus?topic=市场走势',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.topic).toBe('市场走势');
    expect(body).toHaveProperty('signals');
    expect(Array.isArray(body.signals)).toBe(true);
  });

  it('应支持 limit 参数', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/consensus?topic=test&limit=5',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.signals.length).toBeLessThanOrEqual(5);
  });
});

// ════════════════════════════════════════
// GET /api/consensus — 数据库模式（from_db=true）
// ════════════════════════════════════════

describe('GET /api/consensus (from_db=true)', () => {
  let app: FastifyInstance;

  describe('无 topic 参数时', () => {
    beforeEach(async () => {
      const signals = [createMockSignal({ topic: 'topic-a' }), createMockSignal({ topic: 'topic-b' })];
      vi.spyOn(testCtx.store, 'getLatestSignals').mockReturnValue(signals);
      registerConsensusRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 latest 和 source=db', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/consensus?from_db=true',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('latest');
      expect(body.source).toBe('db');
      expect(body.latest).toHaveLength(2);
    });

    it('应将原始计数转换为百分比（normalization）', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/consensus?from_db=true',
      });
      const body = res.json();
      const dist = body.latest[0].sentimentDistribution;
      // 5+3+2=10 → bullish:50%, bearish:30%, neutral:20%
      expect(dist.bullish).toBe(50);
      expect(dist.bearish).toBe(30);
      expect(dist.neutral).toBe(20);
    });
  });

  describe('有 topic 参数时', () => {
    beforeEach(async () => {
      const signals = [
        createMockSignal({ topic: 'finance', tick: 1 }),
        createMockSignal({ topic: 'finance', tick: 2 }),
      ];
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockReturnValue(signals);
      registerConsensusRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 topic 信号和 source=db', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/consensus?from_db=true&topic=finance',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.topic).toBe('finance');
      expect(body.source).toBe('db');
      expect(body.signals).toHaveLength(2);
    });

    it('应调用 store.getSignalsByTopic 并传入正确参数', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/consensus?from_db=true&topic=finance&limit=10',
      });
      expect(testCtx.store.getSignalsByTopic).toHaveBeenCalledWith('finance', 10);
    });
  });

  describe('sentimentDistribution 全为 0 时', () => {
    beforeEach(async () => {
      const zeroSignal = createMockSignal({
        sentimentDistribution: { bullish: 0, bearish: 0, neutral: 0 },
      });
      vi.spyOn(testCtx.store, 'getLatestSignals').mockReturnValue([zeroSignal]);
      registerConsensusRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应保持原样不除零', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/consensus?from_db=true',
      });
      const body = res.json();
      const dist = body.latest[0].sentimentDistribution;
      expect(dist.bullish).toBe(0);
      expect(dist.bearish).toBe(0);
      expect(dist.neutral).toBe(0);
    });
  });
});
