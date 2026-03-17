// ============================================================================
// @beeclaw/server — /api/signals 路由测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ConsensusSignal } from '@beeclaw/shared';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerSignalsRoute } from './signals.js';

// ── 共享 setup ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(0);
});

afterEach(async () => {
  await testCtx.app.close();
});

// ── Mock 数据工厂 ──

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
// GET /api/signals/latest
// ════════════════════════════════════════

describe('GET /api/signals/latest', () => {
  let app: FastifyInstance;

  describe('无 topic 参数时', () => {
    beforeEach(async () => {
      const signals = [
        createMockSignal({ topic: 'topic-a', tick: 1 }),
        createMockSignal({ topic: 'topic-b', tick: 2 }),
      ];
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回信号列表和 total', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('signals');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('timestamp');
      expect(Array.isArray(body.signals)).toBe(true);
      expect(body.total).toBe(2);
    });

    it('topic 字段应为 undefined / 不含 topic', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      const body = res.json();
      // 不传 topic 时 req.query.topic 为 undefined
      expect(body.topic).toBeUndefined();
    });

    it('应调用 store.getLatestSignals 并传入默认 limit=20', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/latest' });
      expect(testCtx.store.getLatestSignals).toHaveBeenCalledWith(20);
    });

    it('应支持 limit 参数', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/latest?limit=10' });
      expect(testCtx.store.getLatestSignals).toHaveBeenCalledWith(10);
    });

    it('limit 超过 50 应被 clamp 到 50', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/latest?limit=999' });
      expect(testCtx.store.getLatestSignals).toHaveBeenCalledWith(50);
    });

    it('limit 为无效字符串应 fallback 到 20', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/latest?limit=abc' });
      expect(testCtx.store.getLatestSignals).toHaveBeenCalledWith(20);
    });

    it('信号应被标准化为 PredictionSignal 格式', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      const body = res.json();
      const signal = body.signals[0];
      expect(signal).toHaveProperty('id');
      expect(signal).toHaveProperty('topic');
      expect(signal).toHaveProperty('tick');
      expect(signal).toHaveProperty('timestamp');
      expect(signal).toHaveProperty('sentimentDistribution');
      expect(signal).toHaveProperty('consensus');
      expect(signal).toHaveProperty('intensity');
      expect(signal).toHaveProperty('trend');
      expect(signal).toHaveProperty('credibility');
    });

    it('sentimentDistribution 应被标准化为百分比', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      const body = res.json();
      const dist = body.signals[0].sentimentDistribution;
      // 5+3+2=10 → bullish:50%, bearish:30%, neutral:20%
      expect(dist.bullish).toBe(50);
      expect(dist.bearish).toBe(30);
      expect(dist.neutral).toBe(20);
    });
  });

  describe('有 topic 参数时', () => {
    beforeEach(async () => {
      const signals = [createMockSignal({ topic: 'finance', tick: 1 })];
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应调用 store.getSignalsByTopic 而非 getLatestSignals', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/latest?topic=finance',
      });
      expect(res.statusCode).toBe(200);
      expect(testCtx.store.getSignalsByTopic).toHaveBeenCalledWith('finance', 20);
    });

    it('返回值应包含 topic 字段', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/latest?topic=finance',
      });
      const body = res.json();
      expect(body.topic).toBe('finance');
      expect(body.total).toBe(1);
    });
  });

  describe('空结果时', () => {
    beforeEach(async () => {
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue([]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回空数组和 total=0', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      const body = res.json();
      expect(body.signals).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('sentimentDistribution 全为 0 时', () => {
    beforeEach(async () => {
      const zeroSignal = createMockSignal({
        sentimentDistribution: { bullish: 0, bearish: 0, neutral: 0 },
      });
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue([zeroSignal]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应保持原样不除零', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      const body = res.json();
      const dist = body.signals[0].sentimentDistribution;
      expect(dist.bullish).toBe(0);
      expect(dist.bearish).toBe(0);
      expect(dist.neutral).toBe(0);
    });
  });

  describe('credibility 计算', () => {
    it('无 topArguments 时应回退到默认值', async () => {
      const signal = createMockSignal({ topArguments: [], consensus: 0.8 });
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue([signal]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;

      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      const body = res.json();
      const cred = body.signals[0].credibility;
      expect(cred.weightedScore).toBe(0.8); // 回退到 consensus
      expect(cred.agentCount).toBe(0);
      expect(cred.avgCredibility).toBe(0);
      expect(cred.highCredibilityCount).toBe(0);
    });

    it('有 topArguments 时应正确加权计算', async () => {
      const signal = createMockSignal({
        topArguments: [
          { argument: '利好', supporters: 4, avgCredibility: 0.8 },
          { argument: '利空', supporters: 6, avgCredibility: 0.5 },
        ] as ConsensusSignal['topArguments'],
      });
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue([signal]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;

      const res = await app.inject({ method: 'GET', url: '/api/signals/latest' });
      const body = res.json();
      const cred = body.signals[0].credibility;
      // weightedScore = (4*0.8 + 6*0.5) / (4+6) = (3.2+3.0)/10 = 0.62
      expect(cred.weightedScore).toBeCloseTo(0.62, 2);
      expect(cred.agentCount).toBe(10);
      // avgCredibility = (0.8+0.5)/2 = 0.65
      expect(cred.avgCredibility).toBe(0.65);
      // highCredibilityCount: 0.8 > 0.7 → 1
      expect(cred.highCredibilityCount).toBe(1);
    });
  });
});

// ════════════════════════════════════════
// GET /api/signals/topic/:topic
// ════════════════════════════════════════

describe('GET /api/signals/topic/:topic', () => {
  let app: FastifyInstance;

  describe('基本查询（无 tick 范围）', () => {
    beforeEach(async () => {
      const signals = [
        createMockSignal({ topic: 'crypto', tick: 1, consensus: 0.3 }),
        createMockSignal({ topic: 'crypto', tick: 2, consensus: 0.7 }),
      ];
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 topic 信号和趋势分析', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/topic/crypto',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.topic).toBe('crypto');
      expect(body.signals).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body).toHaveProperty('trend');
      expect(body.trend).toHaveProperty('direction');
      expect(body.trend).toHaveProperty('momentumDelta');
      expect(body.trend).toHaveProperty('sentimentMean');
      expect(body.trend).toHaveProperty('dataPoints');
      expect(body).toHaveProperty('timestamp');
    });

    it('应调用 store.getSignalsByTopic 并传入默认 limit=50', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/topic/crypto' });
      expect(testCtx.store.getSignalsByTopic).toHaveBeenCalledWith('crypto', 50);
    });

    it('应支持 limit 参数', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/topic/crypto?limit=10' });
      expect(testCtx.store.getSignalsByTopic).toHaveBeenCalledWith('crypto', 10);
    });

    it('limit 超过 100 应被 clamp 到 100', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/topic/crypto?limit=500' });
      expect(testCtx.store.getSignalsByTopic).toHaveBeenCalledWith('crypto', 100);
    });

    it('limit 为无效字符串应 fallback 到 50', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/topic/crypto?limit=xyz' });
      expect(testCtx.store.getSignalsByTopic).toHaveBeenCalledWith('crypto', 50);
    });
  });

  describe('指定 tick 范围时', () => {
    beforeEach(async () => {
      const signals = [
        createMockSignal({ topic: 'tech', tick: 5 }),
        createMockSignal({ topic: 'tech', tick: 8 }),
      ];
      vi.spyOn(testCtx.store, 'getSignalsByTickRange').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('同时提供 from_tick 和 to_tick 时应调用 getSignalsByTickRange', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/topic/tech?from_tick=5&to_tick=10',
      });
      expect(res.statusCode).toBe(200);
      expect(testCtx.store.getSignalsByTickRange).toHaveBeenCalledWith('tech', 5, 10);
      const body = res.json();
      expect(body.topic).toBe('tech');
      expect(body.total).toBe(2);
    });
  });

  describe('仅提供 from_tick 而无 to_tick 时', () => {
    beforeEach(async () => {
      const signals = [createMockSignal({ topic: 'ai' })];
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应 fallback 到 getSignalsByTopic', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/signals/topic/ai?from_tick=3',
      });
      // 仅一个不满足，fallback 到 getSignalsByTopic
      expect(testCtx.store.getSignalsByTopic).toHaveBeenCalledWith('ai', 50);
    });
  });

  describe('空结果时趋势分析', () => {
    beforeEach(async () => {
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockResolvedValue([]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('空信号应返回 forming 趋势', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/topic/empty',
      });
      const body = res.json();
      expect(body.signals).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.trend.direction).toBe('forming');
      expect(body.trend.momentumDelta).toBe(0);
      expect(body.trend.sentimentMean).toBe(0);
      expect(body.trend.dataPoints).toBe(0);
    });
  });

  describe('单信号趋势分析', () => {
    beforeEach(async () => {
      const signal = createMockSignal({
        topic: 'solo',
        tick: 1,
        trend: 'strengthening',
        sentimentDistribution: { bullish: 8, bearish: 1, neutral: 1 },
      });
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockResolvedValue([signal]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('单信号应使用该信号的 trend，momentumDelta=0', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/topic/solo',
      });
      const body = res.json();
      expect(body.trend.direction).toBe('strengthening');
      expect(body.trend.momentumDelta).toBe(0);
      expect(body.trend.dataPoints).toBe(1);
      // sentimentMean = (8-1)/10 = 0.7
      expect(body.trend.sentimentMean).toBeCloseTo(0.7, 2);
    });
  });

  describe('多信号趋势分析 - strengthening', () => {
    beforeEach(async () => {
      const signals = [
        createMockSignal({ topic: 'rising', tick: 1, consensus: 0.3, trend: 'forming' }),
        createMockSignal({ topic: 'rising', tick: 2, consensus: 0.5, trend: 'forming' }),
        createMockSignal({ topic: 'rising', tick: 3, consensus: 0.8, trend: 'forming' }),
      ];
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('consensus 上升 > 0.1 应识别为 strengthening', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/topic/rising',
      });
      const body = res.json();
      // momentumDelta = 0.8 - 0.3 = 0.5 > 0.1
      expect(body.trend.direction).toBe('strengthening');
      expect(body.trend.momentumDelta).toBe(0.5);
      expect(body.trend.dataPoints).toBe(3);
    });
  });

  describe('多信号趋势分析 - weakening', () => {
    beforeEach(async () => {
      const signals = [
        createMockSignal({ topic: 'falling', tick: 1, consensus: 0.9, trend: 'forming' }),
        createMockSignal({ topic: 'falling', tick: 2, consensus: 0.5, trend: 'forming' }),
      ];
      vi.spyOn(testCtx.store, 'getSignalsByTopic').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('consensus 下降 > 0.1 应识别为 weakening', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/topic/falling',
      });
      const body = res.json();
      // momentumDelta = 0.5 - 0.9 = -0.4 < -0.1
      expect(body.trend.direction).toBe('weakening');
      expect(body.trend.momentumDelta).toBe(-0.4);
    });
  });
});

