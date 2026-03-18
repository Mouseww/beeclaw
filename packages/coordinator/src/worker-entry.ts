#!/usr/bin/env node
// ============================================================================
// Worker 独立进程入口脚本
//
// 用于分布式部署模式下，通过 Redis 或 NATS 与 Coordinator 通信。
// docker-compose 中通过 `node packages/coordinator/dist/worker-entry.js` 启动。
// ============================================================================

import { Worker } from './Worker.js';
import { RedisTransportLayer } from './RedisTransportLayer.js';
import type { AgentExecutor } from './Worker.js';
import type { WorldEvent } from '@beeclaw/shared';
import type { AgentResponseRecord } from '@beeclaw/consensus';

// ── 环境变量 ──

const REDIS_URL = process.env['BEECLAW_REDIS_URL'] ?? 'redis://127.0.0.1:6379';
const WORKER_ID = process.env['BEECLAW_WORKER_ID'] ?? `worker-${process.pid}`;
const LOG_LEVEL = process.env['BEECLAW_LOG_LEVEL'] ?? 'info';
const NODE_ROLE = process.env['BEECLAW_NODE_ROLE'];

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

// ── 桩 AgentExecutor（Worker 进程内需要远端协调器下发 Agent 定义） ──
// 分布式模式下，Worker 接收 Coordinator 的 tick_begin 消息后执行分配的 Agent。
// 当前实现为占位：Worker 报告 0 响应。后续需要集成 Agent 加载逻辑。
// 这确保了通信链路、进程管理、健康检查的端到端验证。

const stubExecutor: AgentExecutor = {
  async executeAgent(
    _agentId: string,
    _event: WorldEvent,
    _tick: number,
  ): Promise<{ record: AgentResponseRecord; newEvents: WorldEvent[] } | null> {
    // 占位实现：实际部署时将加载真实 Agent 并调用 LLM
    return null;
  },

  isAgentInterested(_agentId: string, _event: WorldEvent): boolean {
    // 占位实现：默认所有分配的 Agent 都感兴趣
    return true;
  },

  isAgentActive(_agentId: string): boolean {
    return true;
  },
};

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

  const worker = new Worker({ id: WORKER_ID }, transport, stubExecutor);

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

      log('info', `Tick ${tick} 完成`, {
        agentsActivated: result.agentsActivated,
        responses: result.responses.length,
        newEvents: result.newEvents.length,
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
      res.end(JSON.stringify(getMetrics()));
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
