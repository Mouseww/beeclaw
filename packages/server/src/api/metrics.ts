// ============================================================================
// BeeClaw Server — API: /metrics
// 返回 JSON 格式的运行时指标
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { metricsSchema } from './schemas.js';

/**
 * 运行时指标结构
 */
export interface RuntimeMetrics {
  /** 服务器信息 */
  server: {
    uptime: number;
    uptimeFormatted: string;
    nodeVersion: string;
    pid: number;
  };
  /** 世界引擎指标 */
  engine: {
    currentTick: number;
    running: boolean;
    totalAgents: number;
    activeAgents: number;
    dormantAgents: number;
    deadAgents: number;
  };
  /** 性能指标 */
  performance: {
    cache: {
      size: number;
      hits: number;
      misses: number;
      hitRate: number;
      evictions: number;
    };
    batchInference: {
      totalRequests: number;
      succeeded: number;
      failed: number;
      totalRetries: number;
      avgDurationMs: number;
    };
    activationPool: {
      totalActivations: number;
      totalFiltered: number;
      totalAgentsActivated: number;
      avgActivated: number;
      avgFiltered: number;
    };
  };
  /** 事件指标 */
  events: {
    activeEvents: number;
    totalEventsProcessed: number;
    totalResponsesCollected: number;
  };
  /** LLM 调用指标（聚合自 batchInference） */
  llm: {
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number;
  };
  /** 共识引擎指标 */
  consensus: {
    totalSignals: number;
    latestSignalCount: number;
    topics: string[];
  };
  /** 内存使用 */
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    rssMB: string;
    heapUsedMB: string;
  };
  /** WebSocket 连接数 */
  wsConnections: number;
  /** 最近 tick 的统计 */
  recentTicks: {
    count: number;
    avgDurationMs: number;
    avgEventsPerTick: number;
    avgResponsesPerTick: number;
  };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export function registerMetricsRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/metrics', { schema: metricsSchema }, async () => {
    const engine = ctx.engine;
    const agents = engine.getAgents();
    const state = engine.getWorldState().getState();
    const perfStats = engine.getPerformanceStats();
    const tickHistory = engine.getTickHistory();
    const consensusEngine = engine.getConsensusEngine();
    const latestSignals = consensusEngine.getLatestSignals();
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    // Agent 状态统计
    let activeAgents = 0;
    let dormantAgents = 0;
    let deadAgents = 0;
    for (const agent of agents) {
      if (agent.status === 'active') activeAgents++;
      else if (agent.status === 'dormant') dormantAgents++;
      else if (agent.status === 'dead') deadAgents++;
    }

    // 聚合 tick 历史
    const recentTicks = tickHistory.slice(-50);
    let totalDuration = 0;
    let totalEvents = 0;
    let totalResponses = 0;
    let totalSignalsFromHistory = 0;
    for (const tick of recentTicks) {
      totalDuration += tick.durationMs;
      totalEvents += tick.eventsProcessed;
      totalResponses += tick.responsesCollected;
      totalSignalsFromHistory += tick.signals;
    }

    // 从所有 tick 历史中聚合总事件和响应
    let allTimeEvents = 0;
    let allTimeResponses = 0;
    for (const tick of tickHistory) {
      allTimeEvents += tick.eventsProcessed;
      allTimeResponses += tick.responsesCollected;
    }

    const batchStats = perfStats.batchInference;
    const cacheStats = perfStats.cache;
    const poolStats = perfStats.activationPool;

    const metrics: RuntimeMetrics = {
      server: {
        uptime,
        uptimeFormatted: formatUptime(uptime),
        nodeVersion: process.version,
        pid: process.pid,
      },
      engine: {
        currentTick: engine.getCurrentTick(),
        running: engine.isRunning(),
        totalAgents: agents.length,
        activeAgents,
        dormantAgents,
        deadAgents,
      },
      performance: {
        cache: cacheStats,
        batchInference: {
          totalRequests: batchStats.totalRequests,
          succeeded: batchStats.succeeded,
          failed: batchStats.failed,
          totalRetries: batchStats.totalRetries,
          avgDurationMs: Math.round(batchStats.avgDurationMs),
        },
        activationPool: poolStats,
      },
      events: {
        activeEvents: state.activeEvents.length,
        totalEventsProcessed: allTimeEvents,
        totalResponsesCollected: allTimeResponses,
      },
      llm: {
        totalCalls: batchStats.totalRequests,
        successRate:
          batchStats.totalRequests > 0
            ? batchStats.succeeded / batchStats.totalRequests
            : 1,
        avgLatencyMs: Math.round(batchStats.avgDurationMs),
      },
      consensus: {
        totalSignals: totalSignalsFromHistory,
        latestSignalCount: latestSignals.length,
        topics: latestSignals.map((s) => s.topic),
      },
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
        rssMB: (mem.rss / 1024 / 1024).toFixed(1),
        heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
      },
      wsConnections: ctx.getWsCount(),
      recentTicks: {
        count: recentTicks.length,
        avgDurationMs:
          recentTicks.length > 0
            ? Math.round(totalDuration / recentTicks.length)
            : 0,
        avgEventsPerTick:
          recentTicks.length > 0
            ? Math.round((totalEvents / recentTicks.length) * 100) / 100
            : 0,
        avgResponsesPerTick:
          recentTicks.length > 0
            ? Math.round((totalResponses / recentTicks.length) * 100) / 100
            : 0,
      },
    };

    return metrics;
  });
}
