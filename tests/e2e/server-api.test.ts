// ============================================================================
// BeeClaw E2E — Server API 集成测试
// 验证：启动 server → HTTP API 调用 → WebSocket 事件推送
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import { initDatabase } from '@beeclaw/server/src/persistence/database.js';
import { Store } from '@beeclaw/server/src/persistence/store.js';
import { registerWs } from '@beeclaw/server/src/ws/handler.js';
import { registerStatusRoute } from '@beeclaw/server/src/api/status.js';
import { registerAgentsRoute } from '@beeclaw/server/src/api/agents.js';
import { registerEventsRoute } from '@beeclaw/server/src/api/events.js';
import { registerConsensusRoute } from '@beeclaw/server/src/api/consensus.js';
import { registerHistoryRoute } from '@beeclaw/server/src/api/history.js';
import { registerHealthRoute } from '@beeclaw/server/src/api/health.js';
import { registerScenarioRoute } from '@beeclaw/server/src/api/scenario.js';
import type { ServerContext } from '@beeclaw/server/src/index.js';
import type { WorldConfig } from '@beeclaw/shared';
import { silenceConsole, createMockModelRouter } from './helpers.js';

// ── 辅助函数 ──

interface ServerTestContext {
  app: FastifyInstance;
  engine: WorldEngine;
  store: Store;
  modelRouter: ModelRouter;
  ctx: ServerContext;
}

async function buildServerTestContext(): Promise<ServerTestContext> {
  const db = initDatabase(':memory:');
  const store = new Store(db);
  const modelRouter = createMockModelRouter();

  const config: WorldConfig = {
    tickIntervalMs: 50,
    maxAgents: 50,
    eventRetentionTicks: 50,
    enableNaturalSelection: false,
  };

  const engine = new WorldEngine({
    config,
    modelRouter,
    concurrency: 3,
  });

  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  const ctx: ServerContext = {
    engine,
    store,
    modelRouter,
    getWsCount: () => 0,
  };

  // 注册所有路由
  registerWs(app);
  registerStatusRoute(app, ctx);
  registerAgentsRoute(app, ctx);
  registerEventsRoute(app, ctx);
  registerConsensusRoute(app, ctx);
  registerHistoryRoute(app, ctx);
  registerHealthRoute(app, ctx);
  registerScenarioRoute(app, ctx);

  await app.ready();

  return { app, engine, store, modelRouter, ctx };
}

