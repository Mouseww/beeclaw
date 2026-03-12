#!/usr/bin/env node
// ============================================================================
// BeeClaw Server — 主入口
// 启动 Fastify HTTP 服务 + WorldEngine 守护进程
// ============================================================================

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig } from '@beeclaw/shared';
import { initDatabase } from './persistence/database.js';
import { Store } from './persistence/store.js';
import { registerWs, broadcast, getConnectionCount } from './ws/handler.js';
import { registerStatusRoute } from './api/status.js';
import { registerAgentsRoute } from './api/agents.js';
import { registerEventsRoute } from './api/events.js';
import { registerConsensusRoute } from './api/consensus.js';
import { registerHistoryRoute } from './api/history.js';
import { registerScenarioRoute } from './api/scenario.js';

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

  // 2. 初始化 ModelRouter
  const modelRouter = new ModelRouter();

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
    // TODO: 从 row 重建 Agent 实例（需要 Agent.fromData）
    // 目前先生成新的
    const agents = engine.spawner.spawnBatch(INITIAL_AGENTS, store.getTick());
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

  // 健康检查
  app.get('/health', async () => ({ ok: true }));

  await app.listen({ port: PORT, host: HOST });
  console.log(`[Server] HTTP + WebSocket 监听 http://${HOST}:${PORT}`);
  console.log(`[Server] Tick 间隔: ${TICK_INTERVAL}ms, 保存间隔: 每 ${SAVE_INTERVAL} tick`);

  // 7. 启动 WorldEngine 自动 tick
  // 自定义 tick 回调：保存 + 广播
  let tickCount = 0;
  const originalStep = engine.step.bind(engine);

  // 用 setInterval 手动驱动 tick，这样可以在每次 tick 后做持久化
  const tickLoop = setInterval(async () => {
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

      console.log(
        `[Server] Tick ${result.tick} — ` +
        `事件:${result.eventsProcessed} 响应:${result.responsesCollected} ` +
        `耗时:${result.durationMs}ms WS:${getConnectionCount()}`
      );
    } catch (err) {
      console.error('[Server] Tick 执行错误:', err);
    }
  }, TICK_INTERVAL);

  console.log(`[Server] 🚀 自动 tick 循环已启动\n`);

  // 8. 优雅退出
  const shutdown = async () => {
    console.log('\n[Server] 收到退出信号，保存状态...');
    clearInterval(tickLoop);

    // 最终保存
    const tick = engine.getCurrentTick();
    store.setTick(tick);
    store.saveAgents(engine.getAgents());
    const lastResult = engine.getLastTickResult();
    if (lastResult) store.saveTickResult(lastResult);

    console.log(`[Server] 状态已保存 (Tick ${tick}, ${engine.getAgents().length} agents)`);

    await app.close();
    db.close();
    console.log('[Server] 🐝 BeeClaw Server 已停止');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Server] 启动失败:', err);
  process.exit(1);
});
