// ============================================================================
// BeeClaw Server — API: /api/consensus
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ConsensusSignal } from '@beeclaw/shared';
import type { ServerContext } from '../index.js';
import { consensusSchema } from './schemas.js';

export function registerConsensusRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get<{
    Querystring: { topic?: string; limit?: string };
  }>('/api/consensus', { schema: consensusSchema }, async (req) => {
    const limit = Math.min(50, parseInt(req.query.limit ?? '20', 10) || 20);

    const engine = ctx.engine.getConsensusEngine();

    if (req.query.topic) {
      const signals = engine.getSignalHistory(req.query.topic).slice(-limit);
      return {
        topic: req.query.topic,
        signals: normalizeSentimentDistributions(signals),
      };
    }

    const latest = engine.getLatestSignals();
    return {
      topics: engine.getAllTopics(),
      latest: normalizeSentimentDistributions(latest),
    };
  });
}

/** 将原始计数转换为百分比 */
function normalizeSentimentDistributions(signals: ConsensusSignal[]): ConsensusSignal[] {
  return signals.map((signal) => {
    const dist = signal.sentimentDistribution;
    const total = (dist.bullish || 0) + (dist.bearish || 0) + (dist.neutral || 0);

    if (total === 0) {
      return signal; // 没有数据，保持原样
    }

    return {
      ...signal,
      sentimentDistribution: {
        bullish: Math.round((dist.bullish / total) * 100),
        bearish: Math.round((dist.bearish / total) * 100),
        neutral: Math.round((dist.neutral / total) * 100),
      },
    };
  });
}
