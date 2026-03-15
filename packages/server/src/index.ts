#!/usr/bin/env node
// ============================================================================
// BeeClaw Server — 主入口
// 启动 Fastify HTTP 服务 + WorldEngine 守护进程
// ============================================================================

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { WorldEngine } from '@beeclaw/world-engine';
import { Agent, ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, AgentPersona, AgentMemoryState, ModelTier, AgentStatus } from '@beeclaw/shared';
import { initDatabase } from './persistence/database.js';
import { Store } from './persistence/store.js';
import { registerWs, broadcast, getConnectionCount, stopHeartbeat, closeAllConnections } from './ws/handler.js';
import { registerStatusRoute } from './api/status.js';
import { registerAgentsRoute } from './api/agents.js';
import { registerEventsRoute } from './api/events.js';
import { registerConsensusRoute } from './api/consensus.js';
import { registerHistoryRoute } from './api/history.js';
import { registerScenarioRoute } from './api/scenario.js';
import { registerMetricsRoute } from './api/metrics.js';
import { registerHealthRoute } from './api/health.js';
import { registerPrometheusRoute } from './api/prometheus.js';
import { registerConfigRoute } from './api/config.js';
import {
  registerAuthMiddleware,
  registerCorsMiddleware,
  registerRateLimitMiddleware,
  registerRequestLogger,
} from './middleware/index.js';

// ── 配置 ──

const PORT = parseInt(process.env['BEECLAW_PORT'] ?? '3000', 10);
const HOST = process.env['BEECLAW_HOST'] ?? '0.0.0.0';
const TICK_INTERVAL = parseInt(process.env['BEECLAW_TICK_INTERVAL'] ?? '30000', 10);
const INITIAL_AGENTS = parseInt(process.env['BEECLAW_INITIAL_AGENTS'] ?? '10', 10);
const DB_PATH = process.env['BEECLAW_DB_PATH'];
const SEED_EVENT = process.env['BEECLAW_SEED_EVENT'];
const SAVE_INTERVAL = parseInt(process.env['BEECLAW_SAVE_INTERVAL'] ?? '5', 10); // 每 N 个 tick 保存一次

// ── ServerContext（共享给路由） ──

export interface ServerContext {
  engine: WorldEngine;
  store: Store;
  modelRouter: ModelRouter;
  getWsCount: () => number;
}