describe('Server API 集成测试', () => {
  let testCtx: ServerTestContext;

  beforeEach(async () => {
    silenceConsole();
    testCtx = await buildServerTestContext();
  });

  afterEach(async () => {
    testCtx.engine.stop();
    await testCtx.app.close();
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════
  // GET /health
  // ═══════════════════════════════════

  describe('GET /health', () => {
    it('应返回健康状态', async () => {
      const res = await testCtx.app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('tick');
      expect(body.tick).toBe(0);
    });
  });

  // ═══════════════════════════════════
  // GET /api/status
  // ═══════════════════════════════════

  describe('GET /api/status', () => {
    it('初始状态应正确', async () => {
      const res = await testCtx.app.inject({ method: 'GET', url: '/api/status' });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.tick).toBe(0);
      expect(body.agentCount).toBe(0);
      expect(body.running).toBe(false);
    });

    it('添加 Agent 并执行 step 后状态应更新', async () => {
      const agents = testCtx.engine.spawner.spawnBatch(5, 0);
      testCtx.engine.addAgents(agents);

      testCtx.engine.injectEvent({
        title: '测试',
        content: '测试内容',
        importance: 0.5,
        propagationRadius: 0.5,
      });

      await testCtx.engine.step();

      const res = await testCtx.app.inject({ method: 'GET', url: '/api/status' });
      const body = res.json();

      expect(body.tick).toBe(1);
      expect(body.agentCount).toBe(5);
      expect(body.lastTick).not.toBeNull();
    });
  });

  // ═══════════════════════════════════
  // Agent CRUD API
  // ═══════════════════════════════════

  describe('Agent API', () => {
    it('GET /api/agents 应返回分页列表', async () => {
      const agents = testCtx.engine.spawner.spawnBatch(8, 0);
      testCtx.engine.addAgents(agents);

      const res = await testCtx.app.inject({ method: 'GET', url: '/api/agents?size=3&page=2' });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.agents).toHaveLength(3);
      expect(body.total).toBe(8);
      expect(body.page).toBe(2);
      expect(body.pages).toBe(3); // ceil(8/3)
    });

    it('GET /api/agents/:id 应返回 Agent 详情', async () => {
      const agents = testCtx.engine.spawner.spawnBatch(1, 0);
      testCtx.engine.addAgents(agents);

      const res = await testCtx.app.inject({
        method: 'GET',
        url: `/api/agents/${agents[0]!.id}`,
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.id).toBe(agents[0]!.id);
      expect(body).toHaveProperty('persona');
      expect(body).toHaveProperty('memory');
    });

    it('GET /api/agents/:id 不存在应返回 404', async () => {
      const res = await testCtx.app.inject({
        method: 'GET',
        url: '/api/agents/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ═══════════════════════════════════
  // POST /api/events — 事件注入
  // ═══════════════════════════════════

  describe('POST /api/events', () => {
    it('应成功注入事件并返回事件对象', async () => {
      const res = await testCtx.app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          title: '央行降息',
          content: '央行宣布降息 25 个基点',
          category: 'finance',
          importance: 0.9,
          tags: ['央行', '利率'],
        },
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.event.title).toBe('央行降息');
      expect(body.event.category).toBe('finance');
      expect(body.event).toHaveProperty('id');
    });

    it('缺少必填字段应返回 400', async () => {
      const res = await testCtx.app.inject({
        method: 'POST',
        url: '/api/events',
        payload: { title: '只有标题' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('注入事件后执行 step 应处理该事件', async () => {
      const agents = testCtx.engine.spawner.spawnBatch(5, 0);
      testCtx.engine.addAgents(agents);

      // 通过 API 注入事件
      await testCtx.app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          title: '市场波动',
          content: '股市大幅震荡',
          importance: 0.8,
          propagationRadius: 0.7,
        },
      });

      // 执行 step
      const result = await testCtx.engine.step();
      expect(result.eventsProcessed).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════
  // GET /api/consensus
  // ═══════════════════════════════════

  describe('GET /api/consensus', () => {
    it('初始状态应返回空的 topics 和 latest', async () => {
      const res = await testCtx.app.inject({ method: 'GET', url: '/api/consensus' });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body).toHaveProperty('topics');
      expect(body).toHaveProperty('latest');
      expect(Array.isArray(body.topics)).toBe(true);
    });

    it('按 topic 查询应返回信号历史', async () => {
      const res = await testCtx.app.inject({
        method: 'GET',
        url: '/api/consensus?topic=金融市场',
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.topic).toBe('金融市场');
      expect(Array.isArray(body.signals)).toBe(true);
    });
  });

  // ═══════════════════════════════════
  // GET /api/history
  // ═══════════════════════════════════

  describe('GET /api/history', () => {
    it('执行 step 后应有历史记录', async () => {
      const agents = testCtx.engine.spawner.spawnBatch(3, 0);
      testCtx.engine.addAgents(agents);

      await testCtx.engine.step();
      await testCtx.engine.step();

      const res = await testCtx.app.inject({ method: 'GET', url: '/api/history?limit=10' });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.history.length).toBeGreaterThanOrEqual(1);
      expect(body).toHaveProperty('source');
    });
  });

  // ═══════════════════════════════════
  // POST /api/scenario — 推演场景
  // ═══════════════════════════════════

  describe('POST /api/scenario', () => {
    it('应完整执行推演并返回结果', async () => {
      const res = await testCtx.app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: {
            title: '央行加息',
            content: '央行宣布加息 50 个基点',
          },
          agentCount: 3,
          ticks: 2,
        },
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.scenario).toBe('央行加息');
      expect(body.agentCount).toBe(3);
      expect(body.ticks).toHaveLength(2);
      expect(body).toHaveProperty('consensus');
      expect(body).toHaveProperty('agents');
      expect(body.agents).toHaveLength(3);
    });

    it('超过 20 ticks 应返回 400', async () => {
      const res = await testCtx.app.inject({
        method: 'POST',
        url: '/api/scenario',
        payload: {
          seedEvent: { title: '测试', content: '测试' },
          ticks: 25,
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ═══════════════════════════════════
  // 端到端链路：注入事件 → step → 查询共识
  // ═══════════════════════════════════

  describe('端到端链路', () => {
    it('事件注入 → 多轮 step → 查询状态 应保持一致', async () => {
      // 准备 Agent
      const agents = testCtx.engine.spawner.spawnBatch(5, 0);
      testCtx.engine.addAgents(agents);
      const agentIds = agents.map(a => a.id);
      testCtx.engine.getSocialGraph().initializeRandomRelations(agentIds, 2, 0);

      // 注入事件
      await testCtx.app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          title: '重大财经事件',
          content: '全球股市暴跌，避险情绪升温',
          category: 'finance',
          importance: 0.95,
          propagationRadius: 0.9,
          tags: ['股市', '暴跌'],
        },
      });

      // 执行 3 轮 tick
      for (let i = 0; i < 3; i++) {
        await testCtx.engine.step();
      }

      // 查询状态
      const statusRes = await testCtx.app.inject({ method: 'GET', url: '/api/status' });
      const status = statusRes.json();
      expect(status.tick).toBe(3);
      expect(status.agentCount).toBe(5);

      // 查询历史
      const historyRes = await testCtx.app.inject({ method: 'GET', url: '/api/history' });
      const history = historyRes.json();
      expect(history.history.length).toBeGreaterThanOrEqual(1);

      // 查询共识
      const consensusRes = await testCtx.app.inject({ method: 'GET', url: '/api/consensus' });
      expect(consensusRes.statusCode).toBe(200);
    });

    it('持久化：Store 应保存和恢复 tick 结果', async () => {
      const agents = testCtx.engine.spawner.spawnBatch(3, 0);
      testCtx.engine.addAgents(agents);

      await testCtx.engine.step();
      const result = testCtx.engine.getLastTickResult()!;

      // 保存到 Store
      testCtx.store.setTick(result.tick);
      testCtx.store.saveTickResult(result);
      testCtx.store.saveAgents(testCtx.engine.getAgents());

      // 验证持久化
      expect(testCtx.store.getTick()).toBe(result.tick);
      const savedHistory = testCtx.store.getTickHistory(5);
      expect(savedHistory.length).toBe(1);
      expect(savedHistory[0]!.tick).toBe(result.tick);

      const savedAgents = testCtx.store.loadAgentRows();
      expect(savedAgents.length).toBe(3);
    });
  });
});
