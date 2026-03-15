// ============================================================================
// BeeClaw Server — API: /metrics/prometheus
// Prometheus 兼容的 text exposition format 指标端点
// ============================================================================

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ServerContext } from '../index.js';
import { prometheusSchema } from './schemas.js';

/**
 * 生成 Prometheus text exposition format 指标
 */
function buildPrometheusMetrics(ctx: ServerContext): string {
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

  // 从所有 tick 历史中聚合总事件和响应
  let allTimeEvents = 0;
  let allTimeResponses = 0;
  for (const tick of tickHistory) {
    allTimeEvents += tick.eventsProcessed;
    allTimeResponses += tick.responsesCollected;
  }

  // 最近 tick 平均耗时
  const recentTicks = tickHistory.slice(-50);
  let totalDuration = 0;
  for (const tick of recentTicks) {
    totalDuration += tick.durationMs;
  }
  const avgTickDurationMs = recentTicks.length > 0
    ? totalDuration / recentTicks.length
    : 0;

  const batchStats = perfStats.batchInference;
  const cacheStats = perfStats.cache;

  const lines: string[] = [];

  // ── 服务器基础指标 ──
  lines.push('# HELP beeclaw_uptime_seconds Server uptime in seconds');
  lines.push('# TYPE beeclaw_uptime_seconds gauge');
  lines.push(`beeclaw_uptime_seconds ${uptime.toFixed(1)}`);

  // ── 引擎指标 ──
  lines.push('# HELP beeclaw_current_tick Current world engine tick');
  lines.push('# TYPE beeclaw_current_tick gauge');
  lines.push(`beeclaw_current_tick ${engine.getCurrentTick()}`);

  // ── Agent 指标 ──
  lines.push('# HELP beeclaw_agents_total Total number of agents');
  lines.push('# TYPE beeclaw_agents_total gauge');
  lines.push(`beeclaw_agents_total ${agents.length}`);

  lines.push('# HELP beeclaw_agents_active Number of active agents');
  lines.push('# TYPE beeclaw_agents_active gauge');
  lines.push(`beeclaw_agents_active ${activeAgents}`);

  lines.push('# HELP beeclaw_agents_by_status Agent count by status');
  lines.push('# TYPE beeclaw_agents_by_status gauge');
  lines.push(`beeclaw_agents_by_status{status="active"} ${activeAgents}`);
  lines.push(`beeclaw_agents_by_status{status="dormant"} ${dormantAgents}`);
  lines.push(`beeclaw_agents_by_status{status="dead"} ${deadAgents}`);

  // ── 事件指标 ──
  lines.push('# HELP beeclaw_events_active Current active events');
  lines.push('# TYPE beeclaw_events_active gauge');
  lines.push(`beeclaw_events_active ${state.activeEvents.length}`);

  lines.push('# HELP beeclaw_events_processed_total Total events processed');
  lines.push('# TYPE beeclaw_events_processed_total counter');
  lines.push(`beeclaw_events_processed_total ${allTimeEvents}`);

  lines.push('# HELP beeclaw_responses_collected_total Total responses collected');
  lines.push('# TYPE beeclaw_responses_collected_total counter');
  lines.push(`beeclaw_responses_collected_total ${allTimeResponses}`);

  // ── LLM 调用指标 ──
  lines.push('# HELP beeclaw_llm_calls_total Total LLM API calls');
  lines.push('# TYPE beeclaw_llm_calls_total counter');
  lines.push(`beeclaw_llm_calls_total ${batchStats.totalRequests}`);

  lines.push('# HELP beeclaw_llm_calls_succeeded Total successful LLM calls');
  lines.push('# TYPE beeclaw_llm_calls_succeeded counter');
  lines.push(`beeclaw_llm_calls_succeeded ${batchStats.succeeded}`);

  lines.push('# HELP beeclaw_llm_calls_failed Total failed LLM calls');
  lines.push('# TYPE beeclaw_llm_calls_failed counter');
  lines.push(`beeclaw_llm_calls_failed ${batchStats.failed}`);

  lines.push('# HELP beeclaw_llm_avg_duration_ms Average LLM call duration in milliseconds');
  lines.push('# TYPE beeclaw_llm_avg_duration_ms gauge');
  lines.push(`beeclaw_llm_avg_duration_ms ${Math.round(batchStats.avgDurationMs)}`);

  // ── 缓存指标 ──
  lines.push('# HELP beeclaw_cache_hits_total Total cache hits');
  lines.push('# TYPE beeclaw_cache_hits_total counter');
  lines.push(`beeclaw_cache_hits_total ${cacheStats.hits}`);

  lines.push('# HELP beeclaw_cache_misses_total Total cache misses');
  lines.push('# TYPE beeclaw_cache_misses_total counter');
  lines.push(`beeclaw_cache_misses_total ${cacheStats.misses}`);

  lines.push('# HELP beeclaw_cache_hit_rate Cache hit rate (0-1)');
  lines.push('# TYPE beeclaw_cache_hit_rate gauge');
  lines.push(`beeclaw_cache_hit_rate ${cacheStats.hitRate.toFixed(4)}`);

  // ── Tick 响应时间 ──
  lines.push('# HELP beeclaw_tick_avg_duration_ms Average tick duration in milliseconds');
  lines.push('# TYPE beeclaw_tick_avg_duration_ms gauge');
  lines.push(`beeclaw_tick_avg_duration_ms ${Math.round(avgTickDurationMs)}`);

  // ── 共识信号 ──
  lines.push('# HELP beeclaw_consensus_signals_latest Number of latest consensus signals');
  lines.push('# TYPE beeclaw_consensus_signals_latest gauge');
  lines.push(`beeclaw_consensus_signals_latest ${latestSignals.length}`);

  // ── WebSocket 连接 ──
  lines.push('# HELP beeclaw_ws_connections Current WebSocket connections');
  lines.push('# TYPE beeclaw_ws_connections gauge');
  lines.push(`beeclaw_ws_connections ${ctx.getWsCount()}`);

  // ── Node.js 内存指标 ──
  lines.push('# HELP beeclaw_memory_rss_bytes Resident set size in bytes');
  lines.push('# TYPE beeclaw_memory_rss_bytes gauge');
  lines.push(`beeclaw_memory_rss_bytes ${mem.rss}`);

  lines.push('# HELP beeclaw_memory_heap_used_bytes Heap used in bytes');
  lines.push('# TYPE beeclaw_memory_heap_used_bytes gauge');
  lines.push(`beeclaw_memory_heap_used_bytes ${mem.heapUsed}`);

  lines.push('# HELP beeclaw_memory_heap_total_bytes Total heap size in bytes');
  lines.push('# TYPE beeclaw_memory_heap_total_bytes gauge');
  lines.push(`beeclaw_memory_heap_total_bytes ${mem.heapTotal}`);

  lines.push('');
  return lines.join('\n');
}

/**
 * 注册 GET /metrics/prometheus — Prometheus text exposition format
 */
export function registerPrometheusRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/metrics/prometheus', { schema: prometheusSchema }, async (_request, reply: FastifyReply) => {
    const body = buildPrometheusMetrics(ctx);
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(body);
  });
}
