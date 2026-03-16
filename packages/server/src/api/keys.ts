// ============================================================================
// BeeClaw Server — API: /api/keys — API Key 管理
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { generateApiKey, hashApiKey } from '../middleware/auth.js';
import { randomUUID } from 'node:crypto';

export function registerKeysRoute(app: FastifyInstance, ctx: ServerContext): void {
  // POST /api/keys — 创建新 API key
  app.post<{
    Body: { name: string; permissions?: string[]; rateLimit?: number };
  }>('/api/keys', async (req, reply) => {
    const { name, permissions, rateLimit } = req.body;
    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const id = randomUUID();

    ctx.store.createApiKey({
      id,
      name,
      keyHash,
      permissions: permissions ?? ['read', 'write'],
      rateLimit: rateLimit ?? 100,
    });

    // 只在创建时返回明文 key，之后不可再查
    return {
      id,
      name,
      key: rawKey,
      permissions: permissions ?? ['read', 'write'],
      rateLimit: rateLimit ?? 100,
      message: '请妥善保存此 key，它不会再显示',
    };
  });

  // GET /api/keys — 列出所有 keys（不返回明文/hash）
  app.get('/api/keys', async () => {
    const keys = ctx.store.getApiKeys();
    return { keys };
  });

  // DELETE /api/keys/:id — 删除 key
  app.delete<{ Params: { id: string } }>('/api/keys/:id', async (req, reply) => {
    const deleted = ctx.store.deleteApiKey(req.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'API key not found' });
    }
    return { ok: true, deleted: req.params.id };
  });
}
