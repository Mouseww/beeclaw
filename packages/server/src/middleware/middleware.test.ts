// ============================================================================
// @beeclaw/server — Middleware 测试
// 覆盖 auth, CORS, rate-limit, request-logger
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthMiddleware } from './auth.js';
import { registerCorsMiddleware } from './cors.js';
import { registerRateLimitMiddleware } from './rate-limit.js';
import { registerRequestLogger } from './request-logger.js';

// ════════════════════════════════════════
// Auth Middleware
// ════════════════════════════════════════

describe('Auth Middleware', () => {
  let app: FastifyInstance;
  const API_KEY = 'test-secret-key-12345';

  // 构建带认证中间件的测试 app
  async function buildApp(apiKey?: string): Promise<FastifyInstance> {
    // 设置/清除环境变量
    if (apiKey) {
      process.env['BEECLAW_API_KEY'] = apiKey;
    } else {
      delete process.env['BEECLAW_API_KEY'];
    }

    const fastify = Fastify({ logger: false });
    registerAuthMiddleware(fastify);

    // 添加测试路由
    fastify.get('/api/status', async () => ({ ok: true }));
    fastify.post('/api/events', async () => ({ ok: true }));
    fastify.get('/health', async () => ({ status: 'ok' }));
    fastify.get('/metrics/prometheus', async () => 'metrics');

    await fastify.ready();
    return fastify;
  }

  afterEach(async () => {
    delete process.env['BEECLAW_API_KEY'];
    if (app) await app.close();
  });

  describe('认证已启用（BEECLAW_API_KEY 已设置）', () => {
    beforeEach(async () => {
      app = await buildApp(API_KEY);
    });

    it('有效 Bearer token 应通过认证', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
        headers: { authorization: `Bearer ${API_KEY}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('缺少 Authorization header 应返回 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Missing');
    });

    it('无效的 token 应返回 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
        headers: { authorization: 'Bearer wrong-token' },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Invalid API key');
    });

    it('非 Bearer 格式应返回 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
        headers: { authorization: `Basic ${API_KEY}` },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toContain('Bearer');
    });

    it('/health 不需要认证', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });
      expect(res.statusCode).toBe(200);
    });

    it('/metrics/prometheus 不需要认证', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics/prometheus',
      });
      expect(res.statusCode).toBe(200);
    });

    it('POST 请求也需要认证', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST 请求有 token 应通过', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: `Bearer ${API_KEY}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('认证未启用（BEECLAW_API_KEY 未设置）', () => {
    beforeEach(async () => {
      app = await buildApp(); // 不设 API key
    });

    it('无 token 也可以访问 API', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
      });
      expect(res.statusCode).toBe(200);
    });

    it('POST 请求无 token 也可以访问', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
      });
      expect(res.statusCode).toBe(200);
    });
  });
});

// ════════════════════════════════════════
// CORS Middleware
// ════════════════════════════════════════

