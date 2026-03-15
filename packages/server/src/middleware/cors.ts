// ============================================================================
// BeeClaw Server — Middleware: CORS
// @fastify/cors 跨域配置
// 环境变量 BEECLAW_CORS_ORIGINS 控制允许的域名（逗号分隔）
// 默认允许所有（开发模式）
// ============================================================================

import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

/**
 * 注册 CORS 中间件
 *
 * - 环境变量 BEECLAW_CORS_ORIGINS 设置允许的域名（逗号分隔）
 * - 不设置则允许所有来源（开发模式）
 */
export async function registerCorsMiddleware(app: FastifyInstance): Promise<void> {
  const originsEnv = process.env['BEECLAW_CORS_ORIGINS'];

  if (originsEnv) {
    // 解析逗号分隔的域名列表，过滤空字符串
    const origins = originsEnv
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    await app.register(cors, {
      origin: origins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
  } else {
    // 开发模式：允许所有来源
    await app.register(cors, {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
  }
}
