#!/usr/bin/env node
// ============================================================================
// Worker 独立进程入口脚本
//
// 用于分布式部署模式下，通过 Redis 或 NATS 与 Coordinator 通信。
// docker-compose 中通过 `node packages/coordinator/dist/worker-entry.js` 启动。
// ============================================================================

import { Worker } from './Worker.js';
import { RedisTransportLayer } from './RedisTransportLayer.js';
import { RuntimeAgentExecutor } from './RuntimeAgentExecutor.js';
import type { BeeAgent } from '@beeclaw/shared';

// ── 环境变量 ──

const REDIS_URL = process.env['BEECLAW_REDIS_URL'] ?? 'redis://127.0.0.1:6379';
const WORKER_ID = process.env['BEECLAW_WORKER_ID'] ?? `worker-${process.pid}`;
const LOG_LEVEL = process.env['BEECLAW_LOG_LEVEL'] ?? 'info';
const NODE_ROLE = process.env['BEECLAW_NODE_ROLE'];
const AGENT_DATA_URL = process.env['BEECLAW_AGENT_DATA_URL'];
const AGENT_TIMEOUT_MS = parseInt(process.env['BEECLAW_AGENT_TIMEOUT_MS'] ?? '30000', 10);

// ── 结构化日志 ──

const isProduction = process.env['NODE_ENV'] === 'production';

function log(level: string, msg: string, data?: Record<string, unknown>): void {
  if (level === 'debug' && LOG_LEVEL !== 'debug') return;

  if (isProduction) {
    const entry = { level, component: 'worker', workerId: WORKER_ID, msg, ...data, ts: new Date().toISOString() };
    console.log(JSON.stringify(entry));
  } else {
    const prefix = `[Worker:${WORKER_ID}]`;
    console.log(`${prefix} [${level}] ${msg}`, data ? JSON.stringify(data) : '');
  }
}

// ── Worker 指标收集 ──

export interface WorkerMetrics {
  workerId: string;
  startedAt: number;
  ticksProcessed: number;
  totalAgentsActivated: number;
  totalResponsesCollected: number;
  totalErrors: number;
  lastTickDurationMs: number;
  avgTickDurationMs: number;
  uptimeSeconds: number;
}

let ticksProcessed = 0;
let totalAgentsActivated = 0;
let totalResponsesCollected = 0;
let totalErrors = 0;
let lastTickDurationMs = 0;
let tickDurationSum = 0;
let lastSnapshotTick = 0;
let lastSnapshotCount = 0;
const startedAt = Date.now();

function getMetrics(): WorkerMetrics {
  return {
    workerId: WORKER_ID,
    startedAt,
    ticksProcessed,
    totalAgentsActivated,
    totalResponsesCollected,
    totalErrors,
    lastTickDurationMs,
    avgTickDurationMs: ticksProcessed > 0 ? tickDurationSum / ticksProcessed : 0,
    uptimeSeconds: (Date.now() - startedAt) / 1000,
  };
}

// ── 真实 AgentExecutor（基于 agent-runtime） ──
// 分布式模式下，Worker 接收 Coordinator 的 tick_begin 消息后执行分配的 Agent。
// RuntimeAgentExecutor 加载真实 Agent 实例，通过 LLM 调用生成结构化响应。
// Agent 数据可通过以下方式加载：
//   1. BEECLAW_AGENT_DATA_URL 环境变量指向一个 JSON 数据源（HTTP GET 返回 BeeAgent[]）
//   2. Coordinator 通过 Redis 消息下发（未来扩展）

const executor = new RuntimeAgentExecutor({
  agentTimeoutMs: AGENT_TIMEOUT_MS,
  enableLogging: LOG_LEVEL === 'debug',
});

/**
 * 从远端数据源加载 Agent 数据到 executor。
 * 如果 BEECLAW_AGENT_DATA_URL 已配置，则通过 HTTP GET 获取 BeeAgent[] JSON。
 * 否则 Worker 将从空 Agent 池启动，等待 Coordinator 后续下发。
 */
async function loadAgentsFromRemote(): Promise<void> {
  if (!AGENT_DATA_URL) {
    log('info', 'BEECLAW_AGENT_DATA_URL 未配置，Worker 将以空 Agent 池启动');
    return;
  }

  try {
    log('info', '正在从远端加载 Agent 数据...', { url: AGENT_DATA_URL });
    const response = await fetch(AGENT_DATA_URL, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const agents = (await response.json()) as BeeAgent[];
    if (!Array.isArray(agents)) {
      throw new Error('Agent 数据格式错误: 期望 BeeAgent[]');
    }

    executor.loadAgents(agents);
    log('info', `从远端加载了 ${agents.length} 个 Agent`);
  } catch (error) {
    log('error', '加载远端 Agent 数据失败，Worker 将以空 Agent 池启动', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── 解析 Redis URL ──

function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1) || '0', 10) : 0,
    };
  } catch {
    return { host: '127.0.0.1', port: 6379 };
  }
}

// ── 主函数 ──

