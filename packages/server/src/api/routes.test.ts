// ============================================================================
// @beeclaw/server — API Route 端点测试
// 覆盖 status, agents, events, consensus, history, config, scenario
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { WorldEngine as _WorldEngine } from '@beeclaw/world-engine';
import type { ModelRouter as _ModelRouter } from '@beeclaw/agent-runtime';
import type { Store as _Store } from '../persistence/store.js';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerStatusRoute } from './status.js';
import { registerAgentsRoute } from './agents.js';
import { registerEventsRoute } from './events.js';
import { registerConsensusRoute } from './consensus.js';
import { registerHistoryRoute } from './history.js';
import { registerConfigRoute } from './config.js';
import { registerScenarioRoute } from './scenario.js';

// ── 共享 setup ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(3);
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

  it('应返回 200 和基础状态字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body).toHaveProperty('tick');
    expect(body).toHaveProperty('agentCount');
    expect(body).toHaveProperty('activeAgents');
    expect(body).toHaveProperty('sentiment');
    expect(body).toHaveProperty('activeEvents');
    expect(body).toHaveProperty('wsConnections');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('running');
  });

  it('初始 tick 应为 0', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.tick).toBe(0);
  });

  it('无 agent 时 agentCount 应为 0', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.agentCount).toBe(0);
    expect(body.activeAgents).toBe(0);
  });

  it('添加 agent 后 agentCount 应正确反映', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(5, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.agentCount).toBe(5);
    expect(body.activeAgents).toBe(5);
  });

  it('wsConnections 应等于 mock 值', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.wsConnections).toBe(3);
  });

  it('running 初始应为 false', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.running).toBe(false);
  });
});

// ════════════════════════════════════════
// GET /api/agents, GET /api/agents/:id
// ════════════════════════════════════════

describe('Agents API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerAgentsRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  describe('GET /api/agents', () => {
    it('无 agent 时应返回空列表', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agents).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
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

    it('应支持分页参数', async () => {
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

    it('每个 agent 应包含摘要字段', async () => {
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
    });

    it('size 超出限制应被 clamp', async () => {
      const agents = testCtx.engine.spawner.spawnBatch(3, 0);
      testCtx.engine.addAgents(agents);

      const res = await app.inject({
        method: 'GET',
        url: '/api/agents?size=200',
      });
      const body = res.json();
      expect(body.size).toBe(100); // max 100
    });

    it('page 为无效值应默认为 1', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/agents?page=abc',
      });
      const body = res.json();
      expect(body.page).toBe(1);
    });
  });

  describe('GET /api/agents/:id', () => {
    it('存在的 agent 应返回详情', async () => {
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
        url: '/api/agents/nonexistent',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBe('Agent not found');
    });
  });
});

// ════════════════════════════════════════
// POST /api/events
// ════════════════════════════════════════

describe('POST /api/events', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // mock broadcast 以避免 ws 依赖
    vi.mock('../ws/handler.js', () => ({
      broadcast: vi.fn(),
      getConnectionCount: () => 0,
      registerWs: vi.fn(),
      stopHeartbeat: vi.fn(),
      closeAllConnections: vi.fn(),
    }));

    registerEventsRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功注入事件', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '央行降息',
        content: '央行宣布降息 25 个基点',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.event).toHaveProperty('id');
    expect(body.event.title).toBe('央行降息');
  });

  it('应支持自定义 category、importance 等参数', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '测试事件',
        content: '测试内容',
        category: 'finance',
        importance: 0.9,
        propagationRadius: 0.8,
        tags: ['金融', '利率'],
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.event.category).toBe('finance');
    expect(body.event.importance).toBe(0.9);
    expect(body.event.propagationRadius).toBe(0.8);
    expect(body.event.tags).toEqual(['金融', '利率']);
  });

  it('缺少 title 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { content: '内容' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('title');
  });

  it('缺少 content 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { title: '标题' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('content');
  });

  it('title 和 content 都缺应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════
// GET /api/consensus
// ════════════════════════════════════════

describe('GET /api/consensus', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerConsensusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('无 topic 参数时应返回 topics 和 latest', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/consensus' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('topics');
    expect(body).toHaveProperty('latest');
    expect(Array.isArray(body.topics)).toBe(true);
  });

  it('指定 topic 时应返回对应信号历史', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/consensus?topic=市场走势',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.topic).toBe('市场走势');
    expect(body).toHaveProperty('signals');
    expect(Array.isArray(body.signals)).toBe(true);
  });

  it('应支持 limit 参数', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/consensus?topic=test&limit=5',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.signals.length).toBeLessThanOrEqual(5);
  });
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

  it('初始状态应返回空历史', async () => {
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

  it('执行 step 后历史应不为空（memory source）', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);
    await testCtx.engine.step();

    const res = await app.inject({ method: 'GET', url: '/api/history' });
    const body = res.json();
    expect(body.source).toBe('memory');
    expect(body.history.length).toBeGreaterThanOrEqual(1);
  });

  it('limit 超出上限应被 clamp 到 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/history?limit=999',
    });
    expect(res.statusCode).toBe(200);
    // 不会报错，内部 clamp 到 200
  });
});

