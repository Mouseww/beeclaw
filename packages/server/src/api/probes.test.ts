// ============================================================================
// @beeclaw/server — /healthz/live + /healthz/ready 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerProbesRoute } from './probes.js';

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
// GET /healthz/live — Liveness 探针
// ════════════════════════════════════════

describe('GET /healthz/live', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerProbesRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 200 和 status=alive', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz/live' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('alive');
  });

  it('应包含 uptime 和 timestamp 字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz/live' });
    const body = res.json();
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThan(0);
    expect(typeof body.timestamp).toBe('string');
  });

  it('timestamp 应为 ISO 8601 格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz/live' });
    const body = res.json();
    // 验证可以被 Date 解析
    const date = new Date(body.timestamp);
    expect(date.getTime()).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════
// GET /healthz/ready — Readiness 探针
// ════════════════════════════════════════

describe('GET /healthz/ready', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerProbesRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('无 Agent 时应返回 503 not_ready', async () => {
    // 引擎刚初始化，没有 Agent 且未运行
    const res = await app.inject({ method: 'GET', url: '/healthz/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('not_ready');
  });

  it('应包含 checks 对象', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz/ready' });
    const body = res.json();
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('engine');
    expect(body.checks).toHaveProperty('agents');
    expect(body.checks).toHaveProperty('tick');
  });

  it('引擎运行且有 Agent 时应返回 200 ready', async () => {
    // 添加 Agent 并标记运行
    const agents = testCtx.engine.spawner.spawnBatch(3, 0, 'cheap');
    testCtx.engine.addAgents(agents);
    testCtx.engine.markRunning(true);

    const res = await app.inject({ method: 'GET', url: '/healthz/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ready');
    expect(body.checks.engine).toBe('running');
  });

  it('引擎运行但无 Agent 时应返回 503', async () => {
    testCtx.engine.markRunning(true);
    const res = await app.inject({ method: 'GET', url: '/healthz/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('not_ready');
  });

  it('有 Agent 但引擎未运行时应返回 503', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0, 'cheap');
    testCtx.engine.addAgents(agents);
    // 不 markRunning

    const res = await app.inject({ method: 'GET', url: '/healthz/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('not_ready');
  });
});