describe('CORS Middleware', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    delete process.env['BEECLAW_CORS_ORIGINS'];
    if (app) await app.close();
  });

  async function buildApp(origins?: string): Promise<FastifyInstance> {
    if (origins) {
      process.env['BEECLAW_CORS_ORIGINS'] = origins;
    } else {
      delete process.env['BEECLAW_CORS_ORIGINS'];
    }

    const fastify = Fastify({ logger: false });
    await registerCorsMiddleware(fastify);
    fastify.get('/api/test', async () => ({ ok: true }));
    await fastify.ready();
    return fastify;
  }

  describe('开发模式（未设置 BEECLAW_CORS_ORIGINS）', () => {
    beforeEach(async () => {
      app = await buildApp();
    });

    it('应返回 CORS headers（允许所有来源）', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/test',
        headers: { origin: 'http://localhost:5173' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('OPTIONS 预检请求应返回 204', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/test',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });

  describe('生产模式（设置了 BEECLAW_CORS_ORIGINS）', () => {
    it('允许的域名应返回 CORS 头', async () => {
      app = await buildApp('https://dashboard.beeclaw.com,https://admin.beeclaw.com');

      const res = await app.inject({
        method: 'GET',
        url: '/api/test',
        headers: { origin: 'https://dashboard.beeclaw.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://dashboard.beeclaw.com');
    });

    it('不允许的域名不返回 Access-Control-Allow-Origin', async () => {
      app = await buildApp('https://dashboard.beeclaw.com');

      const res = await app.inject({
        method: 'GET',
        url: '/api/test',
        headers: { origin: 'https://evil.com' },
      });
      expect(res.statusCode).toBe(200);
      // 不允许的来源不应设置 ACAO header
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('应处理逗号分隔的多个域名', async () => {
      app = await buildApp('https://a.com, https://b.com , https://c.com');

      const res = await app.inject({
        method: 'GET',
        url: '/api/test',
        headers: { origin: 'https://b.com' },
      });
      expect(res.headers['access-control-allow-origin']).toBe('https://b.com');
    });
  });
});

// ════════════════════════════════════════
// Rate Limit Middleware
// ════════════════════════════════════════

describe('Rate Limit Middleware', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    delete process.env['BEECLAW_RATE_LIMIT'];
    if (app) await app.close();
  });

  async function buildApp(rateLimit?: string): Promise<FastifyInstance> {
    if (rateLimit) {
      process.env['BEECLAW_RATE_LIMIT'] = rateLimit;
    } else {
      delete process.env['BEECLAW_RATE_LIMIT'];
    }

    const fastify = Fastify({ logger: false });
    await registerRateLimitMiddleware(fastify);
    fastify.get('/api/test', async () => ({ ok: true }));
    fastify.get('/health', async () => ({ status: 'ok' }));
    fastify.get('/metrics/prometheus', async () => 'metrics');
    await fastify.ready();
    return fastify;
  }

  it('默认 100 req/min，少量请求应正常通过', async () => {
    app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/test',
    });
    expect(res.statusCode).toBe(200);
    // 应包含限速相关 headers
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('超过限额应返回 429', async () => {
    app = await buildApp('3'); // 每分钟仅 3 次

    // 发送 3 次正常请求
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/test' });
      expect(res.statusCode).toBe(200);
    }

    // 第 4 次应被限速
    const res = await app.inject({ method: 'GET', url: '/api/test' });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toContain('retry');
  });

  it('/health 不受限速影响', async () => {
    app = await buildApp('2'); // 每分钟仅 2 次

    // 先耗尽限额
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'GET', url: '/api/test' });
    }

    // /health 仍然正常
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('/metrics/prometheus 不受限速影响', async () => {
    app = await buildApp('2'); // 每分钟仅 2 次

    // 先耗尽限额
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'GET', url: '/api/test' });
    }

    // /metrics/prometheus 仍然正常
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.statusCode).toBe(200);
  });

  it('BEECLAW_RATE_LIMIT 环境变量应生效', async () => {
    app = await buildApp('5');

    const res = await app.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['x-ratelimit-limit']).toBe('5');
  });
});

// ════════════════════════════════════════
// Request Logger Middleware
// ════════════════════════════════════════

describe('Request Logger Middleware', () => {
  let app: FastifyInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    app = Fastify({ logger: false });
    registerRequestLogger(app);

    // 添加各种状态码的测试路由
    app.get('/ok', async () => ({ ok: true }));
    app.get('/not-found', async (_req, reply) => {
      reply.code(404).send({ error: 'Not Found' });
    });
    app.get('/server-error', async (_req, reply) => {
      reply.code(500).send({ error: 'Internal Server Error' });
    });

    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
  });

  it('200 响应应输出 console.log', async () => {
    await app.inject({ method: 'GET', url: '/ok' });

    const httpLogs = logSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[HTTP]')
    );
    expect(httpLogs.length).toBeGreaterThanOrEqual(1);
    expect(httpLogs[0]![0]).toContain('GET');
    expect(httpLogs[0]![0]).toContain('/ok');
    expect(httpLogs[0]![0]).toContain('200');
    expect(httpLogs[0]![0]).toMatch(/\d+\.\d+ms/);
  });

  it('404 响应应输出 console.warn', async () => {
    await app.inject({ method: 'GET', url: '/not-found' });

    const httpWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[HTTP]')
    );
    expect(httpWarns.length).toBeGreaterThanOrEqual(1);
    expect(httpWarns[0]![0]).toContain('GET');
    expect(httpWarns[0]![0]).toContain('/not-found');
    expect(httpWarns[0]![0]).toContain('404');
  });

  it('500 响应应输出 console.error', async () => {
    await app.inject({ method: 'GET', url: '/server-error' });

    const httpErrors = errorSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[HTTP]')
    );
    expect(httpErrors.length).toBeGreaterThanOrEqual(1);
    expect(httpErrors[0]![0]).toContain('GET');
    expect(httpErrors[0]![0]).toContain('/server-error');
    expect(httpErrors[0]![0]).toContain('500');
  });

  it('日志应包含耗时信息', async () => {
    await app.inject({ method: 'GET', url: '/ok' });

    const httpLogs = logSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[HTTP]')
    );
    expect(httpLogs.length).toBeGreaterThanOrEqual(1);
    // 匹配格式：数字.数字ms
    expect(httpLogs[0]![0]).toMatch(/\d+\.\d+ms/);
  });
});
