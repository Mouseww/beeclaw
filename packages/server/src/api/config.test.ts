// ============================================================================
// @beeclaw/server — /api/config/llm 路由测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  MOCK_MODEL_CONFIG,
  type TestContext,
} from './__test_helpers__.js';
import { registerConfigRoute } from './config.js';

// ── 共享 setup ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(0);
});

afterEach(async () => {
  await testCtx.app.close();
});

const VALID_TIER_CONFIG = {
  baseURL: 'http://new-provider',
  apiKey: 'new-key',
  model: 'new-model',
};

const VALID_FULL_CONFIG = {
  local: { ...VALID_TIER_CONFIG, model: 'local-v2' },
  cheap: { ...VALID_TIER_CONFIG, model: 'cheap-v2' },
  strong: { ...VALID_TIER_CONFIG, model: 'strong-v2' },
};

// ════════════════════════════════════════
// GET /api/config/llm
// ════════════════════════════════════════

describe('GET /api/config/llm', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerConfigRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 200 和 LLM 配置对象', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config/llm' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('local');
    expect(body).toHaveProperty('cheap');
    expect(body).toHaveProperty('strong');
  });

  it('每个 tier 应包含 baseURL 和 model 字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config/llm' });
    const body = res.json();
    for (const tier of ['local', 'cheap', 'strong']) {
      expect(body[tier]).toHaveProperty('baseURL');
      expect(body[tier]).toHaveProperty('model');
    }
  });
});

// ════════════════════════════════════════
// PUT /api/config/llm — 更新全部配置
// ════════════════════════════════════════

describe('PUT /api/config/llm', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.spyOn(testCtx.store, 'saveLLMConfigs').mockImplementation(() => {});
    registerConfigRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功更新全部配置并返回 ok', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: VALID_FULL_CONFIG,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.config).toBeDefined();
  });

  it('应调用 store.saveLLMConfigs 持久化配置', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: VALID_FULL_CONFIG,
    });
    expect(testCtx.store.saveLLMConfigs).toHaveBeenCalled();
  });

  it('缺少 local tier 应返回 400', async () => {
    const { local: _, ...incomplete } = VALID_FULL_CONFIG;
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: incomplete,
    });
    expect(res.statusCode).toBe(400);
  });

  it('缺少 cheap tier 应返回 400', async () => {
    const { cheap: _, ...incomplete } = VALID_FULL_CONFIG;
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: incomplete,
    });
    expect(res.statusCode).toBe(400);
  });

  it('缺少 strong tier 应返回 400', async () => {
    const { strong: _, ...incomplete } = VALID_FULL_CONFIG;
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: incomplete,
    });
    expect(res.statusCode).toBe(400);
  });

  it('tier 配置中 baseURL 为空应返回 400', async () => {
    const config = {
      ...VALID_FULL_CONFIG,
      local: { ...VALID_TIER_CONFIG, baseURL: '' },
    };
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: config,
    });
    expect(res.statusCode).toBe(400);
  });

  it('tier 配置中缺少 model 应返回 400', async () => {
    const config = {
      ...VALID_FULL_CONFIG,
      local: { baseURL: 'http://x', apiKey: 'k' },
    };
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: config,
    });
    expect(res.statusCode).toBe(400);
  });

  it('temperature 超过 2 应返回 400', async () => {
    const config = {
      ...VALID_FULL_CONFIG,
      local: { ...VALID_TIER_CONFIG, temperature: 3 },
    };
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm',
      payload: config,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════
// PUT /api/config/llm/:tier — 更新单个 tier
// ════════════════════════════════════════

describe('PUT /api/config/llm/:tier', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.spyOn(testCtx.store, 'saveLLMConfig').mockImplementation(() => {});
    registerConfigRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功更新单个 tier 并返回 ok', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm/local',
      payload: VALID_TIER_CONFIG,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.tier).toBe('local');
  });

  it('应调用 store.saveLLMConfig 传入正确 tier 和 config', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/config/llm/cheap',
      payload: VALID_TIER_CONFIG,
    });
    expect(testCtx.store.saveLLMConfig).toHaveBeenCalledWith(
      'cheap',
      expect.objectContaining({ baseURL: 'http://new-provider' }),
    );
  });

  it('无效 tier 应返回 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm/invalid',
      payload: VALID_TIER_CONFIG,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('Invalid tier');
  });

  it('配置中缺少 apiKey 应返回 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm/local',
      payload: { baseURL: 'http://x', model: 'y' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('maxTokens 为负数应返回 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm/local',
      payload: { ...VALID_TIER_CONFIG, maxTokens: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('应支持可选的 maxTokens 和 temperature', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/llm/strong',
      payload: { ...VALID_TIER_CONFIG, maxTokens: 4096, temperature: 0.7 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
  });
});
