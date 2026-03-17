// ============================================================================
// @beeclaw/server Webhook 系统测试
// WebhookDispatcher 单元测试 + API 路由集成测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig, WebhookSubscription, WebhookEventType } from '@beeclaw/shared';
import { initDatabase } from './persistence/database.js';
import { Store } from './persistence/store.js';
import { WebhookDispatcher, computeSignature, calculateBackoff } from './webhook/dispatcher.js';
import { registerWebhooksRoute } from './api/webhooks.js';
import type { ServerContext } from './index.js';

// ── Mock 配置 ──

const TEST_CONFIG: WorldConfig = {
  tickIntervalMs: 100,
  maxAgents: 50,
  eventRetentionTicks: 50,
  enableNaturalSelection: false,
};

const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

function createMockedModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
      return '{"opinion":"中立","action":"silent","emotionalState":0.0,"reasoning":"观望"}';
    });
  }
  return router;
}

// ── 测试工具 ──

function createTestStore(): Store {
  const db = initDatabase(':memory:');
  return new Store(db);
}

function createTestSubscription(overrides?: Partial<WebhookSubscription>): WebhookSubscription {
  return {
    id: `wh_${Math.random().toString(36).slice(2, 10)}`,
    url: 'https://example.com/webhook',
    events: ['consensus.signal'] as WebhookEventType[],
    secret: 'test-secret-key',
    active: true,
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function createMockFetch(statusCode = 200, delay = 0): typeof fetch {
  return vi.fn(async () => {
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    return new Response('OK', { status: statusCode });
  }) as unknown as typeof fetch;
}

function createFailingFetch(errorMessage = 'Connection refused'): typeof fetch {
  return vi.fn(async () => {
    throw new Error(errorMessage);
  }) as unknown as typeof fetch;
}

async function buildWebhookTestApp(): Promise<{
  app: FastifyInstance;
  store: Store;
  dispatcher: WebhookDispatcher;
  engine: WorldEngine;
}> {
  const store = createTestStore();
  const modelRouter = createMockedModelRouter();
  const engine = new WorldEngine({
    config: TEST_CONFIG,
    modelRouter,
    concurrency: 3,
  });
  const mockFetch = createMockFetch();
  const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);

  const app = Fastify({
    logger: false,
    schemaErrorFormatter(errors, dataVar) {
      const first = errors[0];
      if (first) {
        const field = first.instancePath
          ? first.instancePath.replace(/^\//, '').replace(/\//g, '.')
          : (first.params as Record<string, unknown>)?.['missingProperty'] as string | undefined;
        const msg = field
          ? `${field}: ${first.message ?? 'validation failed'}`
          : `${dataVar} ${first.message ?? 'validation failed'}`;
        return new Error(msg);
      }
      return new Error('Validation failed');
    },
  });

  const ctx: ServerContext = {
    engine,
    store,
    modelRouter,
    getWsCount: () => 0,
    webhookDispatcher: dispatcher,
  };

  registerWebhooksRoute(app, ctx);

  // 将 schema validation 错误统一为 { error: "..." } 格式
  app.setErrorHandler((error, _req, reply) => {
    if (error.validation) {
      return reply.status(400).send({ error: error.message });
    }
    reply.status(error.statusCode ?? 500).send({ error: error.message });
  });

  await app.ready();

  return { app, store, dispatcher, engine };
}

// ════════════════════════════════════════
// WebhookDispatcher 单元测试
// ════════════════════════════════════════

describe('WebhookDispatcher', () => {
  let store: Store;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store = createTestStore();
  });

  // ── 签名验证 ──

  describe('HMAC-SHA256 签名', () => {
    it('应使用 secret 生成正确的 HMAC-SHA256 签名', () => {
      const payload = '{"event":"tick.completed","data":{},"timestamp":1234567890}';
      const secret = 'my-secret';
      const expected = createHmac('sha256', secret).update(payload).digest('hex');

      const result = computeSignature(payload, secret);
      expect(result).toBe(expected);
    });

    it('不同 secret 应产生不同签名', () => {
      const payload = '{"test": true}';
      const sig1 = computeSignature(payload, 'secret-1');
      const sig2 = computeSignature(payload, 'secret-2');
      expect(sig1).not.toBe(sig2);
    });

    it('不同 payload 应产生不同签名', () => {
      const secret = 'same-secret';
      const sig1 = computeSignature('{"a":1}', secret);
      const sig2 = computeSignature('{"b":2}', secret);
      expect(sig1).not.toBe(sig2);
    });
  });

  // ── 基本分发 ──

  describe('基本分发', () => {
    it('应成功发送 webhook 到订阅者', async () => {
      const mockFetch = createMockFetch(200);
      const sub = createTestSubscription({ events: ['consensus.signal'] });
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', { test: true });

      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe('success');
      expect(records[0]!.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('不匹配的事件类型不应触发发送', async () => {
      const mockFetch = createMockFetch(200);
      const sub = createTestSubscription({ events: ['tick.completed'] });
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', { test: true });

      expect(records).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('非活跃订阅不应触发发送', async () => {
      const mockFetch = createMockFetch(200);
      const sub = createTestSubscription({ active: false });
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', { test: true });

      expect(records).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('应向多个订阅者分发同一事件', async () => {
      const mockFetch = createMockFetch(200);
      store.createWebhook(createTestSubscription({ id: 'wh_1', events: ['consensus.signal'] }));
      store.createWebhook(createTestSubscription({ id: 'wh_2', events: ['consensus.signal'] }));
      store.createWebhook(createTestSubscription({ id: 'wh_3', events: ['tick.completed'] }));

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', {});

      expect(records).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('发送请求应包含正确的 HTTP 头', async () => {
      const mockFetch = vi.fn(async () => new Response('OK', { status: 200 })) as unknown as typeof fetch;
      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      await dispatcher.dispatchAsync('consensus.signal', { x: 1 });

      const call = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const init = call[1] as RequestInit;
      const headers = init.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-BeeClaw-Event']).toBe('consensus.signal');
      expect(headers['X-BeeClaw-Signature']).toBeDefined();
      expect(headers['X-BeeClaw-Timestamp']).toBeDefined();
    });
  });

  // ── 重试逻辑 ──

  describe('重试逻辑', () => {
    it('HTTP 500 应触发重试并标记为 failed', async () => {
      const mockFetch = createMockFetch(500);
      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 2, timeoutMs: 1000 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', {});

      // 应该重试了 2 次
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe('failed');
    });

    it('网络错误应触发重试', async () => {
      const mockFetch = createFailingFetch('ECONNREFUSED');
      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 2, timeoutMs: 1000 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', {});

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(records[0]!.status).toBe('failed');
      expect(records[0]!.error).toContain('ECONNREFUSED');
    });

    it('第一次失败、第二次成功应返回 success', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) throw new Error('temporary failure');
        return new Response('OK', { status: 200 });
      }) as unknown as typeof fetch;

      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 3, timeoutMs: 1000 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', {});

      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe('success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── 并发控制 ──

  describe('并发控制', () => {
    it('应限制并发请求数量', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const mockFetch = vi.fn(async () => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
        await new Promise(r => setTimeout(r, 50));
        currentConcurrent--;
        return new Response('OK', { status: 200 });
      }) as unknown as typeof fetch;

      // 创建 15 个订阅者
      for (let i = 0; i < 15; i++) {
        store.createWebhook(createTestSubscription({ id: `wh_${i}`, events: ['consensus.signal'] }));
      }

      const dispatcher = new WebhookDispatcher(
        store,
        { maxRetries: 1, maxConcurrency: 5 },
        mockFetch,
      );
      const records = await dispatcher.dispatchAsync('consensus.signal', {});

      expect(records).toHaveLength(15);
      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });

    it('getActiveRequests 应追踪活跃请求数', async () => {
      let resolveRequest: (() => void) | null = null;
      const mockFetch = vi.fn(() => {
        return new Promise<Response>((resolve) => {
          resolveRequest = () => resolve(new Response('OK', { status: 200 }));
        });
      }) as unknown as typeof fetch;

      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);

      // 启动分发但不等待
      const promise = dispatcher.dispatchAsync('consensus.signal', {});

      // 等待 fetch 被调用
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      expect(dispatcher.getActiveRequests()).toBe(1);

      // 完成请求
      resolveRequest!();
      await promise;

      expect(dispatcher.getActiveRequests()).toBe(0);
    });
  });

  // ── 投递日志 ──

  describe('投递日志', () => {
    it('应记录投递历史', async () => {
      const mockFetch = createMockFetch(200);
      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      await dispatcher.dispatchAsync('consensus.signal', {});

      const log = dispatcher.getDeliveryLog();
      expect(log).toHaveLength(1);
      expect(log[0]!.subscriptionId).toBe(sub.id);
      expect(log[0]!.event).toBe('consensus.signal');
      expect(log[0]!.status).toBe('success');
      expect(log[0]!.attempt).toBe(1);
      expect(log[0]!.timestamp).toBeGreaterThan(0);
    });

    it('投递日志应保留最近 500 条并裁剪旧记录', async () => {
      const mockFetch = createMockFetch(500); // 失败以触发重试

      // 创建足够多的订阅者来产生 500+ 条日志
      for (let i = 0; i < 200; i++) {
        store.createWebhook(createTestSubscription({ id: `wh_log_${i}`, events: ['consensus.signal'] }));
      }

      // maxRetries = 3 → 每个订阅 3 条记录 → 200 * 3 = 600 条
      const noopSleep = async (_ms: number) => {};
      const dispatcher = new WebhookDispatcher(store, { maxRetries: 3 }, mockFetch, noopSleep);
      await dispatcher.dispatchAsync('consensus.signal', {});

      const log = dispatcher.getDeliveryLog();
      expect(log.length).toBeLessThanOrEqual(500);
    });
  });

  // ── dispatch (fire-and-forget) ──

  describe('dispatch (fire-and-forget)', () => {
    it('dispatch 应异步启动发送而不阻塞', async () => {
      const mockFetch = createMockFetch(200);
      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      // dispatch 是 fire-and-forget，不返回 Promise
      dispatcher.dispatch('consensus.signal', { test: true });

      // 等待异步操作完成
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ── getConfig ──

  describe('getConfig', () => {
    it('应返回配置的只读副本', () => {
      const mockFetch = createMockFetch(200);
      const dispatcher = new WebhookDispatcher(store, { maxRetries: 5, timeoutMs: 5000 }, mockFetch);
      const config = dispatcher.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.timeoutMs).toBe(5000);
      expect(config.maxConcurrency).toBe(10); // 默认值
    });
  });

  // ── calculateBackoff 边界 ──

  describe('calculateBackoff', () => {
    it('jitter=false 时应返回精确的指数退避', () => {
      // attempt=2: base * 2^0 = base
      expect(calculateBackoff(2, 1000, false)).toBe(1000);
      // attempt=3: base * 2^1 = 2 * base
      expect(calculateBackoff(3, 1000, false)).toBe(2000);
      // attempt=4: base * 2^2 = 4 * base
      expect(calculateBackoff(4, 1000, false)).toBe(4000);
    });

    it('jitter=true 时应返回带随机偏移的退避', () => {
      // 多次调用，验证结果在合理范围内
      const results = Array.from({ length: 20 }, () => calculateBackoff(2, 1000, true));
      for (const r of results) {
        // 基础 1000 + jitter [0, 500)
        expect(r).toBeGreaterThanOrEqual(1000);
        expect(r).toBeLessThanOrEqual(1500);
      }
    });
  });

  // ── 重试中间状态标记 ──

  describe('重试中间状态标记', () => {
    it('重试中间尝试应标记为 retrying', async () => {
      const mockFetch = createMockFetch(500); // 始终失败
      const sub = createTestSubscription();
      store.createWebhook(sub);

      const noopSleep = async (_ms: number) => {};
      const dispatcher = new WebhookDispatcher(store, { maxRetries: 3, retryBaseMs: 10 }, mockFetch, noopSleep);
      const records = await dispatcher.dispatchAsync('consensus.signal', {});

      // 最终应该有 1 条 failed 记录返回
      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe('failed');

      // 投递日志应包含 3 条记录（attempt 1, 2, 3）
      const log = dispatcher.getDeliveryLog();
      expect(log).toHaveLength(3);
      // 前两条应标记为 retrying
      expect(log[0]!.status).toBe('retrying');
      expect(log[1]!.status).toBe('retrying');
      // 最后一条应是 failed
      expect(log[2]!.status).toBe('failed');
    });

    it('重试时应正确计算退避延迟', async () => {
      const mockFetch = createMockFetch(500);
      const sub = createTestSubscription();
      store.createWebhook(sub);

      const sleepCalls: number[] = [];
      const trackingSleep = async (ms: number) => { sleepCalls.push(ms); };
      const dispatcher = new WebhookDispatcher(
        store,
        { maxRetries: 3, retryBaseMs: 100, retryJitter: false },
        mockFetch,
        trackingSleep,
      );
      await dispatcher.dispatchAsync('consensus.signal', {});

      // 应该有 2 次 sleep（attempt 2 和 attempt 3）
      expect(sleepCalls).toHaveLength(2);
      // attempt=2: 100 * 2^0 = 100
      expect(sleepCalls[0]).toBe(100);
      // attempt=3: 100 * 2^1 = 200
      expect(sleepCalls[1]).toBe(200);
    });
  });

  // ── 网络异常的错误消息 ──

  describe('网络异常的错误消息', () => {
    it('非 Error 类型的异常应被转为字符串', async () => {
      const mockFetch = vi.fn(async () => {
        throw 'string error';
      }) as unknown as typeof fetch;

      const sub = createTestSubscription();
      store.createWebhook(sub);

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      const records = await dispatcher.dispatchAsync('consensus.signal', {});

      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe('failed');
      expect(records[0]!.error).toBe('string error');
    });
  });

  // ── 测试发送 ──

  describe('sendTest', () => {
    it('应发送测试 payload', async () => {
      const mockFetch = createMockFetch(200);
      const sub = createTestSubscription();

      const dispatcher = new WebhookDispatcher(store, { maxRetries: 1 }, mockFetch);
      const record = await dispatcher.sendTest(sub);

      expect(record.status).toBe('success');
      expect(record.event).toBe('tick.completed');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

// ════════════════════════════════════════
// Webhook API 路由集成测试
// ════════════════════════════════════════

describe('Webhook API 路由集成测试', () => {
  let app: FastifyInstance;
  let _store: Store;
  let _dispatcher: WebhookDispatcher;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const built = await buildWebhookTestApp();
    app = built.app;
    _store = built.store;
    _dispatcher = built.dispatcher;
  });

  afterEach(async () => {
    await app.close();
  });

  // ── POST /api/webhooks ──

  describe('POST /api/webhooks', () => {
    it('应成功创建 webhook 订阅', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: {
          url: 'https://example.com/hook',
          events: ['consensus.signal', 'tick.completed'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.webhook.id).toMatch(/^wh_/);
      expect(body.webhook.url).toBe('https://example.com/hook');
      expect(body.webhook.events).toEqual(['consensus.signal', 'tick.completed']);
      expect(body.webhook.active).toBe(true);
      expect(body.webhook.secret).toBeDefined();
      expect(body.webhook.secret.length).toBeGreaterThan(10);
    });

    it('可自定义 secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: {
          url: 'https://example.com/hook',
          events: ['tick.completed'],
          secret: 'my-custom-secret',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().webhook.secret).toBe('my-custom-secret');
    });

    it('缺少 url 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { events: ['tick.completed'] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('url');
    });

    it('events 为空数组应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://example.com', events: [] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('events');
    });

    it('无效事件类型应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://example.com', events: ['invalid.event'] },
      });
      expect(res.statusCode).toBe(400);
      // schema validation 或手动校验均会包含 'events' 字段名
      expect(res.json().error).toContain('events');
    });
  });

  // ── GET /api/webhooks ──

  describe('GET /api/webhooks', () => {
    it('无订阅时应返回空列表', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/webhooks' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.webhooks).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('应列出所有 webhook 且 secret 被掩码', async () => {
      // 先创建两个
      await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://a.com', events: ['tick.completed'] },
      });
      await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://b.com', events: ['consensus.signal'] },
      });

      const res = await app.inject({ method: 'GET', url: '/api/webhooks' });
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.webhooks).toHaveLength(2);
      // 验证 secret 被掩码
      for (const wh of body.webhooks) {
        expect(wh.secret).toContain('••••••');
      }
    });
  });

  // ── DELETE /api/webhooks/:id ──

  describe('DELETE /api/webhooks/:id', () => {
    it('应成功删除存在的 webhook', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://example.com', events: ['tick.completed'] },
      });
      const { id } = createRes.json().webhook;

      const res = await app.inject({ method: 'DELETE', url: `/api/webhooks/${id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      // 确认已删除
      const listRes = await app.inject({ method: 'GET', url: '/api/webhooks' });
      expect(listRes.json().total).toBe(0);
    });

    it('删除不存在的 webhook 应返回 404', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/webhooks/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── PUT /api/webhooks/:id ──

  describe('PUT /api/webhooks/:id', () => {
    it('应成功更新 webhook 的 url', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://old.com', events: ['tick.completed'] },
      });
      const { id } = createRes.json().webhook;

      const res = await app.inject({
        method: 'PUT',
        url: `/api/webhooks/${id}`,
        payload: { url: 'https://new.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().webhook.url).toBe('https://new.com');
    });

    it('应成功更新 webhook 的 events', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://example.com', events: ['tick.completed'] },
      });
      const { id } = createRes.json().webhook;

      const res = await app.inject({
        method: 'PUT',
        url: `/api/webhooks/${id}`,
        payload: { events: ['consensus.signal', 'trend.detected'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().webhook.events).toEqual(['consensus.signal', 'trend.detected']);
    });

    it('应成功停用 webhook', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://example.com', events: ['tick.completed'] },
      });
      const { id } = createRes.json().webhook;

      const res = await app.inject({
        method: 'PUT',
        url: `/api/webhooks/${id}`,
        payload: { active: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().webhook.active).toBe(false);
    });

    it('更新不存在的 webhook 应返回 404', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/webhooks/nonexistent',
        payload: { url: 'https://new.com' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('无效事件类型应返回 400', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://example.com', events: ['tick.completed'] },
      });
      const { id } = createRes.json().webhook;

      const res = await app.inject({
        method: 'PUT',
        url: `/api/webhooks/${id}`,
        payload: { events: ['bad.event'] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── POST /api/webhooks/:id/test ──

  describe('POST /api/webhooks/:id/test', () => {
    it('应成功发送测试 payload', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { url: 'https://example.com', events: ['tick.completed'] },
      });
      const { id } = createRes.json().webhook;

      const res = await app.inject({
        method: 'POST',
        url: `/api/webhooks/${id}/test`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
      expect(res.json().delivery).toBeDefined();
      expect(res.json().delivery.status).toBe('success');
    });

    it('webhook 不存在测试应返回 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/nonexistent/test',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
