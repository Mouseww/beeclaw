// ============================================================================
// @beeclaw/server — /api/status 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerStatusRoute } from './status.js';

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
// GET /api/status
// ════════════════════════════════════════

describe('GET /api/status', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerStatusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 200 和所有必要字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('tick');
    expect(body).toHaveProperty('agentCount');
    expect(body).toHaveProperty('activeAgents');
    expect(body).toHaveProperty('sentiment');
    expect(body).toHaveProperty('activeEvents');
    expect(body).toHaveProperty('lastTick');
    expect(body).toHaveProperty('wsConnections');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('running');
  });

  it('无 agent 时 agentCount 和 activeAgents 应为 0', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.agentCount).toBe(0);
    expect(body.activeAgents).toBe(0);
  });

  it('添加 agents 后应正确反映数量', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(5, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.agentCount).toBe(5);
    expect(body.activeAgents).toBe(5); // 新 spawn 的 agent 默认 active
  });

  it('lastTick 初始时应为 null', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.lastTick).toBeNull();
  });

  it('wsConnections 应反映构建时传入的 wsCount', async () => {
    // 默认 wsCount = 0
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.wsConnections).toBe(0);
  });

  it('wsConnections 应反映非零 wsCount', async () => {
    await testCtx.app.close();
    // 创建新 context，带有 wsCount=3
    testCtx = await buildTestContext(3);
    registerStatusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();

    const res = await testCtx.app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.wsConnections).toBe(3);
  });

  it('running 应为 boolean 类型', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(typeof body.running).toBe('boolean');
  });

  it('uptime 应为正数', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.uptime).toBeGreaterThan(0);
  });
});