// ════════════════════════════════════════
// GET /api/signals/trends
// ════════════════════════════════════════

describe('GET /api/signals/trends', () => {
  let app: FastifyInstance;

  describe('有多个 topic 时', () => {
    beforeEach(async () => {
      const signals = [
        createMockSignal({
          topic: 'finance',
          tick: 5,
          trend: 'strengthening',
          alerts: [{ type: 'high-consensus', confidence: 0.9, message: 'test' }] as ConsensusSignal['alerts'],
        }),
        createMockSignal({
          topic: 'tech',
          tick: 3,
          trend: 'forming',
          alerts: [{ type: 'low-consensus', confidence: 0.4, message: 'test' }] as ConsensusSignal['alerts'],
        }),
      ];
      vi.spyOn(testCtx.store, 'getLatestSignalPerTopic').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回活跃 topic 摘要', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/trends' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.activeTopics).toBe(2);
      expect(body.topics).toHaveLength(2);
      expect(body).toHaveProperty('globalSentimentMean');
      expect(body).toHaveProperty('highConfidenceAlerts');
      expect(body).toHaveProperty('timestamp');
    });

    it('每个 topic 应包含 latestSignal 和 trend', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/trends' });
      const body = res.json();
      for (const t of body.topics) {
        expect(t).toHaveProperty('topic');
        expect(t).toHaveProperty('latestSignal');
        expect(t).toHaveProperty('trend');
        expect(t).toHaveProperty('signalCount');
        expect(t.signalCount).toBe(1);
      }
    });

    it('highConfidenceAlerts 应只统计 confidence > 0.7 的 alert', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/trends' });
      const body = res.json();
      // finance: 1 alert with 0.9 > 0.7, tech: 1 alert with 0.4 ≤ 0.7
      expect(body.highConfidenceAlerts).toBe(1);
    });
  });

  describe('无 topic 时', () => {
    beforeEach(async () => {
      vi.spyOn(testCtx.store, 'getLatestSignalPerTopic').mockResolvedValue([]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回空摘要', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/trends' });
      const body = res.json();
      expect(body.activeTopics).toBe(0);
      expect(body.topics).toEqual([]);
      expect(body.globalSentimentMean).toBe(0);
      expect(body.highConfidenceAlerts).toBe(0);
    });
  });
});

