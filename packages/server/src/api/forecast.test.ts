// ============================================================================
// @beeclaw/server — /api/forecast 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerForecastRoute, inferQuestionType } from './forecast.js';

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

describe('inferQuestionType', () => {
  it('应为热点事件中的价格问题返回 numeric-forecast', () => {
    expect(inferQuestionType('黄金 2027 年每克多少钱？', 'hot-event')).toBe('numeric-forecast');
  });

  it('应为判断类问题返回 judgement', () => {
    expect(inferQuestionType('这项政策会不会导致失业上升？', 'policy-impact')).toBe('judgement');
  });

  it('应为热点事件中的普通事件返回 event-propagation', () => {
    expect(inferQuestionType('某平台突然大规模裁员，会如何发酵？', 'hot-event')).toBe('event-propagation');
  });

  it('应为 product-launch 与 roundtable 默认返回 decision-simulation', () => {
    expect(inferQuestionType('新品上线后用户会怎么反应？', 'product-launch')).toBe('decision-simulation');
    expect(inferQuestionType('AI 是否值得进入教育行业？', 'roundtable')).toBe('decision-simulation');
  });
});

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
    expect(body.directAnswer).toMatchObject({
      questionType: 'event-propagation',
      confidence: 'medium',
    });
    expect(body.directAnswer.assumptions).toBeInstanceOf(Array);
    expect(body.directAnswer.drivers).toBeInstanceOf(Array);
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

  it('应根据问题类型返回 numeric directAnswer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '黄金 2027 年每克多少钱？',
        scenario: 'hot-event',
        ticks: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.directAnswer).toMatchObject({
      questionType: 'numeric-forecast',
      confidence: 'medium',
      range: '¥620 ~ ¥780 / 克',
    });
    expect(body.directAnswer.answer).toContain('2027 年');
    expect(body.directAnswer.assumptions.length).toBeGreaterThan(0);
    expect(body.directAnswer.drivers.length).toBeGreaterThan(0);
  });

  it('应根据判断类问题返回 judgement directAnswer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '这项政策会不会导致房价明显下跌？',
        scenario: 'policy-impact',
        ticks: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.directAnswer.questionType).toBe('judgement');
    expect(body.directAnswer.confidence).toBe('medium');
    expect(body.directAnswer.range).toBeUndefined();
  });

  it('应为产品发布场景返回 decision-simulation directAnswer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '如果 BeeClaw 对普通用户开放，市场会怎么反应？',
        scenario: 'product-launch',
        ticks: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.directAnswer.questionType).toBe('decision-simulation');
    expect(body.directAnswer.answer).toContain('决策预演');
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

  it('仅含空白字符的 event 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: '   \n\t  ' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('event required');
  });

  it('importance 低于 0.1 应返回 400（schema minimum=0.1）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: 'importance 下界', importance: 0.01 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('importance 超过 1 应返回 400（schema maximum=1）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: 'importance 上界', importance: 1.5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('引擎 step 抛出异常时应返回 500 并携带详细消息', async () => {
    // 在路由注册之后 mock WorldEngine.prototype.step
    const { WorldEngine } = await import('@beeclaw/world-engine');
    vi.spyOn(WorldEngine.prototype, 'step').mockRejectedValueOnce(new Error('LLM 服务不可用'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: '引擎异常测试', ticks: 1 },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toContain('forecast engine failed');
    expect(body.error).toContain('LLM 服务不可用');

    vi.restoreAllMocks();
  });

  it('raw 字段应包含 ticks 和 consensus 数组', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: 'raw 字段测试', ticks: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.raw).toBeDefined();
    expect(body.raw.ticks).toBeInstanceOf(Array);
    expect(body.raw.consensus).toBeInstanceOf(Array);
  });
});
