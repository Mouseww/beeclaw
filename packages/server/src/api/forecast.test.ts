// ============================================================================
// @beeclaw/server — /api/forecast 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerForecastRoute } from './forecast.js';

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
// POST /api/forecast — 正常路径
// ════════════════════════════════════════

describe('POST /api/forecast', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerForecastRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功执行推演并返回完整结果', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '央行宣布降息 25 个基点',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scenario).toBe('hot-event');
    expect(body.scenarioLabel).toBe('热点事件预测');
    expect(body.event).toBe('央行宣布降息 25 个基点');
    expect(body.summary).toBeDefined();
    expect(body.factions).toBeInstanceOf(Array);
    expect(body.keyReactions).toBeInstanceOf(Array);
    expect(body.risks).toBeInstanceOf(Array);
    expect(body.recommendations).toBeInstanceOf(Array);
    expect(body.metrics).toBeDefined();
    expect(body.raw).toBeDefined();
  });

  it('应支持 product-launch 场景', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '苹果发布 Vision Pro 2',
        scenario: 'product-launch',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scenario).toBe('product-launch');
    expect(body.scenarioLabel).toBe('产品发布预演');
  });

  it('应支持 policy-impact 场景', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '全面取消限购政策',
        scenario: 'policy-impact',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scenario).toBe('policy-impact');
    expect(body.scenarioLabel).toBe('政策影响评估');
  });

  it('应支持 roundtable 场景', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: 'AI 是否会取代程序员',
        scenario: 'roundtable',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scenario).toBe('roundtable');
    expect(body.scenarioLabel).toBe('AI 圆桌讨论');
  });

  it('应使用默认 ticks=4 且 clamp 在 1~8 之间', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '默认参数测试',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics.ticks).toBe(4);
  });

  it('应支持自定义 ticks 和 importance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '自定义参数',
        ticks: 2,
        importance: 0.5,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics.ticks).toBe(2);
  });

  it('metrics 应包含 agentCount、responsesCollected、finalTick 等', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '指标测试',
        ticks: 1,
      },
    });
    const body = res.json();
    expect(body.metrics).toHaveProperty('agentCount');
    expect(body.metrics).toHaveProperty('ticks');
    expect(body.metrics).toHaveProperty('responsesCollected');
    expect(body.metrics).toHaveProperty('averageActivatedAgents');
    expect(body.metrics).toHaveProperty('consensusSignals');
    expect(body.metrics).toHaveProperty('finalTick');
  });

  it('factions 应包含 name、share、summary', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '派系测试',
        ticks: 1,
      },
    });
    const body = res.json();
    expect(body.factions.length).toBeGreaterThan(0);
    const faction = body.factions[0];
    expect(faction).toHaveProperty('name');
    expect(faction).toHaveProperty('share');
    expect(faction).toHaveProperty('summary');
  });

  // ── 错误处理 ──

  it('缺少 event 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('空字符串 event 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('ticks 超过 8 应返回 400（schema maximum=8）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '超限测试',
        ticks: 10,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('ticks 为 0 应返回 400（schema minimum=1）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '零 tick 测试',
        ticks: 0,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('无效 scenario 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '场景错误测试',
        scenario: 'invalid-scenario',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
