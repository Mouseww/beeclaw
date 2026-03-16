// ============================================================================
// BeeClaw Server — Middleware: API 认证
// Bearer token / X-API-Key 认证，通过 BEECLAW_API_KEY 环境变量配置
// 不设置则不启用认证（开发模式）
// 支持 DB 中的 API Key 管理
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';

/** 不需要认证的路由前缀 */
const PUBLIC_ROUTES = ['/health', '/metrics/prometheus'];

/** 不需要认证的静态资源前缀 */
const STATIC_PREFIXES = ['/assets/', '/bee.svg'];

/** 对 API key 做 SHA-256 哈希 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** 生成随机 API key */
export function generateApiKey(): string {
  return `bk_${randomBytes(24).toString('hex')}`;
}

/**
 * 判断请求路径是否为公开路由（不需要认证）
 */
function isPublicRoute(url: string): boolean {
  for (const route of PUBLIC_ROUTES) {
    if (url === route || url.startsWith(route + '?') || url.startsWith(route + '/')) {
      return true;
    }
  }
  // 静态资源和根路径
  if (STATIC_PREFIXES.some(p => url.startsWith(p))) return true;
  if (url === '/' || url === '/index.html') return true;
  // 非 API / 非 WS 的请求（Dashboard 页面）
  if (!url.startsWith('/api/') && !url.startsWith('/ws')) return true;
  return false;
}

/**
 * 注册 API 认证中间件
 * - BEECLAW_API_KEY 环境变量设置 master key
 * - 不设置则不启用认证（开发模式向后兼容）
 * - /health, /metrics/prometheus, 静态资源不需要认证
 * - 支持 Authorization: Bearer <key> 和 X-API-Key: <key>
 * - 支持 WebSocket ?token=<key>
 * - getDbKeyHashes 回调函数用来查询 DB 中的 API keys
 */
export function registerAuthMiddleware(
  app: FastifyInstance,
  getDbKeyHashes?: () => Set<string>,
): void {
  const masterKey = process.env['BEECLAW_API_KEY'];

  // 不设置 API key 则不启用认证
  if (!masterKey) {
    return;
  }

  console.log('[Auth] API 鉴权已启用');

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 公开路由跳过认证
    if (isPublicRoute(request.url)) {
      return;
    }

    // WebSocket 通过 query param 鉴权
    if (request.url.startsWith('/ws')) {
      const token = (request.query as Record<string, string>)?.token;
      if (token && isValidKey(token, masterKey, getDbKeyHashes)) {
        return;
      }
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token' });
      return;
    }

    // 从 header 提取 key
    const authHeader = request.headers.authorization;
    const xApiKey = request.headers['x-api-key'] as string | undefined;

    let key: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      key = authHeader.slice(7);
    } else if (xApiKey) {
      key = xApiKey;
    }

    if (key && isValidKey(key, masterKey, getDbKeyHashes)) {
      return;
    }

    reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid API key' });
  });
}

function isValidKey(
  key: string,
  masterKey: string,
  getDbKeyHashes?: () => Set<string>,
): boolean {
  // 直接比对 master key
  if (key === masterKey) return true;
  // 比对 DB 中的 key hash
  if (getDbKeyHashes) {
    const keyHash = hashApiKey(key);
    return getDbKeyHashes().has(keyHash);
  }
  return false;
}
