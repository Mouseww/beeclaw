// ============================================================================
// @beeclaw/server — /api/agents 路由测试
// ============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerAgentsRoute } from './agents.js';

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
// GET /api/agents
// ════════════════════════════════════════

describe('GET /api/agents', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerAgentsRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('无 agent 时应返回空列表和正确分页', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agents).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.size).toBe(20);
    expect(body.pages).toBe(0);
  });

  it('应返回 agent 列表及分页信息', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(5, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    const body = res.json();
    expect(body.agents).toHaveLength(5);
    expect(body.total).toBe(5);
    expect(body.page).toBe(1);
    expect(body.size).toBe(20);
    expect(body.pages).toBe(1);
  });

  it('每个 agent 摘要应包含所有必要字段', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(1, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    const body = res.json();
    const agent = body.agents[0];

    expect(agent).toHaveProperty('id');
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('profession');
    expect(agent).toHaveProperty('status');
    expect(agent).toHaveProperty('influence');
    expect(agent).toHaveProperty('credibility');
    expect(agent).toHaveProperty('modelTier');
    expect(agent).toHaveProperty('followers');
    expect(agent).toHaveProperty('following');
    expect(agent).toHaveProperty('lastActiveTick');
  });

  it('应按 influence 降序排列', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(5, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    const body = res.json();
    const influences = body.agents.map((a: any) => a.influence);
    for (let i = 1; i < influences.length; i++) {
      expect(influences[i - 1]).toBeGreaterThanOrEqual(influences[i]);
    }
  });

  // ── 分页参数 ──

  it('应支持 page 和 size 分页参数', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(10, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents?page=2&size=3',
    });
    const body = res.json();
    expect(body.agents).toHaveLength(3);
    expect(body.page).toBe(2);
    expect(body.size).toBe(3);
    expect(body.total).toBe(10);
    expect(body.pages).toBe(4); // ceil(10/3) = 4
  });

  it('size 超出 100 应被 clamp 到 100', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents?size=200',
    });
    const body = res.json();
    expect(body.size).toBe(100);
  });

  it('size 为 0 时 parseInt||20 fallback 到默认值 20', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agents?size=0',
    });
    const body = res.json();
    // parseInt('0',10) || 20 → 0 is falsy → 20
    expect(body.size).toBe(20);
  });

  it('size 为负数应被 clamp 到 1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agents?size=-5',
    });
    const body = res.json();
    // parseInt('-5',10) || 20 → -5 is truthy → Math.max(1, -5) = 1
    expect(body.size).toBe(1);
  });

  it('page 为无效字符串应默认为 1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agents?page=abc',
    });
    const body = res.json();
    expect(body.page).toBe(1);
  });

  it('page 超出范围应返回空 agents', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents?page=100',
    });
    const body = res.json();
    expect(body.agents).toEqual([]);
    expect(body.total).toBe(3);
    expect(body.page).toBe(100);
  });
});

// ════════════════════════════════════════
// GET /api/agents/:id
// ════════════════════════════════════════

describe('GET /api/agents/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerAgentsRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('存在的 agent 应返回 200 和完整详情', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(1, 0);
    testCtx.engine.addAgents(agents);
    const agentId = agents[0]!.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(agentId);
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('persona');
    expect(body).toHaveProperty('memory');
  });

  it('不存在的 agent 应返回 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/nonexistent-id',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('Agent not found');
  });

  it('添加多个 agent 后能正确查询每一个', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);

    for (const agent of agents) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/agents/${agent.id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(agent.id);
      expect(body.name).toBe(agent.name);
    }
  });
});
