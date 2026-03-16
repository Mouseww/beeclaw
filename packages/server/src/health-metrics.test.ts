// ============================================================================
// @beeclaw/server — Health & Prometheus 端点测试
// 测试 /health 和 /metrics/prometheus 端点
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig } from '@beeclaw/shared';
import { initDatabase } from './persistence/database.js';
import { Store } from './persistence/store.js';
import { registerHealthRoute } from './api/health.js';
import { registerMetricsRoute } from './api/metrics.js';
import { registerPrometheusRoute } from './api/prometheus.js';
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
    getWsCount: () => 2,
  };

  registerHealthRoute(app, ctx);
  registerMetricsRoute(app, ctx);
  registerPrometheusRoute(app, ctx);

  await app.ready();
  return { app, engine, store, modelRouter };
}

// ── 测试 ──

describe('Health & Metrics 端点测试', () => {
  let app: FastifyInstance;
  let engine: WorldEngine;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const built = await buildTestApp();
    app = built.app;
    engine = built.engine;
  });

  afterEach(async () => {
    await app.close();
  });

  // ════════════════════════════════════════
  // GET /health
  // ════════════════════════════════════════

  describe('GET /health', () => {
    it('应返回 status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
    });

    it('应包含 uptime 数字', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('应包含 version 字符串', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(typeof body.version).toBe('string');
      expect(body.version).toBe('1.0.0');
    });

    it('应包含当前 tick', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(body.tick).toBe(0);
    });

    it('step 之后 tick 应增加', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);
      await engine.step();

      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(body.tick).toBe(1);
    });
  });

  // ════════════════════════════════════════
  // GET /metrics (JSON)
  // ════════════════════════════════════════

  describe('GET /metrics (JSON)', () => {
    it('应返回 200 和完整指标结构', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(200);
      const body = res.json();

      // 验证顶层字段
      expect(body).toHaveProperty('server');
      expect(body).toHaveProperty('engine');
      expect(body).toHaveProperty('performance');
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('llm');
      expect(body).toHaveProperty('consensus');
      expect(body).toHaveProperty('memory');
      expect(body).toHaveProperty('wsConnections');
      expect(body).toHaveProperty('recentTicks');
    });

    it('应正确反映 agent 数量', async () => {
      const agents = engine.spawner.spawnBatch(5, 0);
      engine.addAgents(agents);

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();
      expect(body.engine.totalAgents).toBe(5);
      expect(body.engine.activeAgents).toBe(5);
    });

    it('server 段应包含 uptime 和 pid', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();
      expect(typeof body.server.uptime).toBe('number');
      expect(typeof body.server.pid).toBe('number');
      expect(typeof body.server.nodeVersion).toBe('string');
    });

    it('wsConnections 应等于 mock 值', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();
      expect(body.wsConnections).toBe(2);
    });

    it('step 后 recentTicks 应包含 tick 统计数据', async () => {
      const agents = engine.spawner.spawnBatch(5, 0);
      engine.addAgents(agents);

      // 注入事件并执行 step 以产生 tick 历史
      engine.injectEvent({
        title: '指标测试事件',
        content: '测试内容',
        category: 'general',
        importance: 0.9,
        propagationRadius: 0.8,
        tags: ['metric-test'],
      });
      await engine.step();

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();

      // recentTicks 应有数据
      expect(body.recentTicks.count).toBe(1);
      expect(body.recentTicks.avgDurationMs).toBeGreaterThanOrEqual(0);
      // events 应聚合 tick 历史
      expect(body.events.totalEventsProcessed).toBeGreaterThanOrEqual(1);
      expect(body.events.totalResponsesCollected).toBeGreaterThanOrEqual(0);
    });

    it('多次 step 后 recentTicks 平均值应正确计算', async () => {
      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      // 执行多个 step
      engine.injectEvent({ title: '事件1', content: '内容1', importance: 0.9, propagationRadius: 0.8 });
      await engine.step();
      engine.injectEvent({ title: '事件2', content: '内容2', importance: 0.7, propagationRadius: 0.5 });
      await engine.step();

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();

      expect(body.recentTicks.count).toBe(2);
      expect(body.recentTicks.avgEventsPerTick).toBeGreaterThan(0);
    });

    it('有共识信号时 consensus.topics 应有内容', async () => {
      const agents = engine.spawner.spawnBatch(10, 0);
      engine.addAgents(agents);

      // 注入高重要性事件，使足够多 Agent 产生响应以触发共识分析
      engine.injectEvent({
        title: '重大经济事件',
        content: '经济形势变化',
        category: 'finance',
        importance: 1.0,
        propagationRadius: 1.0,
        tags: ['economy'],
      });
      await engine.step();

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();

      // consensus 段应存在
      expect(body.consensus).toBeDefined();
      expect(typeof body.consensus.totalSignals).toBe('number');
      expect(Array.isArray(body.consensus.topics)).toBe(true);
      // 如果有信号，topics 应有值
      if (body.consensus.latestSignalCount > 0) {
        expect(body.consensus.topics.length).toBeGreaterThan(0);
      }
    });

    it('dormant 和 dead agent 应正确统计', async () => {
      const agents = engine.spawner.spawnBatch(4, 0);
      engine.addAgents(agents);
      // 设置不同状态
      agents[0]!.setStatus('dormant');
      agents[1]!.setStatus('dead');

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();

      expect(body.engine.totalAgents).toBe(4);
      expect(body.engine.activeAgents).toBe(2);
      expect(body.engine.dormantAgents).toBe(1);
      expect(body.engine.deadAgents).toBe(1);
    });
  });

  // ════════════════════════════════════════
  // GET /metrics/prometheus
  // ════════════════════════════════════════

  describe('GET /metrics/prometheus', () => {
    it('应返回 200 和 text/plain Content-Type', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('输出应包含 Prometheus HELP 和 TYPE 注释', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('# HELP beeclaw_uptime_seconds');
      expect(body).toContain('# TYPE beeclaw_uptime_seconds gauge');
      expect(body).toContain('# HELP beeclaw_current_tick');
      expect(body).toContain('# TYPE beeclaw_current_tick gauge');
    });

    it('应包含 agent 指标', async () => {
      const agents = engine.spawner.spawnBatch(4, 0);
      engine.addAgents(agents);

      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('beeclaw_agents_total 4');
      expect(body).toContain('beeclaw_agents_active 4');
      expect(body).toContain('beeclaw_agents_by_status{status="active"} 4');
      expect(body).toContain('beeclaw_agents_by_status{status="dormant"} 0');
      expect(body).toContain('beeclaw_agents_by_status{status="dead"} 0');
    });

    it('应包含 LLM 调用指标', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('beeclaw_llm_calls_total');
      expect(body).toContain('beeclaw_llm_calls_succeeded');
      expect(body).toContain('beeclaw_llm_calls_failed');
      expect(body).toContain('beeclaw_llm_avg_duration_ms');
    });

    it('应包含事件指标', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('beeclaw_events_active');
      expect(body).toContain('beeclaw_events_processed_total');
      expect(body).toContain('beeclaw_responses_collected_total');
    });

    it('应包含缓存指标', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('beeclaw_cache_hits_total');
      expect(body).toContain('beeclaw_cache_misses_total');
      expect(body).toContain('beeclaw_cache_hit_rate');
    });

    it('应包含内存指标', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('beeclaw_memory_rss_bytes');
      expect(body).toContain('beeclaw_memory_heap_used_bytes');
      expect(body).toContain('beeclaw_memory_heap_total_bytes');
    });

    it('应包含 WebSocket 连接指标', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('beeclaw_ws_connections 2');
    });

    it('step 后 tick 指标应更新', async () => {
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

      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const body = res.payload;
      expect(body).toContain('beeclaw_current_tick 1');
    });

    it('Prometheus 格式每行应是合法的 metric/comment/空行', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
      const lines = res.payload.split('\n');
      for (const line of lines) {
        // 每行应是 # 注释、空行、或 metric_name{labels} value
        const valid =
          line === '' ||
          line.startsWith('#') ||
          /^[a-zA-Z_][a-zA-Z0-9_]*(\{[^}]*\})?\s+[\d.eE+-]+$/.test(line);
        if (!valid) {
          // 允许自动通过但便于调试打印
          console.log('Unexpected Prometheus line:', line);
        }
        expect(valid).toBe(true);
      }
    });
  });

  // ════════════════════════════════════════
  // formatUptime 边界分支覆盖（通过 /metrics 端点间接测试）
  // ════════════════════════════════════════

  describe('GET /metrics — formatUptime 分支', () => {
    it('uptimeFormatted 应包含秒数', async () => {
      // 默认 uptime 较小，应只产生 Xs 格式
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();
      expect(body.server.uptimeFormatted).toMatch(/\d+s/);
    });

    it('长时间 uptime 应包含天/小时/分钟', async () => {
      // mock process.uptime 返回超过 1 天的秒数
      const _originalUptime = process.uptime;
      // 1d 2h 30m 45s = 86400+7200+1800+45 = 95445
      vi.spyOn(process, 'uptime').mockReturnValue(95445);

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();
      expect(body.server.uptimeFormatted).toContain('1d');
      expect(body.server.uptimeFormatted).toContain('2h');
      expect(body.server.uptimeFormatted).toContain('30m');
      expect(body.server.uptimeFormatted).toContain('45s');

      // 恢复
      vi.mocked(process.uptime).mockRestore();
    });

    it('仅小时级别 uptime 应包含小时和分钟', async () => {
      // 3h 15m 10s = 10800 + 900 + 10 = 11710
      vi.spyOn(process, 'uptime').mockReturnValue(11710);

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.json();
      expect(body.server.uptimeFormatted).not.toContain('d');
      expect(body.server.uptimeFormatted).toContain('3h');
      expect(body.server.uptimeFormatted).toContain('15m');
      expect(body.server.uptimeFormatted).toContain('10s');

      vi.mocked(process.uptime).mockRestore();
    });
  });
});
