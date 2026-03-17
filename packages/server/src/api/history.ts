// ============================================================================
// BeeClaw Server — API: /api/history + /api/ticks/:tick/events、responses
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { historySchema, tickEventsSchema, tickResponsesSchema, eventSearchSchema } from './schemas.js';

export function registerHistoryRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get<{
    Querystring: { limit?: string };
  }>('/api/history', { schema: historySchema }, async (req) => {
    const limit = Math.min(200, parseInt(req.query.limit ?? '50', 10) || 50);

    // 优先从持久化读，fallback 到内存
    const fromDb = await ctx.store.getTickHistory(limit);
    if (fromDb.length > 0) {
      return { history: fromDb, source: 'db' };
    }

    return { history: ctx.engine.getTickHistory().slice(-limit), source: 'memory' };
  });

  // v2.0: 获取某个 tick 的所有事件
  app.get<{
    Params: { tick: string };
  }>('/api/ticks/:tick/events', { schema: tickEventsSchema }, async (req) => {
    const tick = parseInt(req.params.tick, 10);
    const events = await ctx.store.getEventsByTick(tick);
    return { tick, events, count: events.length };
  });

  // v2.0: 获取某个 tick 的所有 Agent 响应
  app.get<{
    Params: { tick: string };
  }>('/api/ticks/:tick/responses', { schema: tickResponsesSchema }, async (req) => {
    const tick = parseInt(req.params.tick, 10);
    const responses = await ctx.store.getResponsesByTick(tick);
    return { tick, responses, count: responses.length };
  });

  // v2.0: 搜索事件
  app.get<{
    Querystring: { q?: string; limit?: string };
  }>('/api/events/search', { schema: eventSearchSchema }, async (req, reply) => {
    const q = req.query.q;
    if (!q) {
      return reply.status(400).send({ error: 'Missing search query "q"' });
    }
    const limit = Math.min(100, parseInt(req.query.limit ?? '20', 10) || 20);
    const events = await ctx.store.searchEvents(q, limit);
    return { query: q, events, count: events.length };
  });
}