// ── 主函数 ──

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  🐝 BeeClaw Server — 群体智能仿真引擎');
  console.log('═══════════════════════════════════════════');

  // 1. 初始化数据库
  const db = initDatabase(DB_PATH);
  const store = new Store(db);
  console.log(`[Server] SQLite 已初始化`);

  // 2. 初始化 ModelRouter（先用环境变量，再用数据库覆盖）
  const modelRouter = new ModelRouter();

  // 从数据库加载持久化的 LLM 配置，覆盖环境变量默认值
  const savedLLMConfig = store.loadLLMConfigs();
  if (savedLLMConfig) {
    modelRouter.updateGlobalConfig(savedLLMConfig);
    console.log(`[Server] 已从数据库恢复 LLM 配置`);
  } else {
    console.log(`[Server] 使用环境变量默认 LLM 配置`);
  }

  // 3. 初始化 WorldEngine
  const config: WorldConfig = {
    tickIntervalMs: TICK_INTERVAL,
    maxAgents: 500,
    eventRetentionTicks: 100,
    enableNaturalSelection: false,
  };

  const engine = new WorldEngine({
    config,
    modelRouter,
    concurrency: 5,
  });

  // 4. 加载或创建 Agents
  const savedAgents = store.loadAgentRows();
  if (savedAgents.length > 0) {
    console.log(`[Server] 从数据库恢复 ${savedAgents.length} 个 Agent`);
    const agents: Agent[] = [];
    for (const row of savedAgents) {
      try {
        const agent = Agent.fromData({
          id: row.id,
          name: row.name,
          persona: JSON.parse(row.persona) as AgentPersona,
          memory: JSON.parse(row.memory) as AgentMemoryState,
          relationships: [],
          followers: JSON.parse(row.followers) as string[],
          following: JSON.parse(row.following) as string[],
          influence: row.influence,
          status: row.status as AgentStatus,
          credibility: row.credibility,
          spawnedAtTick: row.spawned_at_tick,
          lastActiveTick: row.last_active_tick,
          modelTier: row.model_tier as ModelTier,
          modelId: `${row.model_tier}-default`,
        });
        agents.push(agent);
      } catch (err) {
        console.error(`[Server] Agent "${row.id}" (${row.name}) 数据恢复失败，跳过:`, err);
      }
    }
    engine.addAgents(agents);
  } else {
    console.log(`[Server] 孵化 ${INITIAL_AGENTS} 个初始 Agent`);
    const agents = engine.spawner.spawnBatch(INITIAL_AGENTS, 0);
    engine.addAgents(agents);
  }

  // 5. 注入种子事件
  if (SEED_EVENT) {
    engine.injectEvent({
      title: SEED_EVENT,
      content: SEED_EVENT,
      category: 'general',
      importance: 0.8,
      propagationRadius: 0.6,
      tags: ['seed'],
    });
    console.log(`[Server] 种子事件: "${SEED_EVENT}"`);
  }

  // 6. 启动 Fastify
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  // 注册中间件（在路由之前）
  await registerCorsMiddleware(app);
  await registerRateLimitMiddleware(app);
  registerAuthMiddleware(app);
  registerRequestLogger(app);

  // 共享上下文
  const ctx: ServerContext = {
    engine,
    store,
    modelRouter,
    getWsCount: getConnectionCount,
  };

  // 注册路由
  registerWs(app);
  registerStatusRoute(app, ctx);
  registerAgentsRoute(app, ctx);
  registerEventsRoute(app, ctx);
  registerConsensusRoute(app, ctx);
  registerHistoryRoute(app, ctx);
  registerScenarioRoute(app, ctx);
  registerMetricsRoute(app, ctx);
  registerHealthRoute(app, ctx);
  registerPrometheusRoute(app, ctx);
  registerConfigRoute(app, ctx);

  // 静态文件：Dashboard SPA
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const dashboardRoot = join(__dirname, '../../dashboard/dist');

  if (existsSync(dashboardRoot)) {
    await app.register(fastifyStatic, {
      root: dashboardRoot,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: 非 API/WS 路径返回 index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws') || req.url === '/health' || req.url === '/metrics') {
        reply.code(404).send({ error: 'Not Found' });
      } else {
        reply.sendFile('index.html');
      }
    });

    console.log(`[Server] Dashboard 已挂载: ${dashboardRoot}`);
  } else {
    console.log(`[Server] ⚠️ Dashboard 未找到: ${dashboardRoot}`);
  }

  await app.listen({ port: PORT, host: HOST });
  console.log(`[Server] HTTP + WebSocket 监听 http://${HOST}:${PORT}`);
  console.log(`[Server] Tick 间隔: ${TICK_INTERVAL}ms, 保存间隔: 每 ${SAVE_INTERVAL} tick`);

  // 7. 启动 WorldEngine 自动 tick
  // 自定义 tick 回调：保存 + 广播
  let tickCount = 0;
  let tickRunning = false; // 防止 tick 堆积

  // 用 setInterval 手动驱动 tick，这样可以在每次 tick 后做持久化
  const tickLoop = setInterval(async () => {
    // 如果上一个 tick 还未完成，跳过本轮避免堆积
    if (tickRunning) {
      console.warn('[Server] ⚠️ 上一个 tick 仍在执行中，跳过本轮');
      return;
    }
    tickRunning = true;
    try {
      const result = await engine.step();
      tickCount++;

      // WebSocket 广播 tick 结果
      broadcast('tick', result);

      // 广播共识信号
      const signals = engine.getConsensusEngine().getLatestSignals();
      if (signals.length > 0) {
        broadcast('consensus', signals);
      }

      // 定期保存
      if (tickCount % SAVE_INTERVAL === 0) {
        store.setTick(result.tick);
        store.saveTickResult(result);
        store.saveAgents(engine.getAgents());
        for (const signal of signals) {
          store.saveConsensusSignal(signal);
        }
        console.log(`[Server] 💾 Tick ${result.tick} 已保存到数据库`);
      }

      // 警告 tick 耗时过长
      if (result.durationMs > TICK_INTERVAL * 0.8) {
        console.warn(
          `[Server] ⚠️ Tick ${result.tick} 耗时 ${result.durationMs}ms，接近间隔 ${TICK_INTERVAL}ms，可能需要调大间隔或减少 Agent`
        );
      }

      console.log(
        `[Server] Tick ${result.tick} — ` +
        `事件:${result.eventsProcessed} 响应:${result.responsesCollected} ` +
        `耗时:${result.durationMs}ms WS:${getConnectionCount()}`
      );
    } catch (err) {
      console.error('[Server] Tick 执行错误:', err);
    } finally {
      tickRunning = false;
    }
  }, TICK_INTERVAL);

  console.log(`[Server] 🚀 自动 tick 循环已启动\n`);

  // 8. 优雅退出（带超时保护）
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Server] 收到 ${signal} 信号，保存状态...`);
    clearInterval(tickLoop);

    // 超时强制退出保护
    const forceExitTimer = setTimeout(() => {
      console.error('[Server] ⚠️ 优雅退出超时，强制退出');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // 允许进程自然退出，不因此 timer 阻塞
    forceExitTimer.unref();

    try {
      // 最终保存
      const tick = engine.getCurrentTick();
      store.setTick(tick);
      store.saveAgents(engine.getAgents());
      const lastResult = engine.getLastTickResult();
      if (lastResult) store.saveTickResult(lastResult);
      console.log(`[Server] 状态已保存 (Tick ${tick}, ${engine.getAgents().length} agents)`);

      // 关闭所有 WebSocket 连接
      stopHeartbeat();
      closeAllConnections();

      await app.close();
      db.close();
      console.log('[Server] 🐝 BeeClaw Server 已停止');
    } catch (err) {
      console.error('[Server] 退出过程中出错:', err);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}

main().catch((err) => {
  console.error('[Server] 启动失败:', err);
  process.exit(1);
});
