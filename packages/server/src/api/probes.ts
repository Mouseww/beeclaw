// ============================================================================
// BeeClaw Server — API: /healthz/live + /healthz/ready
// Kubernetes 风格的 Liveness 和 Readiness 探针端点
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';

// ── Schema 定义 ──

const probeResponseSchema = {
  type: 'object' as const,
  properties: {
    status: { type: 'string' as const },
    uptime: { type: 'number' as const },
    timestamp: { type: 'string' as const },
  },
};

const readinessResponseSchema = {
  type: 'object' as const,
  properties: {
    status: { type: 'string' as const },
    uptime: { type: 'number' as const },
    timestamp: { type: 'string' as const },
    checks: {
      type: 'object' as const,
      properties: {
        engine: { type: 'string' as const },
        agents: { type: 'string' as const },
        tick: { type: 'string' as const },
      },
    },
  },
};

/**
 * Liveness 探针 — 进程存活即返回 200
 *
 * K8s livenessProbe 用此端点判断是否需要重启容器。
 * 只要进程能响应 HTTP 就认为存活。
 */
function registerLivenessRoute(app: FastifyInstance): void {
  app.get(
    '/healthz/live',
    {
      schema: {
        tags: ['monitoring'],
        summary: 'Liveness 探针（K8s livenessProbe）',
        description: '进程存活即返回 200。用于 Kubernetes livenessProbe。',
        response: { 200: probeResponseSchema },
      },
    },
    async () => {
      return {
        status: 'alive',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    },
  );
}

/**
 * Readiness 探针 — 检查服务是否准备好接受流量
 *
 * K8s readinessProbe 用此端点判断是否将流量路由到此 Pod。
 * 检查项：
 * 1. WorldEngine 是否正在运行
 * 2. 是否有活跃的 Agent
 * 3. 是否已执行过至少 1 个 tick（初始化完成）
 */
function registerReadinessRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get(
    '/healthz/ready',
    {
      schema: {
        tags: ['monitoring'],
        summary: 'Readiness 探针（K8s readinessProbe）',
        description: '检查引擎就绪状态。引擎运行中且有活跃 Agent 时返回 200，否则返回 503。',
        response: {
          200: readinessResponseSchema,
          503: readinessResponseSchema,
        },
      },
    },
    async (_req, reply) => {
      const engine = ctx.engine;
      const agents = engine.getAgents();
      const tick = engine.getCurrentTick();
      const isRunning = engine.isRunning();
      const activeAgents = agents.filter((a) => a.status === 'active').length;

      const checks = {
        engine: isRunning ? 'running' : 'stopped',
        agents: activeAgents > 0 ? `${activeAgents} active` : 'none',
        tick: tick > 0 ? `tick ${tick}` : 'not_started',
      };

      // 就绪条件：引擎运行中 + 有活跃 Agent
      const isReady = isRunning && activeAgents > 0;

      const body = {
        status: isReady ? 'ready' : 'not_ready',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        checks,
      };

      return reply.code(isReady ? 200 : 503).send(body);
    },
  );
}

/**
 * 注册 Kubernetes 健康探针端点
 */
export function registerProbesRoute(app: FastifyInstance, ctx: ServerContext): void {
  registerLivenessRoute(app);
  registerReadinessRoute(app, ctx);
}
