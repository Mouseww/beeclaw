// ============================================================================
// @beeclaw/server — /api/keys 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerKeysRoute } from './keys.js';

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
// POST /api/keys — 创建 API Key
// ════════════════════════════════════════

describe('POST /api/keys', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerKeysRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功创建 API key 并返回明文 key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: { name: 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('test-key');
    expect(typeof body.key).toBe('string');
    expect(body.key.length).toBeGreaterThan(0);
    expect(body.permissions).toEqual(['read', 'write']);
    expect(body.rateLimit).toBe(100);
    expect(body.message).toContain('key');
  });

  it('应支持自定义 permissions 和 rateLimit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: {
        name: 'custom-key',
        permissions: ['read'],
        rateLimit: 50,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.permissions).toEqual(['read']);
    expect(body.rateLimit).toBe(50);
  });

  it('缺少 name 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });
});

// ════════════════════════════════════════
// GET /api/keys — 列出所有 API Keys
// ════════════════════════════════════════

describe('GET /api/keys', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerKeysRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('无 key 时应返回空列表', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/keys' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.keys).toEqual([]);
  });

  it('创建后应能列出 key', async () => {
    // 先创建一个
    await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: { name: 'listed-key' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/keys' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].name).toBe('listed-key');
  });

  it('创建多个 key 后应全部列出', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: { name: 'key-a' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: { name: 'key-b' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/keys' });
    const body = res.json();
    expect(body.keys).toHaveLength(2);
  });
});

// ════════════════════════════════════════
// DELETE /api/keys/:id — 删除 API Key
// ════════════════════════════════════════

describe('DELETE /api/keys/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerKeysRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功删除已有 key', async () => {
    // 创建
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: { name: 'to-delete' },
    });
    const id = createRes.json().id;

    // 删除
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/keys/${id}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().ok).toBe(true);
    expect(delRes.json().deleted).toBe(id);
  });

  it('删除不存在的 key 应返回 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/keys/nonexistent-id',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('API key not found');
  });

  it('删除后列表不再包含该 key', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/keys',
      payload: { name: 'will-be-gone' },
    });
    const id = createRes.json().id;

    await app.inject({ method: 'DELETE', url: `/api/keys/${id}` });

    const listRes = await app.inject({ method: 'GET', url: '/api/keys' });
    expect(listRes.json().keys).toEqual([]);
  });
});