// ════════════════════════════════════════
// GET /api/signals/accuracy
// ════════════════════════════════════════

describe('GET /api/signals/accuracy', () => {
  let app: FastifyInstance;

  describe('有信号数据时', () => {
    beforeEach(async () => {
      const signals = [
        // 自洽信号：consensus=0.8 > 0.6, bullish=8/(8+1+1)=80% > 50%
        createMockSignal({
          topic: 'finance',
          tick: 1,
          consensus: 0.8,
          trend: 'strengthening',
          sentimentDistribution: { bullish: 8, bearish: 1, neutral: 1 },
        }),
        // 非自洽信号：consensus=0.3 ≤ 0.6
        createMockSignal({
          topic: 'finance',
          tick: 2,
          consensus: 0.3,
          trend: 'forming',
          sentimentDistribution: { bullish: 4, bearish: 3, neutral: 3 },
        }),
        // 自洽信号：consensus=0.9 > 0.6, neutral=7/(1+2+7)=70% > 50%
        createMockSignal({
          topic: 'tech',
          tick: 3,
          consensus: 0.9,
          trend: 'weakening',
          sentimentDistribution: { bullish: 1, bearish: 2, neutral: 7 },
        }),
      ];
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue(signals);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回准确性统计基本结构', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('totalSignals');
      expect(body).toHaveProperty('evaluatedSignals');
      expect(body).toHaveProperty('accuracyRate');
      expect(body).toHaveProperty('byTopic');
      expect(body).toHaveProperty('byTrend');
      expect(body).toHaveProperty('timestamp');
    });

    it('应正确计算总体准确率', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      const body = res.json();
      expect(body.totalSignals).toBe(3);
      expect(body.evaluatedSignals).toBe(3);
      // 2 accurate / 3 evaluated ≈ 0.67
      expect(body.accuracyRate).toBeCloseTo(0.67, 2);
    });

    it('应按 topic 分类统计', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      const body = res.json();
      expect(body.byTopic).toHaveProperty('finance');
      expect(body.byTopic).toHaveProperty('tech');
      expect(body.byTopic.finance.total).toBe(2);
      expect(body.byTopic.finance.accurate).toBe(1);
      expect(body.byTopic.tech.total).toBe(1);
      expect(body.byTopic.tech.accurate).toBe(1);
    });

    it('应按 trend 方向分类统计', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      const body = res.json();
      expect(body.byTrend).toHaveProperty('forming');
      expect(body.byTrend).toHaveProperty('strengthening');
      expect(body.byTrend).toHaveProperty('weakening');
      expect(body.byTrend).toHaveProperty('reversing');
      // strengthening: 1 total, 1 accurate
      expect(body.byTrend.strengthening.total).toBe(1);
      expect(body.byTrend.strengthening.accurate).toBe(1);
      // forming: 1 total, 0 accurate (consensus=0.3 ≤ 0.6)
      expect(body.byTrend.forming.total).toBe(1);
      expect(body.byTrend.forming.accurate).toBe(0);
      // weakening: 1 total, 1 accurate
      expect(body.byTrend.weakening.total).toBe(1);
      expect(body.byTrend.weakening.accurate).toBe(1);
    });

    it('应调用 store.getLatestSignals(1000)', async () => {
      await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      expect(testCtx.store.getLatestSignals).toHaveBeenCalledWith(1000);
    });
  });

  describe('无信号数据时', () => {
    beforeEach(async () => {
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue([]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回零值统计', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      const body = res.json();
      expect(body.totalSignals).toBe(0);
      expect(body.evaluatedSignals).toBe(0);
      expect(body.accuracyRate).toBe(0);
    });

    it('byTrend 所有方向应均为 0', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      const body = res.json();
      for (const direction of ['forming', 'strengthening', 'weakening', 'reversing']) {
        expect(body.byTrend[direction].total).toBe(0);
        expect(body.byTrend[direction].accurate).toBe(0);
        expect(body.byTrend[direction].rate).toBe(0);
      }
    });
  });

  describe('边界：consensus=0.6 且 dominantPct=50% 的信号', () => {
    beforeEach(async () => {
      // consensus=0.6 不满足 > 0.6, 所以不是自洽的
      const borderSignal = createMockSignal({
        topic: 'border',
        consensus: 0.6,
        trend: 'forming',
        sentimentDistribution: { bullish: 5, bearish: 3, neutral: 2 },
      });
      vi.spyOn(testCtx.store, 'getLatestSignals').mockResolvedValue([borderSignal]);
      registerSignalsRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('consensus=0.6（不 > 0.6）应判为不自洽', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals/accuracy' });
      const body = res.json();
      expect(body.totalSignals).toBe(1);
      expect(body.accuracyRate).toBe(0);
      expect(body.byTopic.border.accurate).toBe(0);
    });
  });
});
