// ============================================================================
// BeeClaw Server — API: /api/signals (Phase 2.2)
// 预测信号 API：最新信号、按 topic 查询、趋势摘要、准确性统计
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ConsensusSignal, PredictionSignal, TrendSummary, PredictionAccuracyStats, SignalCredibilityScore, TrendDirection } from '@beeclaw/shared';
import type { ServerContext } from '../index.js';
import {
  signalsLatestSchema,
  signalsTopicSchema,
  signalsTrendsSchema,
  signalsAccuracySchema,
} from './schemas.js';

export function registerSignalsRoute(app: FastifyInstance, ctx: ServerContext): void {
  // ── GET /api/signals/latest ──
  app.get<{
    Querystring: { limit?: string; topic?: string };
  }>('/api/signals/latest', { schema: signalsLatestSchema }, async (req) => {
    const limit = Math.min(50, parseInt(req.query.limit ?? '20', 10) || 20);

    // 优先从 DB 查询（signals API 专注于持久化数据）
    let signals: ConsensusSignal[];
    if (req.query.topic) {
      signals = await ctx.store.getSignalsByTopic(req.query.topic, limit);
    } else {
      signals = await ctx.store.getLatestSignals(limit);
    }

    const normalized = signals.map(toPredictionSignal);
    return {
      signals: normalized,
      total: normalized.length,
      topic: req.query.topic,
      timestamp: Date.now(),
    };
  });

  // ── GET /api/signals/topic/:topic ──
  app.get<{
    Params: { topic: string };
    Querystring: { limit?: string; from_tick?: string; to_tick?: string };
  }>('/api/signals/topic/:topic', { schema: signalsTopicSchema }, async (req) => {
    const { topic } = req.params;
    const limit = Math.min(100, parseInt(req.query.limit ?? '50', 10) || 50);
    const fromTick = req.query.from_tick ? parseInt(req.query.from_tick, 10) : undefined;
    const toTick = req.query.to_tick ? parseInt(req.query.to_tick, 10) : undefined;

    let signals: ConsensusSignal[];
    if (fromTick !== undefined && toTick !== undefined) {
      signals = await ctx.store.getSignalsByTickRange(topic, fromTick, toTick);
    } else {
      signals = await ctx.store.getSignalsByTopic(topic, limit);
    }

    const normalized = signals.map(toPredictionSignal);
    const trend = analyzeTrend(signals);

    return {
      topic,
      signals: normalized,
      total: normalized.length,
      trend,
      timestamp: Date.now(),
    };
  });

  // ── GET /api/signals/trends ──
  app.get('/api/signals/trends', { schema: signalsTrendsSchema }, async () => {
    const latestPerTopic = await ctx.store.getLatestSignalPerTopic();
    const summary: TrendSummary = buildTrendSummary(latestPerTopic);
    return summary;
  });

  // ── GET /api/signals/accuracy ──
  app.get('/api/signals/accuracy', { schema: signalsAccuracySchema }, async () => {
    const allSignals = await ctx.store.getLatestSignals(1000);
    const stats = computeAccuracyStats(allSignals);
    return stats;
  });
}

// ── 辅助：ConsensusSignal → PredictionSignal ──

/**
 * 将原始 ConsensusSignal 转换为标准化 PredictionSignal
 * 情绪分布标准化为百分比，并计算信誉加权评分
 */
function toPredictionSignal(signal: ConsensusSignal): PredictionSignal {
  const dist = signal.sentimentDistribution;
  const total = (dist.bullish || 0) + (dist.bearish || 0) + (dist.neutral || 0);

  const normalizedDist =
    total > 0
      ? {
          bullish: Math.round((dist.bullish / total) * 100),
          bearish: Math.round((dist.bearish / total) * 100),
          neutral: Math.round((dist.neutral / total) * 100),
        }
      : { ...dist };

  // 信誉评分：基于顶部论点的 avgCredibility 字段加权计算
  const credibility = computeCredibilityScore(signal);

  return {
    id: `${signal.topic}-${signal.tick}`,
    topic: signal.topic,
    tick: signal.tick,
    timestamp: Date.now(), // 单测覆盖时可以 mock
    sentimentDistribution: normalizedDist,
    consensus: signal.consensus,
    intensity: signal.intensity,
    trend: signal.trend,
    credibility,
    alerts: signal.alerts,
    topArguments: signal.topArguments,
  };
}

/**
 * 基于 topArguments 的 avgCredibility 加权计算信号可信度
 * 权重 = supporters 数量，可信度 = avgCredibility
 */
function computeCredibilityScore(signal: ConsensusSignal): SignalCredibilityScore {
  const args = signal.topArguments;
  if (!args || args.length === 0) {
    return {
      weightedScore: signal.consensus,
      agentCount: 0,
      avgCredibility: 0,
      highCredibilityCount: 0,
    };
  }

  const totalSupporters = args.reduce((acc, a) => acc + (a.supporters || 0), 0);
  const weightedSum = args.reduce((acc, a) => acc + a.avgCredibility * (a.supporters || 0), 0);
  const weightedScore = totalSupporters > 0 ? weightedSum / totalSupporters : 0;
  const avgCredibility = args.reduce((acc, a) => acc + a.avgCredibility, 0) / args.length;
  const highCredibilityCount = args.filter((a) => a.avgCredibility > 0.7).length;

  return {
    weightedScore: Math.min(1, Math.max(0, weightedScore)),
    agentCount: totalSupporters,
    avgCredibility: Math.round(avgCredibility * 100) / 100,
    highCredibilityCount,
  };
}

