// ============================================================================
// @beeclaw/server 端到端集成测试
// 测试完整链路：启动 server → 注入事件 → 触发 tick → 验证 API 返回 + WebSocket 广播
// 使用 mock LLM 响应，确保离线可运行
// ============================================================================

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig } from '@beeclaw/shared';
import { WebSocket } from 'ws';
import { initDatabase } from './persistence/database.js';
import { Store } from './persistence/store.js';
import { registerWs, broadcast, getConnectionCount, stopHeartbeat, closeAllConnections } from './ws/handler.js';
import { registerStatusRoute } from './api/status.js';
import { registerAgentsRoute } from './api/agents.js';
import { registerEventsRoute } from './api/events.js';
import { registerConsensusRoute } from './api/consensus.js';
import { registerHistoryRoute } from './api/history.js';
import { registerHealthRoute } from './api/health.js';
import { registerMetricsRoute } from './api/metrics.js';
import { registerPrometheusRoute } from './api/prometheus.js';
import { registerConfigRoute } from './api/config.js';
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

/** 创建 mock LLM 路由器，所有 tier 的 chatCompletion 返回预设 JSON */
function createMockedModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  let callCount = 0;
  const responses = [
    '{"opinion":"看好","action":"speak","emotionalState":0.5,"reasoning":"利好消息"}',
    '{"opinion":"谨慎","action":"silent","emotionalState":-0.2,"reasoning":"观望为主"}',
    '{"opinion":"中立","action":"forward","emotionalState":0.0,"reasoning":"传播信息"}',
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

// ── 测试基础设施 ──

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 等待 WebSocket 接收指定类型的消息 */
function waitForWsMessage(
  ws: WebSocket,
  type: string,
  timeoutMs = 10_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: 未在 ${timeoutMs}ms 内收到 type="${type}" 的 WS 消息`));
    }, timeoutMs);

    const handler = (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg['type'] === type) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(msg);
        }
      } catch {
        // 忽略非 JSON 消息
      }
    };

    ws.on('message', handler);
  });
}

/** 等待 WebSocket 连接 open */
function waitForWsOpen(ws: WebSocket, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: WebSocket 未在 ${timeoutMs}ms 内连接`));
    }, timeoutMs);

    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── 构建完整测试服务器 ──

interface TestServer {
  app: FastifyInstance;
  engine: WorldEngine;
  store: Store;
  modelRouter: ModelRouter;
  address: string;
  port: number;
}

