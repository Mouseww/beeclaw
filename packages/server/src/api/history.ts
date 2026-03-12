// ============================================================================
// BeeClaw Server — API: /api/history
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';

export function registerHistoryRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get<{
    Querystring: { limit?: string };
  }>('/api/history', async (req) => {
    const limit = Math.min(200, parseInt(req.query.limit ?? '50', 10) || 50);

    // 优先从持久化读，fallback 到内存
    const fromDb = ctx.store.getTickHistory(limit);
    if (fromDb.length > 0) {
      return { history: fromDb, source: 'db' };
    }

    return { history: ctx.engine.getTickHistory().slice(-limit), source: 'memory' };
  });
}