/**
 * 对一批同 topic 信号进行简单趋势分析（时序方向）
 */
function analyzeTrend(signals: ConsensusSignal[]): {
  direction: TrendDirection;
  momentumDelta: number;
  sentimentMean: number;
  dataPoints: number;
} {
  if (signals.length === 0) {
    return { direction: 'forming', momentumDelta: 0, sentimentMean: 0, dataPoints: 0 };
  }
  if (signals.length === 1) {
    const s = signals[0]!;
    const dist = s.sentimentDistribution;
    const total = dist.bullish + dist.bearish + dist.neutral || 1;
    const sentimentMean = (dist.bullish - dist.bearish) / total;
    return { direction: s.trend, momentumDelta: 0, sentimentMean, dataPoints: 1 };
  }

  // 按 tick 升序排列
  const sorted = [...signals].sort((a, b) => a.tick - b.tick);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const momentumDelta = last.consensus - first.consensus;

  // 情绪均值（以最近半段为准）
  const halfIdx = Math.floor(sorted.length / 2);
  const recentSignals = sorted.slice(halfIdx);
  const sentimentMean =
    recentSignals.reduce((acc, s) => {
      const dist = s.sentimentDistribution;
      const total = dist.bullish + dist.bearish + dist.neutral || 1;
      return acc + (dist.bullish - dist.bearish) / total;
    }, 0) / recentSignals.length;

  // 趋势方向由最新信号确定（结合 momentumDelta 校正）
  let direction: TrendDirection = last.trend;
  if (momentumDelta > 0.1) {
    direction = 'strengthening';
  } else if (momentumDelta < -0.1) {
    direction = 'weakening';
  }

  return {
    direction,
    momentumDelta: Math.round(momentumDelta * 1000) / 1000,
    sentimentMean: Math.round(sentimentMean * 1000) / 1000,
    dataPoints: sorted.length,
  };
}

/**
 * 构建多 topic 趋势摘要
 */
function buildTrendSummary(latestPerTopic: ConsensusSignal[]): TrendSummary {
  const topics = latestPerTopic.map((signal) => ({
    topic: signal.topic,
    latestSignal: toPredictionSignal(signal),
    trend: signal.trend,
    signalCount: 1, // 单最新信号；详情通过 /topic/:topic 获取
  }));

  const globalSentimentMean =
    topics.length > 0
      ? topics.reduce((acc, t) => {
          const dist = t.latestSignal.sentimentDistribution;
          const total = dist.bullish + dist.bearish + dist.neutral || 1;
          return acc + (dist.bullish - dist.bearish) / total;
        }, 0) / topics.length
      : 0;

  const highConfidenceAlerts = latestPerTopic.reduce(
    (acc, s) => acc + s.alerts.filter((a) => a.confidence > 0.7).length,
    0
  );

  return {
    activeTopics: topics.length,
    topics,
    globalSentimentMean: Math.round(globalSentimentMean * 1000) / 1000,
    highConfidenceAlerts,
    timestamp: Date.now(),
  };
}

/**
 * 计算预测准确性统计
 * 当前基于信号趋势方向与情绪分布的内部一致性评估
 * （Phase 2 后续可接入外部真实事件进行验证）
 */
function computeAccuracyStats(signals: ConsensusSignal[]): PredictionAccuracyStats {
  const byTopic: Record<string, { total: number; accurate: number; rate: number }> = {};
  const byTrend: Record<TrendDirection, { total: number; accurate: number; rate: number }> = {
    forming: { total: 0, accurate: 0, rate: 0 },
    strengthening: { total: 0, accurate: 0, rate: 0 },
    weakening: { total: 0, accurate: 0, rate: 0 },
    reversing: { total: 0, accurate: 0, rate: 0 },
  };

  let evaluated = 0;
  let accurate = 0;

  for (const signal of signals) {
    // 内部一致性评估：consensus > 0.6 且情绪分布有明显倾向（看涨/看跌 > 50%）视为自洽预测
    const dist = signal.sentimentDistribution;
    const total = dist.bullish + dist.bearish + dist.neutral || 1;
    const dominantPct = Math.max(dist.bullish, dist.bearish, dist.neutral) / total;
    const isConsistent = signal.consensus > 0.6 && dominantPct > 0.5;

    evaluated++;
    if (isConsistent) accurate++;

    // 按 topic 统计
    if (!byTopic[signal.topic]) {
      byTopic[signal.topic] = { total: 0, accurate: 0, rate: 0 };
    }
    byTopic[signal.topic]!.total++;
    if (isConsistent) byTopic[signal.topic]!.accurate++;

    // 按 trend 统计
    byTrend[signal.trend].total++;
    if (isConsistent) byTrend[signal.trend].accurate++;
  }

  // 计算各维度准确率
  for (const stat of Object.values(byTopic)) {
    stat.rate = stat.total > 0 ? Math.round((stat.accurate / stat.total) * 100) / 100 : 0;
  }
  for (const stat of Object.values(byTrend)) {
    stat.rate = stat.total > 0 ? Math.round((stat.accurate / stat.total) * 100) / 100 : 0;
  }

  return {
    totalSignals: signals.length,
    evaluatedSignals: evaluated,
    accuracyRate: evaluated > 0 ? Math.round((accurate / evaluated) * 100) / 100 : 0,
    byTopic,
    byTrend,
    timestamp: Date.now(),
  };
}
