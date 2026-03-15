// ============================================================================
// BeeClaw Server — Middleware: API 认证
// Bearer token 认证，通过 BEECLAW_API_KEY 环境变量配置
// 不设置则不启用认证（开发模式）
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/** 不需要认证的路由前缀 */
const PUBLIC_ROUTES = ['/health', '/metrics/prometheus'];

/**
 * 判断请求路径是否为公开路由（不需要认证）
 */
function isPublicRoute(url: string): boolean {
  for (const route of PUBLIC_ROUTES) {
    if (url === route || url.startsWith(route + '?') || url.startsWith(route + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * 注册 Bearer token 认证中间件
 *
 * - 环境变量 BEECLAW_API_KEY 设置 API key
 * - 不设置则不启用认证（开发模式）
 * - /health 和 /metrics/prometheus 不需要认证
 * - 认证失败返回 401
 */
export function registerAuthMiddleware(app: FastifyInstance): void {
  const apiKey = process.env['BEECLAW_API_KEY'];

  // 不设置 API key 则不启用认证
  if (!apiKey) {
    return;
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 公开路由跳过认证
    if (isPublicRoute(request.url)) {
      return;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing Authorization header' });
      return;
    }

    // 支持 "Bearer <token>" 格式
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid Authorization format, expected: Bearer <token>' });
      return;
    }

    const token = parts[1];
    if (token !== apiKey) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API key' });
      return;
    }
  });
}
