// ============================================================================
// BeeClaw Server — Middleware: Rate Limiting
// @fastify/rate-limit 请求频率限制
// 默认 100 req/min，环境变量 BEECLAW_RATE_LIMIT 可调整
// /health 和 /metrics/prometheus 不限速
// ============================================================================

import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/** 不限速的路由列表 */
const EXEMPT_ROUTES = ['/health', '/metrics/prometheus'];

/**
 * 注册 Rate Limiting 中间件
 *
 * - 默认 100 req/min
 * - 环境变量 BEECLAW_RATE_LIMIT 可调整上限
 * - /health 和 /metrics/prometheus 不限速
 */
export async function registerRateLimitMiddleware(app: FastifyInstance): Promise<void> {
  const rawRateLimit = process.env['BEECLAW_RATE_LIMIT'] ?? '100';
  const parsedRateLimit = Number.parseInt(rawRateLimit, 10);
  const maxRequests = Number.isNaN(parsedRateLimit) ? 100 : parsedRateLimit;

  // BEECLAW_RATE_LIMIT<=0 → 禁用限速
  if (maxRequests <= 0) return;

  await app.register(rateLimit, {
    max: maxRequests,
    timeWindow: '1 minute',
    allowList: (_req, _key) => {
      const url = _req.url;
      for (const route of EXEMPT_ROUTES) {
        if (url === route || url.startsWith(route + '?') || url.startsWith(route + '/')) {
          return true;
        }
      }
      return false;
    },
    errorResponseBuilder: (_req, context) => ({
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${Math.ceil(context.ttl / 1000)} seconds`,
      statusCode: 429,
    }),
  });
}
