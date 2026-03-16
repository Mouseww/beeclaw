// ============================================================================
// @beeclaw/server — /health 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerHealthRoute } from './health.js';

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
// GET /health
// ════════════════════════════════════════

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerHealthRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 200 和 status=ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });

  it('应包含 uptime、version、tick 字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('tick');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.version).toBe('string');
    expect(typeof body.tick).toBe('number');
  });

  it('uptime 应为正数', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body.uptime).toBeGreaterThan(0);
  });

  it('tick 应与引擎当前 tick 一致', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body.tick).toBe(testCtx.engine.getCurrentTick());
  });

  it('version 应为符合 semver 的字符串', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    // 简单格式校验 x.y.z
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
