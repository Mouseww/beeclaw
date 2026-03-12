// ============================================================================
// BeeClaw Server — API: /api/status
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';

export function registerStatusRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/status', async () => {
    const state = ctx.engine.getWorldState().getState();
    const tick = ctx.engine.getCurrentTick();
    const agents = ctx.engine.getAgents();
    const lastTick = ctx.engine.getLastTickResult();
    const wsConnections = ctx.getWsCount();

    return {
      tick,
      agentCount: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
      sentiment: state.sentiment,
      activeEvents: state.activeEvents.length,
      lastTick: lastTick ?? null,
      wsConnections,
      uptime: process.uptime(),
      running: ctx.engine.isRunning(),
    };
  });
}
