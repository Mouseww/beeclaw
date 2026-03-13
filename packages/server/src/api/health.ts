// ============================================================================
// BeeClaw Server — API: /health
// 生产就绪的健康检查端点
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';

/**
 * 健康检查响应结构
 */
export interface HealthResponse {
  status: 'ok';
  uptime: number;
  version: string;
  tick: number;
}

/**
 * 注册 GET /health 健康检查端点
 *
 * 返回服务状态、运行时间、版本号和当前 tick 数
 */
export function registerHealthRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/health', async () => {
    const response: HealthResponse = {
      status: 'ok',
      uptime: process.uptime(),
      version: '0.1.0',
      tick: ctx.engine.getCurrentTick(),
    };
    return response;
  });
}
