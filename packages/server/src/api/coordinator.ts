// ============================================================================
// Coordinator API — 分布式协调器状态查询
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';

/**
 * 注册 Coordinator 状态查询路由
 */
export function registerCoordinatorRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get(
    '/api/coordinator',
    {
      schema: {
        tags: ['coordinator'],
        summary: '获取分布式协调器状态',
        description: '返回 TickCoordinator 的运行状态、Worker 信息和分片分配',
        response: {
          200: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', description: '是否启用分布式模式' },
              currentTick: { type: 'number', description: '当前 tick 编号' },
              workers: {
                type: 'array',
                description: 'Worker 列表',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    status: { type: 'string', enum: ['online', 'offline', 'unhealthy'] },
                    agentCount: { type: 'number' },
                    consecutiveTimeouts: { type: 'number' },
                    lastHeartbeat: { type: 'number' },
                  },
                },
              },
              assignments: {
                type: 'array',
                description: 'Agent 分片分配',
                items: {
                  type: 'object',
                  properties: {
                    workerId: { type: 'string' },
                    agentIds: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const status = ctx.engine.getCoordinatorStatus();

      if (!status) {
        return reply.code(404).send({
          error: 'Distributed mode is not enabled',
        });
      }

      return reply.send(status);
    },
  );
}
