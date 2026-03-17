// ============================================================================
// @beeclaw/server — /api/webhooks 路由测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerWebhooksRoute } from './webhooks.js';

// ── 共享 setup ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(0);
});

afterEach(async () => {
  await testCtx.app.close();
});

// ════════════════════════════════════════
// POST /api/webhooks — 创建 webhook
// ════════════════════════════════════════

describe('POST /api/webhooks', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功创建 webhook 并返回 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.webhook).toBeDefined();
    expect(body.webhook.url).toBe('https://example.com/hook');
    expect(body.webhook.events).toEqual(['tick.completed']);
    expect(body.webhook.active).toBe(true);
  });

  it('应自动生成 id 和 secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['consensus.signal'],
      },
    });
    const body = res.json();
    expect(body.webhook.id).toMatch(/^wh_/);
    expect(typeof body.webhook.secret).toBe('string');
    expect(body.webhook.secret.length).toBeGreaterThan(0);
  });

  it('应支持自定义 secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
        secret: 'my-custom-secret',
      },
    });
    const body = res.json();
    expect(body.webhook.secret).toBe('my-custom-secret');
  });

  it('应支持多个事件类型', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed', 'consensus.signal', 'trend.detected'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.webhook.events).toHaveLength(3);
  });

  // ── 参数验证 ──

  it('缺少 url 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        events: ['tick.completed'],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('缺少 events 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('events 为空数组应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('无效事件类型应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['invalid.event'],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════
// GET /api/webhooks — 列出所有 webhook
// ════════════════════════════════════════

describe('GET /api/webhooks', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('无 webhook 时应返回空列表', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/webhooks' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.webhooks).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('应返回已创建的 webhooks', async () => {
    // 先创建一个
    await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook1',
        events: ['tick.completed'],
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/webhooks' });
    const body = res.json();
    expect(body.webhooks).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('secret 应被掩码处理', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/webhooks' });
    const body = res.json();
    expect(body.webhooks[0].secret).toContain('••••••');
  });
});

// ════════════════════════════════════════
// DELETE /api/webhooks/:id — 删除 webhook
// ════════════════════════════════════════

describe('DELETE /api/webhooks/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功删除已有 webhook', async () => {
    // 创建
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
      },
    });
    const id = createRes.json().webhook.id;

    // 删除
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/webhooks/${id}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().ok).toBe(true);
  });

  it('删除不存在的 webhook 应返回 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/webhooks/nonexistent',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Webhook not found');
  });

  it('删除后列表不再包含该 webhook', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
      },
    });
    const id = createRes.json().webhook.id;

    await app.inject({ method: 'DELETE', url: `/api/webhooks/${id}` });

    const listRes = await app.inject({ method: 'GET', url: '/api/webhooks' });
    expect(listRes.json().total).toBe(0);
  });
});

// ════════════════════════════════════════
// PUT /api/webhooks/:id — 更新 webhook
// ════════════════════════════════════════

describe('PUT /api/webhooks/:id', () => {
  let app: FastifyInstance;
  let webhookId: string;

  beforeEach(async () => {
    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;

    // 预先创建一个 webhook
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/original',
        events: ['tick.completed'],
      },
    });
    webhookId = createRes.json().webhook.id;
  });

  it('应成功更新 url', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: { url: 'https://example.com/updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('应成功更新 events', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: { events: ['consensus.signal', 'trend.detected'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.webhook.events).toEqual(['consensus.signal', 'trend.detected']);
  });

  it('应成功更新 active 状态', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: { active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().webhook.active).toBe(false);
  });

  it('更新不存在的 webhook 应返回 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/webhooks/nonexistent',
      payload: { url: 'https://example.com/new' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Webhook not found');
  });

  it('无效事件类型应返回 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: { events: ['invalid.type'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('events 空数组应返回 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════
// POST /api/webhooks/:id/test — 测试 webhook
// ════════════════════════════════════════

describe('POST /api/webhooks/:id/test', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('webhook 不存在应返回 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/nonexistent/test',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Webhook not found');
  });

  it('无 webhookDispatcher 时应返回 503', async () => {
    // 默认 testCtx 不带 webhookDispatcher
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
      },
    });
    const id = createRes.json().webhook.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${id}/test`,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('Webhook dispatcher not available');
  });

  it('有 dispatcher 时应调用 sendTest 并返回结果', async () => {
    // 重建带 dispatcher mock 的 context
    await testCtx.app.close();
    testCtx = await buildTestContext(0);

    const mockDelivery = {
      id: 'del-1',
      subscriptionId: 'wh_test',
      event: 'tick.completed' as const,
      status: 'success' as const,
      httpStatus: 200,
      timestamp: Date.now(),
      durationMs: 100,
    };
    const mockDispatcher = {
      sendTest: vi.fn().mockResolvedValue(mockDelivery),
    };
    (testCtx.ctx as Record<string, unknown>)['webhookDispatcher'] = mockDispatcher;

    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;

    // 创建 webhook
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
      },
    });
    const id = createRes.json().webhook.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${id}/test`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.delivery).toBeDefined();
    expect(mockDispatcher.sendTest).toHaveBeenCalled();
  });

  it('sendTest 返回失败状态时 ok 应为 false', async () => {
    await testCtx.app.close();
    testCtx = await buildTestContext(0);

    const failedDelivery = {
      id: 'del-2',
      subscriptionId: 'wh_test',
      event: 'tick.completed' as const,
      status: 'failed' as const,
      httpStatus: 500,
      timestamp: Date.now(),
      durationMs: 200,
    };
    const mockDispatcher = {
      sendTest: vi.fn().mockResolvedValue(failedDelivery),
    };
    (testCtx.ctx as Record<string, unknown>)['webhookDispatcher'] = mockDispatcher;

    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/hook',
        events: ['tick.completed'],
      },
    });
    const id = createRes.json().webhook.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${id}/test`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.delivery.status).toBe('failed');
  });
});

// ════════════════════════════════════════
// PUT /api/webhooks/:id — 覆盖率补充
// ════════════════════════════════════════

describe('PUT /api/webhooks/:id (覆盖率补充)', () => {
  let app: FastifyInstance;
  let webhookId: string;

  beforeEach(async () => {
    registerWebhooksRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      payload: {
        url: 'https://example.com/original',
        events: ['tick.completed'],
      },
    });
    webhookId = createRes.json().webhook.id;
  });

  it('同时更新 url 和 active 应都生效', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: { url: 'https://example.com/new-url', active: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.webhook.url).toBe('https://example.com/new-url');
    expect(body.webhook.active).toBe(false);
  });

  it('同时更新 url、events 和 active 应都生效', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: {
        url: 'https://example.com/all-fields',
        events: ['consensus.signal', 'trend.shift'],
        active: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.webhook.url).toBe('https://example.com/all-fields');
    expect(body.webhook.events).toEqual(['consensus.signal', 'trend.shift']);
    expect(body.webhook.active).toBe(false);
  });

  it('更新包含混合有效和无效事件类型时应返回 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/webhooks/${webhookId}`,
      payload: { events: ['tick.completed', 'invalid.event'] },
    });
    expect(res.statusCode).toBe(400);
  });
});
