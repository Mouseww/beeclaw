// ============================================================================
// BeeClaw Server — API: /api/status
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { statusSchema } from './schemas.js';

/** 从共识引擎的最新信号中聚合出全局情绪分布 */
function aggregateGlobalSentiment(ctx: ServerContext): {
  bullish: number;
  bearish: number;
  neutral: number;
  topicBreakdown: { topic: string; bullish: number; bearish: number; neutral: number; tick: number }[];
} {
  const consensus = ctx.engine.getConsensusEngine();
  const latestSignals = consensus.getLatestSignals();

  if (latestSignals.length === 0) {
    return { bullish: 0, bearish: 0, neutral: 0, topicBreakdown: [] };
  }

  let totalBullish = 0;
  let totalBearish = 0;
  let totalNeutral = 0;

  const topicBreakdown = latestSignals.map((signal) => {
    const d = signal.sentimentDistribution;
    totalBullish += d.bullish;
    totalBearish += d.bearish;
    totalNeutral += d.neutral;
    return {
      topic: signal.topic,
      bullish: d.bullish,
      bearish: d.bearish,
      neutral: d.neutral,
      tick: signal.tick,
    };
  });

  const total = totalBullish + totalBearish + totalNeutral;
  if (total === 0) {
    return { bullish: 0, bearish: 0, neutral: 0, topicBreakdown };
  }

  return {
    bullish: Math.round((totalBullish / total) * 100),
    bearish: Math.round((totalBearish / total) * 100),
    neutral: Math.round((totalNeutral / total) * 100),
    topicBreakdown,
  };
}

export function registerStatusRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/status', { schema: statusSchema }, async () => {
    const state = ctx.engine.getWorldState().getState();
    const tick = ctx.engine.getCurrentTick();
    const agents = ctx.engine.getAgents();
    const lastTick = ctx.engine.getLastTickResult();
    const wsConnections = ctx.getWsCount();
    const sentiment = aggregateGlobalSentiment(ctx);

    return {
      tick,
      agentCount: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
      sentiment,
      activeEvents: state.activeEvents.length,
      lastTick: lastTick ?? null,
      wsConnections,
      uptime: process.uptime(),
      running: ctx.engine.isRunning(),
    };
  });
}
