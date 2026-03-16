// ============================================================================
// BeeClaw Server — API: /health
// 生产就绪的健康检查端点
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { healthSchema } from './schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
const PKG_VERSION: string = pkg.version;

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
  app.get('/health', { schema: healthSchema }, async () => {
    const response: HealthResponse = {
      status: 'ok',
      uptime: process.uptime(),
      version: PKG_VERSION,
      tick: ctx.engine.getCurrentTick(),
    };
    return response;
  });
}
