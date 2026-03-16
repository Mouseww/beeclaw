// ============================================================================
// BeeClaw Server — API: /api/ingestion
// RSS 事件接入状态查询
// ============================================================================

import type { FastifyInstance } from 'fastify';
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
}