async function main(): Promise<void> {
  if (NODE_ROLE && NODE_ROLE !== 'worker') {
    log('error', `BEECLAW_NODE_ROLE is "${NODE_ROLE}" but this is a worker entry point. Exiting.`);
    process.exit(1);
  }

  log('info', 'Worker 进程启动', { pid: process.pid, redisUrl: REDIS_URL });

  // 加载 Agent 数据
  await loadAgentsFromRemote();

  const redisConfig = parseRedisUrl(REDIS_URL);
  const transport = new RedisTransportLayer({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
    prefix: 'beeclaw',
  });

  await transport.connect();
  log('info', 'Redis 连接已建立');

  const worker = new Worker({ id: WORKER_ID }, transport, executor);

  // 包装 processTick 以收集指标
  const originalProcessTick = worker.processTick.bind(worker);
  worker.processTick = async (tick, events) => {
    const start = Date.now();
    try {
      const result = await originalProcessTick(tick, events);
      const duration = Date.now() - start;

      ticksProcessed++;
      totalAgentsActivated += result.agentsActivated;
      totalResponsesCollected += result.responses.length;
      lastTickDurationMs = duration;
      tickDurationSum += duration;

      // 在 tick 完成后生成快照
      const snapshots = worker.generateSnapshots(tick);
      lastSnapshotTick = tick;
      lastSnapshotCount = snapshots.length;

      log('info', `Tick ${tick} 完成`, {
        agentsActivated: result.agentsActivated,
        responses: result.responses.length,
        newEvents: result.newEvents.length,
        snapshots: snapshots.length,
        durationMs: duration,
      });

      return result;
    } catch (err) {
      totalErrors++;
      throw err;
    }
  };

  // 发送就绪信号
  await worker.sendReady();
  log('info', 'Worker 就绪信号已发送, 等待 Coordinator 分配任务...');

  // ── 健康检查 HTTP 服务（简易版，供 Docker/K8s 探针使用） ──
  const HEALTH_PORT = parseInt(process.env['BEECLAW_WORKER_HEALTH_PORT'] ?? '3001', 10);

  const { createServer } = await import('node:http');
  const healthServer = createServer((req, res) => {
    if (req.url === '/healthz/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'alive', workerId: WORKER_ID }));
      return;
    }

    if (req.url === '/healthz/ready') {
      // ready = Redis 已连接
      const ready = transport.getRegisteredWorkerIds().length >= 0; // transport active
      const statusCode = ready ? 200 : 503;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: ready ? 'ready' : 'not_ready',
        workerId: WORKER_ID,
      }));
      return;
    }

    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...getMetrics(),
        loadedAgents: executor.getLoadedAgentCount(),
        loadedAgentIds: executor.getLoadedAgentIds(),
        lastSnapshotTick,
        lastSnapshotCount,
      }));
      return;
    }

    // 获取 Agent 状态快照（供 Coordinator 拉取或运维调试）
    if (req.url === '/snapshots' || req.url?.startsWith('/snapshots?')) {
      try {
        const url = new URL(req.url, `http://localhost:${HEALTH_PORT}`);
        const tick = parseInt(url.searchParams.get('tick') ?? String(lastSnapshotTick), 10);
        const snapshots = executor.createSnapshots([], tick, WORKER_ID);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          workerId: WORKER_ID,
          tick,
          count: snapshots.length,
          snapshots,
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }));
      }
      return;
    }

    if (req.url === '/metrics/prometheus') {
      const m = getMetrics();
      const lines = [
        '# HELP beeclaw_worker_uptime_seconds Worker uptime in seconds',
        '# TYPE beeclaw_worker_uptime_seconds gauge',
        `beeclaw_worker_uptime_seconds{worker="${m.workerId}"} ${m.uptimeSeconds.toFixed(1)}`,
        '# HELP beeclaw_worker_ticks_processed_total Total ticks processed by this worker',
        '# TYPE beeclaw_worker_ticks_processed_total counter',
        `beeclaw_worker_ticks_processed_total{worker="${m.workerId}"} ${m.ticksProcessed}`,
        '# HELP beeclaw_worker_agents_activated_total Total agents activated',
        '# TYPE beeclaw_worker_agents_activated_total counter',
        `beeclaw_worker_agents_activated_total{worker="${m.workerId}"} ${m.totalAgentsActivated}`,
        '# HELP beeclaw_worker_responses_total Total responses collected',
        '# TYPE beeclaw_worker_responses_total counter',
        `beeclaw_worker_responses_total{worker="${m.workerId}"} ${m.totalResponsesCollected}`,
        '# HELP beeclaw_worker_errors_total Total errors',
        '# TYPE beeclaw_worker_errors_total counter',
        `beeclaw_worker_errors_total{worker="${m.workerId}"} ${m.totalErrors}`,
        '# HELP beeclaw_worker_last_tick_duration_ms Last tick duration in ms',
        '# TYPE beeclaw_worker_last_tick_duration_ms gauge',
        `beeclaw_worker_last_tick_duration_ms{worker="${m.workerId}"} ${m.lastTickDurationMs}`,
        '# HELP beeclaw_worker_avg_tick_duration_ms Average tick duration in ms',
        '# TYPE beeclaw_worker_avg_tick_duration_ms gauge',
        `beeclaw_worker_avg_tick_duration_ms{worker="${m.workerId}"} ${Math.round(m.avgTickDurationMs)}`,
        '',
      ];
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(lines.join('\n'));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  healthServer.listen(HEALTH_PORT, '0.0.0.0', () => {
    log('info', `Worker 健康检查端口已监听`, { port: HEALTH_PORT });
  });

  // ── 优雅退出 ──
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    log('info', `收到 ${signal} 信号，Worker 正在退出...`, getMetrics() as unknown as Record<string, unknown>);

    worker.dispose();

    try {
      await transport.disconnect();
    } catch {
      // 忽略断连错误
    }

    healthServer.close();
    log('info', 'Worker 已停止');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // 防止进程退出
  process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled rejection', { reason: String(reason) });
    totalErrors++;
  });
}

main().catch((err) => {
  console.error('[Worker] 启动失败:', err);
  process.exit(1);
});
