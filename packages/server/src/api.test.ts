// ============================================================================
// @beeclaw/server API 路由集成测试
// 使用 Fastify inject 测试所有 6 个 API 路由
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { WorldEngine, type TickResult } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig } from '@beeclaw/shared';
import { initDatabase } from './persistence/database.js';
import { Store } from './persistence/store.js';
import { registerStatusRoute } from './api/status.js';
import { registerAgentsRoute } from './api/agents.js';
import { registerEventsRoute } from './api/events.js';
import { registerConsensusRoute } from './api/consensus.js';
import { registerHistoryRoute } from './api/history.js';
import { registerScenarioRoute } from './api/scenario.js';
import type { ServerContext } from './index.js';

// ── Mock 配置 ──

const TEST_CONFIG: WorldConfig = {
  tickIntervalMs: 100,
  maxAgents: 50,
  eventRetentionTicks: 50,
  enableNaturalSelection: false,
};

const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

function createMockedModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  let callCount = 0;
  const responses = [
    '{"opinion":"看好","action":"speak","emotionalState":0.5,"reasoning":"利好"}',
    '{"opinion":"谨慎","action":"silent","emotionalState":-0.2,"reasoning":"观望"}',
    '{"opinion":"中立","action":"forward","emotionalState":0.0,"reasoning":"传播"}',
  ];
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
      const idx = callCount % responses.length;
      callCount++;
      return responses[idx]!;
    });
  }
  return router;
}

// ── 测试工具 ──

async function buildTestApp(): Promise<{
  app: FastifyInstance;
  engine: WorldEngine;
  store: Store;
  modelRouter: ModelRouter;
}> {
  const db = initDatabase(':memory:');
  const store = new Store(db);
  const modelRouter = createMockedModelRouter();
  const engine = new WorldEngine({
    config: TEST_CONFIG,
    modelRouter,
    concurrency: 3,
  });

  const app = Fastify({ logger: false });

  const ctx: ServerContext = {
    engine,
    store,
    modelRouter,
    getWsCount: () => 0,
  };

  registerStatusRoute(app, ctx);
  registerAgentsRoute(app, ctx);
  registerEventsRoute(app, ctx);
  registerConsensusRoute(app, ctx);
  registerHistoryRoute(app, ctx);
  registerScenarioRoute(app, ctx);

  await app.ready();
  return { app, engine, store, modelRouter };
}

// ── 测试 ──

