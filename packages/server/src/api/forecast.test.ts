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

/**
 * Helper: 提交 forecast 任务并轮询直到完成，返回最终结果
 */
async function submitAndAwaitForecast(
  app: FastifyInstance,
  payload: Record<string, unknown>,
  maxAttempts = 50,
): Promise<{ statusCode: number; body: unknown }> {
  const postRes = await app.inject({ method: 'POST', url: '/api/forecast', payload });
  if (postRes.statusCode !== 202) {
    return { statusCode: postRes.statusCode, body: postRes.json() };
  }

  const { jobId } = postRes.json<{ jobId: string }>();
  for (let i = 0; i < maxAttempts; i++) {
    const getRes = await app.inject({ method: 'GET', url: `/api/forecast/${jobId}` });
    const job = getRes.json<{ status: string; result?: unknown; error?: string }>();
    if (job.status === 'completed') {
      return { statusCode: 200, body: job.result };
    }
    if (job.status === 'failed') {
      return { statusCode: 500, body: { error: job.error } };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { statusCode: 408, body: { error: 'timeout waiting for job' } };
}

describe('POST /api/forecast', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerForecastRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 202 和 jobId 并开始异步推演', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: '央行宣布降息 25 个基点' },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.jobId).toBeDefined();
    expect(['queued', 'running']).toContain(body.status);
    expect(body.progress).toBeDefined();
  });

  it('应成功执行推演并返回完整结果', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '央行宣布降息 25 个基点',
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.scenario).toBe('hot-event');
    expect(b.scenarioLabel).toBe('热点事件预测');
    expect(b.event).toBe('央行宣布降息 25 个基点');
    const da = b.directAnswer as Record<string, unknown>;
    expect(da.questionType).toBe('event-propagation');
    expect(da.confidence).toBe('medium');
    expect(Array.isArray(da.assumptions)).toBe(true);
    expect(Array.isArray(da.drivers)).toBe(true);
    expect(b.summary).toBeDefined();
    expect(Array.isArray(b.factions)).toBe(true);
    expect(Array.isArray(b.keyReactions)).toBe(true);
    expect(Array.isArray(b.risks)).toBe(true);
    expect(Array.isArray(b.recommendations)).toBe(true);
    expect(b.metrics).toBeDefined();
    expect(b.raw).toBeDefined();
  });

  it('应支持 product-launch 场景', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '苹果发布 Vision Pro 2',
      scenario: 'product-launch',
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.scenario).toBe('product-launch');
    expect(b.scenarioLabel).toBe('产品发布预演');
  });

  it('应支持 policy-impact 场景', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '全面取消限购政策',
      scenario: 'policy-impact',
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.scenario).toBe('policy-impact');
    expect(b.scenarioLabel).toBe('政策影响评估');
  });

  it('应支持 roundtable 场景', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: 'AI 是否会取代程序员',
      scenario: 'roundtable',
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.scenario).toBe('roundtable');
    expect(b.scenarioLabel).toBe('AI 圆桌讨论');
  });

  it('应使用默认 ticks=4', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '默认参数测试',
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    const metrics = b.metrics as Record<string, unknown>;
    expect(metrics.ticks).toBe(4);
  });

  it('应支持自定义 ticks 和 importance', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '自定义参数',
      ticks: 2,
      importance: 0.5,
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    const metrics = b.metrics as Record<string, unknown>;
    expect(metrics.ticks).toBe(2);
  });

  it('应根据问题类型返回 numeric directAnswer', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '黄金 2027 年每克多少钱？',
      scenario: 'hot-event',
      ticks: 1,
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    const da = b.directAnswer as Record<string, unknown>;
    expect(da.questionType).toBe('numeric-forecast');
    expect(da.confidence).toBe('medium');
    expect(da.range).toBe('¥620 ~ ¥780 / 克');
    expect((da.answer as string)).toContain('2027 年');
    expect((da.assumptions as unknown[]).length).toBeGreaterThan(0);
    expect((da.drivers as unknown[]).length).toBeGreaterThan(0);
  });

  it('应根据判断类问题返回 judgement directAnswer', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '这项政策会不会导致房价明显下跌？',
      scenario: 'policy-impact',
      ticks: 1,
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    const da = b.directAnswer as Record<string, unknown>;
    expect(da.questionType).toBe('judgement');
    expect(da.confidence).toBe('medium');
    expect(da.range).toBeUndefined();
  });

  it('应为产品发布场景返回 decision-simulation directAnswer', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '如果 BeeClaw 对普通用户开放，市场会怎么反应？',
      scenario: 'product-launch',
      ticks: 1,
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    const da = b.directAnswer as Record<string, unknown>;
    expect(da.questionType).toBe('decision-simulation');
    expect((da.answer as string)).toContain('决策预演');
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

  it('ticks 超过 20 应返回 400（schema maximum=20）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: {
        event: '超限测试',
        ticks: 25,
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

  it('仅含空白字符的 event 应返回 202 但 job 会失败', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forecast',
      payload: { event: '   \n\t  ' },
    });
    // schema 会先校验 minLength=1 然后返回 400，
    // 但如果空白被 trim 后变成空字符串，会返回 202 后 job 失败
    // 当前 schema minLength: 1 不会因为空白通过，故确保返回 400 或 job 失败
    if (res.statusCode === 202) {
      const { jobId } = res.json();
      // 等待 job 失败
      let job = { status: 'queued' as string, error: '' };
      for (let i = 0; i < 50 && job.status !== 'failed' && job.status !== 'completed'; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const getRes = await app.inject({ method: 'GET', url: `/api/forecast/${jobId}` });
        job = getRes.json();
      }
      expect(job.status).toBe('failed');
      expect(job.error).toContain('event required');
    } else {
      expect(res.statusCode).toBe(400);
    }
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

  it('引擎 step 抛出异常时 job 状态应为 failed', async () => {
    // 在路由注册之后 mock WorldEngine.prototype.step
    const { WorldEngine } = await import('@beeclaw/world-engine');
    vi.spyOn(WorldEngine.prototype, 'step').mockRejectedValueOnce(new Error('LLM 服务不可用'));

    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: '引擎异常测试',
      ticks: 1,
    });
    expect(statusCode).toBe(500);
    const b = body as Record<string, unknown>;
    expect(b.error).toContain('LLM 服务不可用');

    vi.restoreAllMocks();
  });

  it('raw 字段应包含 ticks 和 consensus 数组', async () => {
    const { statusCode, body } = await submitAndAwaitForecast(app, {
      event: 'raw 字段测试',
      ticks: 1,
    });
    expect(statusCode).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.raw).toBeDefined();
    const raw = b.raw as Record<string, unknown>;
    expect(Array.isArray(raw.ticks)).toBe(true);
    expect(Array.isArray(raw.consensus)).toBe(true);
  });
});