async function buildE2EServer(): Promise<TestServer> {
  const db = initDatabase(':memory:');
  const store = new Store(db);
  const modelRouter = createMockedModelRouter();
  const engine = new WorldEngine({
    config: TEST_CONFIG,
    modelRouter,
    concurrency: 3,
  });

  const app = Fastify({
    logger: false,
    schemaErrorFormatter(errors, dataVar) {
      const first = errors[0];
      if (first) {
        const field = first.instancePath
          ? first.instancePath.replace(/^\//, '').replace(/\//g, '.')
          : (first.params as Record<string, unknown>)?.['missingProperty'] as string | undefined;
        const msg = field
          ? `${field}: ${first.message ?? 'validation failed'}`
          : `${dataVar} ${first.message ?? 'validation failed'}`;
        return new Error(msg);
      }
      return new Error('Validation failed');
    },
  });

  await app.register(fastifyWebsocket);

  const ctx: ServerContext = {
    engine,
    store,
    modelRouter,
    getWsCount: getConnectionCount,
  };

  // 注册所有路由（含 WebSocket）
  registerWs(app);
  registerHealthRoute(app, ctx);
  registerStatusRoute(app, ctx);
  registerAgentsRoute(app, ctx);
  registerEventsRoute(app, ctx);
  registerConsensusRoute(app, ctx);
  registerHistoryRoute(app, ctx);
  registerMetricsRoute(app, ctx);
  registerPrometheusRoute(app, ctx);
  registerConfigRoute(app, ctx);

  app.setErrorHandler((error, _req, reply) => {
    if (error.validation) {
      return reply.status(400).send({ error: error.message });
    }
    reply.status(error.statusCode ?? 500).send({ error: error.message });
  });

  // 监听随机端口
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    app,
    engine,
    store,
    modelRouter,
    address: `http://127.0.0.1:${port}`,
    port,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 测试套件
// ════════════════════════════════════════════════════════════════════════════

describe('E2E 集成测试 — 完整链路', () => {
  let server: TestServer;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    server = await buildE2EServer();
  });

  afterAll(async () => {
    stopHeartbeat();
    closeAllConnections();
    await server.app.close();
  });

  // ════════════════════════════════════════
  // 1. 健康检查
  // ════════════════════════════════════════

  describe('GET /health', () => {
    it('应返回 status=ok 和版本信息', async () => {
      const res = await fetch(`${server.address}/health`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(typeof body.uptime).toBe('number');
      expect(typeof body.version).toBe('string');
      expect(typeof body.tick).toBe('number');
    });
  });

  // ════════════════════════════════════════
  // 2. 事件注入
  // ════════════════════════════════════════

  describe('POST /api/events', () => {
    it('应成功注入事件并返回事件对象', async () => {
      // 先添加 Agent，确保引擎可以工作
      const agents = server.engine.spawner.spawnBatch(6, 0);
      server.engine.addAgents(agents);

      const res = await fetch(`${server.address}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '央行宣布加息25个基点',
          content: '中国人民银行今日宣布上调基准利率 25 个基点，市场反应剧烈',
          category: 'finance',
          importance: 0.9,
          propagationRadius: 0.8,
          tags: ['金融', '加息', '利率'],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.event).toBeDefined();
      expect(body.event.title).toBe('央行宣布加息25个基点');
      expect(body.event.type).toBe('external');
      expect(body.event.category).toBe('finance');
      expect(body.event.importance).toBe(0.9);
      expect(body.event.tags).toEqual(expect.arrayContaining(['金融', '加息']));
    });

    it('缺少必填字段应返回 400', async () => {
      const res = await fetch(`${server.address}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '缺少内容' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });
  });

  // ════════════════════════════════════════
  // 3. 触发 Tick（通过 engine.step 模拟）
  // ════════════════════════════════════════

  describe('Tick 执行链路', () => {
    it('执行 tick 后应更新世界状态', async () => {
      // 确保有事件待处理
      server.engine.injectEvent({
        title: 'E2E 测试事件',
        content: '用于端到端测试的模拟事件',
        category: 'tech',
        importance: 0.7,
        propagationRadius: 0.6,
        tags: ['e2e', 'test'],
      });

      // 执行 tick
      const result = await server.engine.step();
      expect(result.tick).toBeGreaterThan(0);
      expect(typeof result.durationMs).toBe('number');
      expect(typeof result.eventsProcessed).toBe('number');

      // 验证 tick 后世界状态更新
      const statusRes = await fetch(`${server.address}/api/status`);
      expect(statusRes.status).toBe(200);
      const status = await statusRes.json();
      expect(status.tick).toBe(result.tick);
      expect(status.agentCount).toBeGreaterThan(0);
      expect(status.activeAgents).toBeGreaterThan(0);
    });

    it('多次 tick 后历史记录应累积', async () => {
      // 已经有之前测试 step 过的数据，再执行一次
      await server.engine.step();

      const historyRes = await fetch(`${server.address}/api/history`);
      expect(historyRes.status).toBe(200);
      const historyBody = await historyRes.json();
      expect(historyBody.history.length).toBeGreaterThanOrEqual(2);
      expect(historyBody.source).toBe('memory');

      // 验证历史条目结构
      const entry = historyBody.history[0];
      expect(entry).toHaveProperty('tick');
      expect(entry).toHaveProperty('durationMs');
      expect(entry).toHaveProperty('eventsProcessed');
    });
  });

  // ════════════════════════════════════════
  // 4. 共识数据
  // ════════════════════════════════════════

  describe('GET /api/consensus', () => {
    it('应返回共识数据结构', async () => {
      const res = await fetch(`${server.address}/api/consensus`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('topics');
      expect(body).toHaveProperty('latest');
      expect(Array.isArray(body.topics)).toBe(true);
      expect(Array.isArray(body.latest)).toBe(true);
    });

    it('按 topic 查询应返回正确结构', async () => {
      const res = await fetch(`${server.address}/api/consensus?topic=测试话题`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topic).toBe('测试话题');
      expect(Array.isArray(body.signals)).toBe(true);
    });

    it('limit 参数应正确限制结果', async () => {
      const res = await fetch(`${server.address}/api/consensus?limit=5`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.latest.length).toBeLessThanOrEqual(5);
    });
  });

  // ════════════════════════════════════════
  // 5. WebSocket 连接 + 事件广播
  // ════════════════════════════════════════

  describe('WebSocket', () => {
    it('连接后应收到 connected 消息', async () => {
      const wsUrl = `ws://127.0.0.1:${server.port}/ws`;
      const ws = new WebSocket(wsUrl);

      try {
        // 先注册 message 监听再等 open，避免 connected 消息在 open 回调前到达被丢弃
        const connectedPromise = waitForWsMessage(ws, 'connected', 5000);
        await waitForWsOpen(ws);
        const msg = await connectedPromise;
        expect(msg['type']).toBe('connected');
        expect(msg['message']).toContain('BeeClaw');
      } finally {
        ws.close();
        await sleep(200);
      }
    });

    it('注入事件后应通过 WebSocket 收到 event_injected 广播', async () => {
      const wsUrl = `ws://127.0.0.1:${server.port}/ws`;
      const ws = new WebSocket(wsUrl);

      try {
        // 先注册 connected 监听再等 open，防止消息丢失
        const connectedPromise = waitForWsMessage(ws, 'connected', 5000);
        await waitForWsOpen(ws);
        await connectedPromise;

        // 设置监听器等待 event_injected
        const eventPromise = waitForWsMessage(ws, 'event_injected', 5000);

        // 注入事件（通过 HTTP API）
        const res = await fetch(`${server.address}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'WS广播测试',
            content: '通过 WebSocket 广播的事件',
          }),
        });
        expect(res.status).toBe(200);

        // 验证 WebSocket 收到广播
        const wsMsg = await eventPromise;
        expect(wsMsg['type']).toBe('event_injected');
        expect(wsMsg['data']).toBeDefined();
        const eventData = wsMsg['data'] as Record<string, unknown>;
        expect(eventData['title']).toBe('WS广播测试');
        expect(typeof wsMsg['ts']).toBe('number');
      } finally {
        ws.close();
        await sleep(200);
      }
    });

    it('tick 执行后应通过 WebSocket broadcast 广播', async () => {
      const wsUrl = `ws://127.0.0.1:${server.port}/ws`;
      const ws = new WebSocket(wsUrl);

      try {
        // 先注册 connected 监听再等 open，防止消息丢失
        const connectedPromise = waitForWsMessage(ws, 'connected', 5000);
        await waitForWsOpen(ws);
        await connectedPromise;

        // 设置 tick 广播监听
        const tickPromise = waitForWsMessage(ws, 'tick', 5000);

        // 通过 broadcast 函数模拟 tick 广播（与 index.ts 中 tickLoop 行为一致）
        const stepResult = await server.engine.step();
        broadcast('tick', stepResult);

        // 验证收到 tick 广播
        const wsMsg = await tickPromise;
        expect(wsMsg['type']).toBe('tick');
        const tickData = wsMsg['data'] as Record<string, unknown>;
        expect(typeof tickData['tick']).toBe('number');
        expect(typeof tickData['durationMs']).toBe('number');
      } finally {
        ws.close();
        await sleep(200);
      }
    });

    it('连接数应正确反映 WebSocket 客户端数量', async () => {
      // 等待之前测试残留连接完全关闭
      await sleep(300);
      const initialCount = getConnectionCount();

      const wsUrl = `ws://127.0.0.1:${server.port}/ws`;
      const ws1 = new WebSocket(wsUrl);
      const ws2 = new WebSocket(wsUrl);

      try {
        // 等待连接 open 并接收 connected 消息（确保服务端已注册到 clients Map）
        const [, , msg1, msg2] = await Promise.all([
          waitForWsOpen(ws1),
          waitForWsOpen(ws2),
          waitForWsMessage(ws1, 'connected', 5000),
          waitForWsMessage(ws2, 'connected', 5000),
        ]);
        expect(msg1['type']).toBe('connected');
        expect(msg2['type']).toBe('connected');

        const countAfterConnect = getConnectionCount();
        expect(countAfterConnect).toBe(initialCount + 2);
      } finally {
        ws1.close();
        ws2.close();
        await sleep(300);
      }
    });
  });

  // ════════════════════════════════════════
  // 6. 完整链路端到端
  // ════════════════════════════════════════

  describe('完整链路：事件注入 → tick → 状态更新 → API 查询', () => {
    it('应能完整跑通一轮仿真并通过 API 获取所有结果', async () => {
      // 记录起始 tick
      const initialStatusRes = await fetch(`${server.address}/api/status`);
      const initialStatus = await initialStatusRes.json();
      const startTick = initialStatus.tick as number;

      // 1. 注入事件
      const eventRes = await fetch(`${server.address}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '完整链路测试事件',
          content: 'AI 芯片巨头发布新一代训练芯片，性能提升 3 倍',
          category: 'tech',
          importance: 0.85,
          propagationRadius: 0.7,
          tags: ['AI', '芯片', '科技'],
        }),
      });
      expect(eventRes.status).toBe(200);
      const eventBody = await eventRes.json();
      expect(eventBody.ok).toBe(true);

      // 2. 执行 tick（模拟 tick 循环行为）
      const tickResult = await server.engine.step();
      broadcast('tick', tickResult);

      // 3. 验证世界状态更新
      const statusRes = await fetch(`${server.address}/api/status`);
      expect(statusRes.status).toBe(200);
      const statusBody = await statusRes.json();
      expect(statusBody.tick).toBe(startTick + 1);
      expect(statusBody.agentCount).toBeGreaterThan(0);
      expect(statusBody.lastTick).toBeDefined();
      expect(statusBody.lastTick.tick).toBe(startTick + 1);

      // 4. 验证 Agent 列表
      const agentsRes = await fetch(`${server.address}/api/agents`);
      expect(agentsRes.status).toBe(200);
      const agentsBody = await agentsRes.json();
      expect(agentsBody.agents.length).toBeGreaterThan(0);
      expect(agentsBody.total).toBeGreaterThan(0);

      // 验证 Agent 数据结构
      const firstAgent = agentsBody.agents[0];
      expect(firstAgent).toHaveProperty('id');
      expect(firstAgent).toHaveProperty('name');
      expect(firstAgent).toHaveProperty('profession');
      expect(firstAgent).toHaveProperty('status');
      expect(firstAgent).toHaveProperty('influence');

      // 5. 验证共识数据
      const consensusRes = await fetch(`${server.address}/api/consensus`);
      expect(consensusRes.status).toBe(200);
      const consensusBody = await consensusRes.json();
      expect(consensusBody).toHaveProperty('topics');
      expect(consensusBody).toHaveProperty('latest');

      // 6. 验证历史记录包含最新 tick
      const historyRes = await fetch(`${server.address}/api/history`);
      expect(historyRes.status).toBe(200);
      const historyBody = await historyRes.json();
      expect(historyBody.history.length).toBeGreaterThan(0);

      // 7. 验证 /health 一致性
      const healthRes = await fetch(`${server.address}/health`);
      const healthBody = await healthRes.json();
      expect(healthBody.tick).toBe(statusBody.tick);

      // 8. 验证 /metrics JSON 指标
      const metricsRes = await fetch(`${server.address}/metrics`);
      expect(metricsRes.status).toBe(200);
      const metricsBody = await metricsRes.json();
      expect(metricsBody.engine.currentTick).toBe(statusBody.tick);
      expect(metricsBody.engine.totalAgents).toBeGreaterThan(0);
      expect(metricsBody.server.uptime).toBeGreaterThan(0);
      expect(typeof metricsBody.memory.rssMB).toBe('string');

      // 9. 验证 Prometheus 格式指标
      const promRes = await fetch(`${server.address}/metrics/prometheus`);
      expect(promRes.status).toBe(200);
      const promText = await promRes.text();
      expect(promText).toContain('beeclaw_current_tick');
      expect(promText).toContain('beeclaw_agents_total');
      expect(promText).toContain('beeclaw_uptime_seconds');
    });
  });

  // ════════════════════════════════════════
  // 7. 补充 API 端点测试
  // ════════════════════════════════════════

  describe('补充 API 端点', () => {
    it('GET /api/agents/:id 应返回 Agent 详情', async () => {
      const agents = server.engine.getAgents();
      expect(agents.length).toBeGreaterThan(0);

      const targetId = agents[0]!.id;
      const res = await fetch(`${server.address}/api/agents/${targetId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(targetId);
      expect(body.name).toBeDefined();
      expect(body.persona).toBeDefined();
      expect(body.memory).toBeDefined();
    });

    it('GET /api/agents/:id 不存在的 Agent 应返回 404', async () => {
      const res = await fetch(`${server.address}/api/agents/non_existent_agent_id`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Agent not found');
    });

    it('GET /api/config/llm 应返回 LLM 配置', async () => {
      const res = await fetch(`${server.address}/api/config/llm`);
      expect(res.status).toBe(200);
      const body = await res.json();
      // mock 配置应该返回
      expect(body).toHaveProperty('local');
      expect(body).toHaveProperty('cheap');
      expect(body).toHaveProperty('strong');
    });

    it('GET /api/agents 分页应正常工作', async () => {
      const res = await fetch(`${server.address}/api/agents?page=1&size=2`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agents.length).toBeLessThanOrEqual(2);
      expect(body.page).toBe(1);
      expect(body.size).toBe(2);
      expect(body.total).toBeGreaterThan(0);
      expect(body.pages).toBeGreaterThan(0);
    });
  });
});