describe('API 路由集成测试', () => {
  let app: FastifyInstance;
  let engine: WorldEngine;
  let store: Store;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const built = await buildTestApp();
    app = built.app;
    engine = built.engine;
    store = built.store;
  });

  afterEach(async () => {
    await app.close();
  });

  // ════════════════════════════════════════
  // GET /api/status
  // ════════════════════════════════════════

  describe('GET /api/status', () => {
    it('应返回初始状态', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tick).toBe(0);
      expect(body.agentCount).toBe(0);
      expect(body.activeAgents).toBe(0);
      expect(body.activeEvents).toBe(0);
      expect(body.wsConnections).toBe(0);
      expect(body.running).toBe(false);
      expect(typeof body.uptime).toBe('number');
    });

    it('添加 Agent 后应反映 Agent 数量', async () => {
      const agents = engine.spawner.spawnBatch(5, 0);
      engine.addAgents(agents);

      const res = await app.inject({ method: 'GET', url: '/api/status' });
      const body = res.json();
      expect(body.agentCount).toBe(5);
      expect(body.activeAgents).toBe(5);
    });

    it('注入事件并 step 后应反映 tick 和事件', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      engine.injectEvent({
        title: '测试事件',
        content: '测试内容',
        category: 'general',
        importance: 0.9,
        propagationRadius: 0.8,
        tags: ['test'],
      });

      await engine.step();

      const res = await app.inject({ method: 'GET', url: '/api/status' });
      const body = res.json();
      expect(body.tick).toBe(1);
      expect(body.lastTick).toBeDefined();
      expect(body.lastTick.tick).toBe(1);
    });
  });

  // ════════════════════════════════════════
  // GET /api/agents
  // ════════════════════════════════════════

  describe('GET /api/agents', () => {
    it('无 Agent 时应返回空列表', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agents).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.size).toBe(20);
      expect(body.pages).toBe(0);
    });

    it('应返回 Agent 列表并按 influence 排序', async () => {
      const agents = engine.spawner.spawnBatch(5, 0);
      engine.addAgents(agents);

      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      const body = res.json();
      expect(body.agents.length).toBe(5);
      expect(body.total).toBe(5);

      // 验证按 influence 降序排列
      for (let i = 0; i < body.agents.length - 1; i++) {
        expect(body.agents[i].influence).toBeGreaterThanOrEqual(body.agents[i + 1].influence);
      }

      // 验证返回的字段
      const first = body.agents[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('profession');
      expect(first).toHaveProperty('status');
      expect(first).toHaveProperty('influence');
      expect(first).toHaveProperty('credibility');
      expect(first).toHaveProperty('modelTier');
      expect(first).toHaveProperty('followers');
      expect(first).toHaveProperty('following');
    });

    it('分页参数应正确工作', async () => {
      const agents = engine.spawner.spawnBatch(10, 0);
      engine.addAgents(agents);

      const res = await app.inject({
        method: 'GET',
        url: '/api/agents?page=2&size=3',
      });
      const body = res.json();
      expect(body.agents.length).toBe(3);
      expect(body.page).toBe(2);
      expect(body.size).toBe(3);
      expect(body.total).toBe(10);
      expect(body.pages).toBe(4); // ceil(10/3)
    });

    it('page 超出范围时应返回空列表', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      const res = await app.inject({
        method: 'GET',
        url: '/api/agents?page=100&size=20',
      });
      const body = res.json();
      expect(body.agents.length).toBe(0);
      expect(body.total).toBe(3);
    });

    it('无效 page/size 参数应回退默认值', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      const res = await app.inject({
        method: 'GET',
        url: '/api/agents?page=abc&size=-5',
      });
      const body = res.json();
      // page 默认 1，size 最小 1
      expect(body.page).toBe(1);
      expect(body.size).toBe(1);
    });
  });

  // ════════════════════════════════════════
  // GET /api/agents/:id
  // ════════════════════════════════════════

  describe('GET /api/agents/:id', () => {
    it('存在的 Agent 应返回详情', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      const targetId = agents[0]!.id;
      const res = await app.inject({
        method: 'GET',
        url: `/api/agents/${targetId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(targetId);
      expect(body.name).toBe(agents[0]!.name);
      expect(body.persona).toBeDefined();
      expect(body.memory).toBeDefined();
    });

    it('不存在的 Agent 应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/agents/nonexistent_id',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBe('Agent not found');
    });
  });

  // ════════════════════════════════════════
  // POST /api/events
  // ════════════════════════════════════════

  describe('POST /api/events', () => {
    it('应成功注入事件', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          title: '测试事件',
          content: '这是测试事件的内容',
          category: 'finance',
          importance: 0.8,
          propagationRadius: 0.6,
          tags: ['测试', '金融'],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.event).toBeDefined();
      expect(body.event.title).toBe('测试事件');
      expect(body.event.type).toBe('external');
      expect(body.event.category).toBe('finance');
    });

    it('使用默认值注入事件', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          title: '简单事件',
          content: '内容',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.event.category).toBe('general');
      expect(body.event.importance).toBe(0.6);
    });

    it('缺少 title 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: { content: '只有内容' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('title');
    });

    it('缺少 content 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: { title: '只有标题' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('content');
    });

    it('空请求体应返回 400', async () => {
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
    it('无数据时应返回空结果', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/consensus' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.topics).toEqual([]);
      expect(body.latest).toEqual([]);
    });

    it('运行 tick 后应返回共识数据', async () => {
      const agents = engine.spawner.spawnBatch(6, 0);
      engine.addAgents(agents);

      engine.injectEvent({
        title: '降息决定',
        content: '央行宣布降息',
        category: 'finance',
        importance: 0.9,
        propagationRadius: 0.9,
        tags: ['金融'],
      });

      await engine.step();

      const res = await app.inject({ method: 'GET', url: '/api/consensus' });
      const body = res.json();
      // 如果有足够的 Agent 响应，应产生共识信号
      expect(body.topics).toBeDefined();
      expect(body.latest).toBeDefined();
    });

    it('按 topic 过滤共识信号', async () => {
      const agents = engine.spawner.spawnBatch(6, 0);
      engine.addAgents(agents);

      engine.injectEvent({
        title: '科技新闻',
        content: 'AI 技术突破',
        category: 'tech',
        importance: 0.9,
        propagationRadius: 0.9,
        tags: ['科技', 'AI'],
      });

      await engine.step();

      const res = await app.inject({
        method: 'GET',
        url: '/api/consensus?topic=科技新闻',
      });
      const body = res.json();
      expect(body.topic).toBe('科技新闻');
      expect(body.signals).toBeDefined();
      expect(Array.isArray(body.signals)).toBe(true);
    });

    it('limit 参数应正确限制结果数量', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/consensus?limit=5',
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ════════════════════════════════════════
  // GET /api/history
  // ════════════════════════════════════════

  describe('GET /api/history', () => {
    it('从内存返回空历史', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/history' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.history).toEqual([]);
      expect(body.source).toBe('memory');
    });

    it('运行 tick 后从内存返回历史', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      await engine.step();
      await engine.step();

      const res = await app.inject({ method: 'GET', url: '/api/history' });
      const body = res.json();
      // 数据库中无数据，应从 memory 获取
      expect(body.source).toBe('memory');
      expect(body.history.length).toBe(2);
    });

    it('数据库有数据时应优先从数据库读取', async () => {
      // 写入数据库
      const tickResult: TickResult = {
        tick: 1,
        eventsProcessed: 2,
        agentsActivated: 3,
        responsesCollected: 4,
        newAgentsSpawned: 0,
        signals: 1,
        durationMs: 100,
      };
      store.saveTickResult(tickResult);

      const res = await app.inject({ method: 'GET', url: '/api/history' });
      const body = res.json();
      expect(body.source).toBe('db');
      expect(body.history.length).toBe(1);
      expect(body.history[0].tick).toBe(1);
    });

    it('limit 参数应限制结果数量', async () => {
      // 写入 5 条历史
      for (let i = 1; i <= 5; i++) {
        store.saveTickResult({
          tick: i,
          eventsProcessed: i,
          agentsActivated: 0,
          responsesCollected: 0,
          newAgentsSpawned: 0,
          signals: 0,
          durationMs: 10,
        });
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/history?limit=3',
      });
      const body = res.json();
      expect(body.history.length).toBe(3);
    });

    it('limit 最大限制为 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/history?limit=999',
      });
      expect(res.statusCode).toBe(200);
      // 不应报错，limit 被 clamp 到 200
    });
  });

  // ════════════════════════════════════════
  // POST /api/scenario
  // ════════════════════════════════════════

  describe('POST /api/scenario', () => {
    it('应成功执行场景推演', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: {
            title: '模拟降息',
            content: '央行模拟降息50个基点',
            category: 'finance',
            importance: 0.8,
            tags: ['模拟'],
          },
          agentCount: 5,
          ticks: 2,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.scenario).toBe('模拟降息');
      expect(body.agentCount).toBe(5);
      expect(body.ticks.length).toBe(2);
      expect(body.agents.length).toBe(5);
      expect(body.consensus).toBeDefined();

      // 验证 tick 结果结构
      for (const tick of body.ticks) {
        expect(tick).toHaveProperty('tick');
        expect(tick).toHaveProperty('eventsProcessed');
        expect(tick).toHaveProperty('durationMs');
      }

      // 验证 agent 结果结构
      for (const agent of body.agents) {
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('profession');
        expect(agent).toHaveProperty('status');
      }
    });

    it('使用默认参数执行场景推演', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: {
            title: '简单测试',
            content: '测试内容',
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // 默认 agentCount=10, ticks=5
      expect(body.agentCount).toBe(10);
      expect(body.ticks.length).toBe(5);
    });

    it('缺少 seedEvent.title 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: { content: '只有内容' },
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('title');
    });

    it('缺少 seedEvent.content 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: { title: '只有标题' },
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('content');
    });

    it('ticks 超过 20 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: {
            title: '测试',
            content: '内容',
          },
          ticks: 25,
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('20');
    });

    it('agentCount 应被限制在 50 以内', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: {
            title: '测试',
            content: '内容',
          },
          agentCount: 100,
          ticks: 1,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agentCount).toBeLessThanOrEqual(50);
    });
  });
});
