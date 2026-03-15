// ============================================================================
// BeeClaw Server — API: /api/consensus
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { consensusSchema } from './schemas.js';

export function registerConsensusRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get<{
    Querystring: { topic?: string; limit?: string };
  }>('/api/consensus', { schema: consensusSchema }, async (req) => {
    const limit = Math.min(50, parseInt(req.query.limit ?? '20', 10) || 20);

    if (req.query.topic) {
      return {
        topic: req.query.topic,
        signals: ctx.engine.getConsensusEngine().getSignalHistory(req.query.topic).slice(-limit),
      };
    }

    return {
      topics: ctx.engine.getConsensusEngine().getAllTopics(),
      latest: ctx.engine.getConsensusEngine().getLatestSignals(),
    };
  });
}
