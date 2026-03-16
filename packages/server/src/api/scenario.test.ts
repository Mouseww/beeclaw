// ============================================================================
// @beeclaw/server — /api/scenario 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerScenarioRoute } from './scenario.js';

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
// POST /api/scenario — 正常路径
// ════════════════════════════════════════

describe('POST /api/scenario', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerScenarioRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功执行推演并返回完整结果', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: {
          title: '央行降息',
          content: '央行宣布降息 25 个基点',
        },
        agentCount: 3,
        ticks: 2,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scenario).toBe('央行降息');
    expect(body.agentCount).toBe(3);
    expect(body.ticks).toHaveLength(2);
    expect(body).toHaveProperty('consensus');
    expect(body).toHaveProperty('agents');
  });

  it('应使用默认 agentCount=10 和 ticks=5', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: {
          title: '默认参数测试',
          content: '测试内容',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agentCount).toBe(10);
    expect(body.ticks).toHaveLength(5);
  });

  it('agents 列表应包含 name、profession、status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: { title: '测试', content: '测试' },
        agentCount: 2,
        ticks: 1,
      },
    });
    const body = res.json();
    expect(body.agents.length).toBeGreaterThan(0);
    const agent = body.agents[0];
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('profession');
    expect(agent).toHaveProperty('status');
  });

  it('应支持自定义 category 和 tags', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: {
          title: '金融事件',
          content: '利率变化',
          category: 'finance',
          tags: ['利率', '央行'],
        },
        agentCount: 2,
        ticks: 1,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('agentCount 超过 50 应被 clamp 到 50', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: { title: '大规模测试', content: '测试内容' },
        agentCount: 100,
        ticks: 1,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agentCount).toBeLessThanOrEqual(50);
  });

  // ── 错误处理 ──

  it('缺少 seedEvent 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('缺少 seedEvent.title 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: { content: '内容' },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('缺少 seedEvent.content 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: { title: '标题' },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('ticks 超过 20 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: { title: '测试', content: '测试' },
        ticks: 25,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('20');
  });

  it('ticks 为 0 应返回 400（schema minimum=1）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: { title: '测试', content: '测试' },
        ticks: 0,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('seedEvent.title 和 content 都为空字符串应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scenario',
      payload: {
        seedEvent: { title: '', content: '' },
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