// ════════════════════════════════════════
// /api/config/llm
// ════════════════════════════════════════

describe('Config API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerConfigRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  describe('GET /api/config/llm', () => {
    it('应返回当前 LLM 配置', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config/llm' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('local');
      expect(body).toHaveProperty('cheap');
      expect(body).toHaveProperty('strong');
      expect(body.local).toHaveProperty('baseURL');
      expect(body.local).toHaveProperty('model');
    });
  });

  describe('PUT /api/config/llm', () => {
    const validConfig = {
      local: { baseURL: 'http://new-local', apiKey: 'key1', model: 'new-local-model' },
      cheap: { baseURL: 'http://new-cheap', apiKey: 'key2', model: 'new-cheap-model' },
      strong: { baseURL: 'http://new-strong', apiKey: 'key3', model: 'new-strong-model' },
    };

    it('应成功更新全部配置', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm',
        payload: validConfig,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body).toHaveProperty('config');
    });

    it('缺少 tier 应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm',
        payload: {
          local: validConfig.local,
          cheap: validConfig.cheap,
          // 缺少 strong
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('strong');
    });

    it('空 body 应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm',
        headers: { 'content-type': 'application/json' },
        payload: 'null',
      });
      expect(res.statusCode).toBe(400);
    });

    it('tier 配置缺少必填字段应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm',
        payload: {
          local: { baseURL: '', apiKey: 'key', model: 'model' },
          cheap: validConfig.cheap,
          strong: validConfig.strong,
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('local');
    });
  });

  describe('PUT /api/config/llm/:tier', () => {
    const validTierConfig = {
      baseURL: 'http://updated',
      apiKey: 'new-key',
      model: 'updated-model',
    };

    it('应成功更新单个 tier', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm/local',
        payload: validTierConfig,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.tier).toBe('local');
    });

    it('无效 tier 应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm/invalid',
        payload: validTierConfig,
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('Invalid tier');
    });

    it('缺少 apiKey 应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm/cheap',
        payload: { baseURL: 'http://url', model: 'model' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('apiKey');
    });

    it('temperature 超出范围应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm/strong',
        payload: { ...validTierConfig, temperature: 3 },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('temperature');
    });

    it('maxTokens 为负数应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm/strong',
        payload: { ...validTierConfig, maxTokens: -1 },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('maxTokens');
    });

    it('应支持可选的 temperature 和 maxTokens', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/llm/local',
        payload: { ...validTierConfig, temperature: 0.7, maxTokens: 2048 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
    });
  });
});

// ════════════════════════════════════════
// POST /api/scenario
// ════════════════════════════════════════

describe('POST /api/scenario', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerScenarioRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功执行推演', async () => {
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
    expect(body.error).toContain('seedEvent');
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

  it('应使用默认的 agentCount 和 ticks', async () => {
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
    expect(body.agentCount).toBe(10); // 默认 10
    expect(body.ticks).toHaveLength(5); // 默认 5
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
    const agent = body.agents[0];
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('profession');
    expect(agent).toHaveProperty('status');
  });
});
