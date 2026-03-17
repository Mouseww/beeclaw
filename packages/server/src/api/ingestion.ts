// ============================================================================
// BeeClaw Server — API: /api/ingestion
// RSS 事件接入状态查询 + CRUD 管理（v2.0: 数据库持久化）
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { EventCategory } from '@beeclaw/shared';
import type { ServerContext } from '../index.js';
import { ingestionStatusSchema, ingestionSourceDetailSchema } from './schemas.js';

export function registerIngestionRoute(app: FastifyInstance, ctx: ServerContext): void {
  // GET /api/ingestion — 返回所有 RSS 源状态汇总
  app.get('/api/ingestion', { schema: ingestionStatusSchema }, async (_req, reply) => {
    if (!ctx.ingestion) {
      return reply.status(503).send({ error: 'EventIngestion not available' });
    }
    return ctx.ingestion.getStatus();
  });

  // GET /api/ingestion/:sourceId — 返回单个源详情
  app.get<{ Params: { sourceId: string } }>(
    '/api/ingestion/:sourceId',
    { schema: ingestionSourceDetailSchema },
    async (req, reply) => {
      if (!ctx.ingestion) {
        return reply.status(503).send({ error: 'EventIngestion not available' });
      }
      const status = ctx.ingestion.getSourceStatus(req.params.sourceId);
      if (!status) {
        return reply.status(404).send({ error: `Source "${req.params.sourceId}" not found` });
      }
      return status;
    },
  );

  // POST /api/ingestion/sources — 新增 RSS 数据源
  app.post<{
    Body: { id: string; name: string; url: string; category?: string; tags?: string[]; pollIntervalMs?: number; enabled?: boolean };
  }>('/api/ingestion/sources', async (req, reply) => {
    if (!ctx.ingestion) {
      return reply.status(503).send({ error: 'EventIngestion not available' });
    }
    const { id, name, url, category, tags, pollIntervalMs, enabled } = req.body;
    if (!id || !name || !url) {
      return reply.status(400).send({ error: 'id, name, url are required' });
    }
    const source = {
      id,
      name,
      url,
      category: (category as EventCategory) ?? 'general',
      tags: tags ?? [],
      pollIntervalMs: pollIntervalMs ?? 300_000,
      enabled: enabled ?? true,
    };
    ctx.ingestion.addSource(source);
    // v2.0: 同步到数据库
    await ctx.store.saveRssSource(source);
    return { ok: true, id };
  });

  // PUT /api/ingestion/sources/:sourceId — 更新 RSS 数据源
  app.put<{
    Params: { sourceId: string };
    Body: { name?: string; url?: string; category?: string; tags?: string[]; pollIntervalMs?: number; enabled?: boolean };
  }>('/api/ingestion/sources/:sourceId', async (req, reply) => {
    if (!ctx.ingestion) {
      return reply.status(503).send({ error: 'EventIngestion not available' });
    }
    const existing = ctx.ingestion.getSourceStatus(req.params.sourceId);
    if (!existing) {
      return reply.status(404).send({ error: `Source "${req.params.sourceId}" not found` });
    }
    // 先删除旧的，再添加更新后的
    ctx.ingestion.removeSource(req.params.sourceId);
    const source = {
      id: req.params.sourceId,
      name: req.body.name ?? existing.name,
      url: req.body.url ?? existing.url,
      category: (req.body.category as EventCategory) ?? 'general',
      tags: req.body.tags ?? [],
      pollIntervalMs: req.body.pollIntervalMs ?? 300_000,
      enabled: req.body.enabled ?? existing.enabled,
    };
    ctx.ingestion.addSource(source);
    // v2.0: 同步到数据库
    await ctx.store.saveRssSource(source);
    return { ok: true, id: req.params.sourceId };
  });

  // DELETE /api/ingestion/sources/:sourceId — 删除 RSS 数据源
  app.delete<{ Params: { sourceId: string } }>(
    '/api/ingestion/sources/:sourceId',
    async (req, reply) => {
      if (!ctx.ingestion) {
        return reply.status(503).send({ error: 'EventIngestion not available' });
      }
      const existing = ctx.ingestion.getSourceStatus(req.params.sourceId);
      if (!existing) {
        return reply.status(404).send({ error: `Source "${req.params.sourceId}" not found` });
      }
      ctx.ingestion.removeSource(req.params.sourceId);
      // v2.0: 同步到数据库
      await ctx.store.deleteRssSource(req.params.sourceId);
      return { ok: true, deleted: req.params.sourceId };
    },
  );
}
