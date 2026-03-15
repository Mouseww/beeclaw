// ============================================================================
// BeeClaw Server — API: /api/agents
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { agentsListSchema, agentDetailSchema } from './schemas.js';

export function registerAgentsRoute(app: FastifyInstance, ctx: ServerContext): void {
  // 列表（分页）
  app.get<{
    Querystring: { page?: string; size?: string };
  }>('/api/agents', { schema: agentsListSchema }, async (req) => {
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size ?? '20', 10) || 20));

    const agents = ctx.engine.getAgents();
    const total = agents.length;

    // 按 influence 排序后分页
    const sorted = [...agents].sort((a, b) => b.influence - a.influence);
    const start = (page - 1) * size;
    const slice = sorted.slice(start, start + size);

    return {
      agents: slice.map(a => ({
        id: a.id,
        name: a.name,
        profession: a.persona.profession,
        status: a.status,
        influence: a.influence,
        credibility: a.credibility,
        modelTier: a.modelTier,
        followers: a.followers.length,
        following: a.following.length,
        lastActiveTick: a.lastActiveTick,
      })),
      page,
      size,
      total,
      pages: Math.ceil(total / size),
    };
  });

  // 详情
  app.get<{
    Params: { id: string };
  }>('/api/agents/:id', { schema: agentDetailSchema }, async (req, reply) => {
    const agent = ctx.engine.getAgent(req.params.id);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    return agent.toData();
  });
}
