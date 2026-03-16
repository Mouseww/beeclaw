// ============================================================================
// BeeClaw Server — API: /api/events (事件注入)
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import type { EventCategory } from '@beeclaw/shared';
import { broadcast } from '../ws/handler.js';
import { injectEventSchema } from './schemas.js';

interface InjectEventBody {
  title: string;
  content: string;
  category?: EventCategory;
  importance?: number;
  propagationRadius?: number;
  tags?: string[];
}

export function registerEventsRoute(app: FastifyInstance, ctx: ServerContext): void {
  // POST /api/events — 注入事件
  app.post<{ Body: InjectEventBody }>('/api/events', { schema: injectEventSchema }, async (req, reply) => {
    const { title, content, category, importance, propagationRadius, tags } = req.body;

    if (!title || !content) {
      return reply.status(400).send({ error: 'title and content are required' });
    }

    const event = ctx.engine.injectEvent({
      title,
      content,
      category: category ?? 'general',
      importance: importance ?? 0.6,
      propagationRadius: propagationRadius ?? 0.5,
      tags: tags ?? [],
    });

    broadcast('event_injected', { id: event.id, title: event.title });

    return { ok: true, event };
  });
}
