// ============================================================================
// BeeClaw Server — API: /api/webhooks
// Webhook 订阅 CRUD + 测试
// ============================================================================

import { randomUUID, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebhookEventType } from '@beeclaw/shared';
import type { ServerContext } from '../index.js';

const VALID_EVENTS: WebhookEventType[] = [
  'consensus.signal',
  'trend.detected',
  'trend.shift',
  'agent.spawned',
  'tick.completed',
];

function isValidEventType(e: string): e is WebhookEventType {
  return (VALID_EVENTS as string[]).includes(e);
}

interface CreateWebhookBody {
  url: string;
  events: string[];
  secret?: string;
}

interface UpdateWebhookBody {
  url?: string;
  events?: string[];
  active?: boolean;
}

export function registerWebhooksRoute(app: FastifyInstance, ctx: ServerContext): void {
  // POST /api/webhooks — 注册新 webhook
  app.post<{ Body: CreateWebhookBody }>('/api/webhooks', async (req, reply) => {
    const { url, events, secret } = req.body;

    if (!url || typeof url !== 'string') {
      return reply.status(400).send({ error: 'url is required' });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return reply.status(400).send({ error: 'events array is required and must not be empty' });
    }

    const invalidEvents = events.filter(e => !isValidEventType(e));
    if (invalidEvents.length > 0) {
      return reply.status(400).send({
        error: `Invalid event types: ${invalidEvents.join(', ')}. Valid types: ${VALID_EVENTS.join(', ')}`,
      });
    }

    const subscription = {
      id: `wh_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      url,
      events: events as WebhookEventType[],
      secret: secret ?? randomBytes(32).toString('hex'),
      active: true,
      createdAt: Math.floor(Date.now() / 1000),
    };

    ctx.store.createWebhook(subscription);

    return reply.status(201).send({ ok: true, webhook: subscription });
  });

  // GET /api/webhooks — 列出所有 webhook
  app.get('/api/webhooks', async () => {
    const webhooks = ctx.store.getWebhooks();
    // 不返回 secret 明文，仅返回掩码
    const masked = webhooks.map(w => ({
      ...w,
      secret: w.secret.slice(0, 6) + '••••••',
    }));
    return { webhooks: masked, total: masked.length };
  });

  // DELETE /api/webhooks/:id — 删除 webhook
  app.delete<{ Params: { id: string } }>('/api/webhooks/:id', async (req, reply) => {
    const deleted = ctx.store.deleteWebhook(req.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Webhook not found' });
    }
    return { ok: true };
  });

  // PUT /api/webhooks/:id — 更新 webhook
  app.put<{ Params: { id: string }; Body: UpdateWebhookBody }>('/api/webhooks/:id', async (req, reply) => {
    const { url, events, active } = req.body;

    if (events) {
      if (!Array.isArray(events) || events.length === 0) {
        return reply.status(400).send({ error: 'events array must not be empty' });
      }
      const invalidEvents = events.filter(e => !isValidEventType(e));
      if (invalidEvents.length > 0) {
        return reply.status(400).send({
          error: `Invalid event types: ${invalidEvents.join(', ')}`,
        });
      }
    }

    const updated = ctx.store.updateWebhook(req.params.id, {
      url,
      events: events as WebhookEventType[] | undefined,
      active,
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Webhook not found' });
    }

    const webhook = ctx.store.getWebhook(req.params.id);
    return { ok: true, webhook };
  });

  // POST /api/webhooks/:id/test — 发送测试 payload
  app.post<{ Params: { id: string } }>('/api/webhooks/:id/test', async (req, reply) => {
    const webhook = ctx.store.getWebhook(req.params.id);
    if (!webhook) {
      return reply.status(404).send({ error: 'Webhook not found' });
    }

    if (!ctx.webhookDispatcher) {
      return reply.status(503).send({ error: 'Webhook dispatcher not available' });
    }

    const record = await ctx.webhookDispatcher.sendTest(webhook);
    return { ok: record.status === 'success', delivery: record };
  });
}
