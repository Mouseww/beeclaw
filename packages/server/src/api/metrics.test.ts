// ============================================================================
// @beeclaw/server — /metrics 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerMetricsRoute } from './metrics.js';

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
// GET /metrics
// ════════════════════════════════════════

describe('GET /metrics', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerMetricsRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 200 和完整指标结构', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('server');
    expect(body).toHaveProperty('engine');
    expect(body).toHaveProperty('performance');
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('llm');
    expect(body).toHaveProperty('consensus');
    expect(body).toHaveProperty('memory');
    expect(body).toHaveProperty('wsConnections');
    expect(body).toHaveProperty('recentTicks');
  });

  // ── server 指标 ──

  it('server 应包含 uptime、uptimeFormatted、nodeVersion、pid', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { server } = res.json();
    expect(typeof server.uptime).toBe('number');
    expect(server.uptime).toBeGreaterThan(0);
    expect(typeof server.uptimeFormatted).toBe('string');
    expect(server.nodeVersion).toMatch(/^v\d+/);
    expect(typeof server.pid).toBe('number');
  });

  // ── engine 指标 ──

  it('engine 指标应反映引擎状态', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { engine } = res.json();
    expect(engine.currentTick).toBe(testCtx.engine.getCurrentTick());
    expect(typeof engine.running).toBe('boolean');
    expect(engine.totalAgents).toBe(0);
    expect(engine.activeAgents).toBe(0);
    expect(engine.dormantAgents).toBe(0);
    expect(engine.deadAgents).toBe(0);
  });

  it('添加 agents 后 engine 指标应更新', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { engine } = res.json();
    expect(engine.totalAgents).toBe(3);
    expect(engine.activeAgents).toBe(3);
  });

  // ── performance 指标 ──

  it('performance 应包含 cache、batchInference、activationPool', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { performance } = res.json();
    expect(performance).toHaveProperty('cache');
    expect(performance).toHaveProperty('batchInference');
    expect(performance).toHaveProperty('activationPool');
  });

  it('batchInference.avgDurationMs 应为整数', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { performance } = res.json();
    expect(Number.isInteger(performance.batchInference.avgDurationMs)).toBe(true);
  });

  // ── events 指标 ──

  it('events 指标应包含 activeEvents、totalEventsProcessed、totalResponsesCollected', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { events } = res.json();
    expect(typeof events.activeEvents).toBe('number');
    expect(typeof events.totalEventsProcessed).toBe('number');
    expect(typeof events.totalResponsesCollected).toBe('number');
  });

  // ── llm 指标 ──

  it('llm 指标无调用时 successRate 应为 1', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { llm } = res.json();
    expect(llm.totalCalls).toBe(0);
    expect(llm.successRate).toBe(1);
  });

  // ── memory 指标 ──

  it('memory 应包含 rss、heapTotal、heapUsed、rssMB、heapUsedMB', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { memory } = res.json();
    expect(memory.rss).toBeGreaterThan(0);
    expect(memory.heapTotal).toBeGreaterThan(0);
    expect(memory.heapUsed).toBeGreaterThan(0);
    expect(typeof memory.rssMB).toBe('string');
    expect(typeof memory.heapUsedMB).toBe('string');
  });

  // ── wsConnections ──

  it('wsConnections 应反映 getWsCount()', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const body = res.json();
    expect(body.wsConnections).toBe(0);
  });

  // ── recentTicks ──

  it('recentTicks 无历史时 count 应为 0，avg 应为 0', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const { recentTicks } = res.json();
    expect(recentTicks.count).toBe(0);
    expect(recentTicks.avgDurationMs).toBe(0);
    expect(recentTicks.avgEventsPerTick).toBe(0);
    expect(recentTicks.avgResponsesPerTick).toBe(0);
  });
});
