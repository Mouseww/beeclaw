// ============================================================================
// @beeclaw/server — /api/history + /api/ticks + /api/events/search 路由测试
// ============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerHistoryRoute } from './history.js';

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
// GET /api/history
// ════════════════════════════════════════

describe('GET /api/history', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerHistoryRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('初始状态应返回 200 和 history + source 字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/history' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('history');
    expect(body).toHaveProperty('source');
  });

  it('应支持 limit 参数', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/history?limit=10',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.history.length).toBeLessThanOrEqual(10);
  });

  it('limit 超出上限应被 clamp 到 200', async () => {
    // 不会报错，内部自动 clamp
    const res = await app.inject({
      method: 'GET',
      url: '/api/history?limit=999',
    });
    expect(res.statusCode).toBe(200);
  });

  it('limit 为无效字符串应使用默认值', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/history?limit=abc',
    });
    expect(res.statusCode).toBe(200);
  });

  it('数据库有数据时 source 应为 db', async () => {
    const mockHistory = [
      { tick: 1, eventsProcessed: 2, agentsActivated: 5, responsesCollected: 3, newAgentsSpawned: 0, signals: 1, durationMs: 100 },
    ];
    vi.spyOn(testCtx.store, 'getTickHistory').mockReturnValue(mockHistory as any);

    const res = await app.inject({ method: 'GET', url: '/api/history' });
    const body = res.json();
    expect(body.source).toBe('db');
    expect(body.history).toHaveLength(1);
  });

  it('数据库无数据时应 fallback 到 memory', async () => {
    vi.spyOn(testCtx.store, 'getTickHistory').mockReturnValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/history' });
    const body = res.json();
    expect(body.source).toBe('memory');
  });

  it('执行 step 后 memory source 应有数据', async () => {
    vi.spyOn(testCtx.store, 'getTickHistory').mockReturnValue([]);
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);
    await testCtx.engine.step();

    const res = await app.inject({ method: 'GET', url: '/api/history' });
    const body = res.json();
    expect(body.source).toBe('memory');
    expect(body.history.length).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════
// GET /api/ticks/:tick/events
// ════════════════════════════════════════

describe('GET /api/ticks/:tick/events', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerHistoryRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回指定 tick 的事件列表', async () => {
    const mockEvents = [
      { id: 'evt-1', title: '测试事件', category: 'general', importance: 0.5 },
    ];
    vi.spyOn(testCtx.store, 'getEventsByTick').mockReturnValue(mockEvents as any);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ticks/1/events',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tick).toBe(1);
    expect(body.events).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.events[0].id).toBe('evt-1');
  });

  it('无事件的 tick 应返回空数组', async () => {
    vi.spyOn(testCtx.store, 'getEventsByTick').mockReturnValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ticks/999/events',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tick).toBe(999);
    expect(body.events).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('tick 参数应正确解析为整数', async () => {
    vi.spyOn(testCtx.store, 'getEventsByTick').mockReturnValue([]);

    await app.inject({ method: 'GET', url: '/api/ticks/42/events' });
    expect(testCtx.store.getEventsByTick).toHaveBeenCalledWith(42);
  });
});

// ════════════════════════════════════════
// GET /api/ticks/:tick/responses
// ════════════════════════════════════════

describe('GET /api/ticks/:tick/responses', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerHistoryRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回指定 tick 的 Agent 响应列表', async () => {
    const mockResponses = [
      { agentId: 'agent-1', agentName: 'Alice', opinion: '看好', action: 'speak', emotionalState: 0.5 },
    ];
    vi.spyOn(testCtx.store, 'getResponsesByTick').mockReturnValue(mockResponses as any);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ticks/3/responses',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tick).toBe(3);
    expect(body.responses).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.responses[0].agentId).toBe('agent-1');
  });

  it('无响应的 tick 应返回空数组', async () => {
    vi.spyOn(testCtx.store, 'getResponsesByTick').mockReturnValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ticks/999/responses',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tick).toBe(999);
    expect(body.responses).toEqual([]);
    expect(body.count).toBe(0);
  });
});

// ════════════════════════════════════════
// GET /api/events/search
// ════════════════════════════════════════

describe('GET /api/events/search', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerHistoryRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('缺少 q 参数应返回 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/events/search',
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('q');
  });

  it('应返回匹配的事件列表', async () => {
    const mockEvents = [
      { id: 'evt-1', title: '央行降息', category: 'finance', importance: 0.8 },
    ];
    vi.spyOn(testCtx.store, 'searchEvents').mockReturnValue(mockEvents as any);

    const res = await app.inject({
      method: 'GET',
      url: '/api/events/search?q=央行',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.query).toBe('央行');
    expect(body.events).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it('无匹配结果应返回空数组', async () => {
    vi.spyOn(testCtx.store, 'searchEvents').mockReturnValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/events/search?q=不存在的关键词',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('应支持 limit 参数', async () => {
    vi.spyOn(testCtx.store, 'searchEvents').mockReturnValue([]);

    await app.inject({
      method: 'GET',
      url: '/api/events/search?q=test&limit=5',
    });
    expect(testCtx.store.searchEvents).toHaveBeenCalledWith('test', 5);
  });

  it('limit 超出 100 应被 clamp', async () => {
    vi.spyOn(testCtx.store, 'searchEvents').mockReturnValue([]);

    await app.inject({
      method: 'GET',
      url: '/api/events/search?q=test&limit=999',
    });
    expect(testCtx.store.searchEvents).toHaveBeenCalledWith('test', 100);
  });
});
