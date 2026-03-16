// ============================================================================
// @beeclaw/server — /metrics/prometheus 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerPrometheusRoute } from './prometheus.js';

// ── 共享 setup ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(0);
});

afterEach(async () => {
  await testCtx.app.close();
});

// ════════════════════════════════════════
// GET /metrics/prometheus
// ════════════════════════════════════════

describe('GET /metrics/prometheus', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerPrometheusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.statusCode).toBe(200);
  });

  it('Content-Type 应为 text/plain', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('响应体应为字符串格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(typeof res.payload).toBe('string');
  });

  // ── 指标格式验证 ──

  it('应包含 beeclaw_uptime_seconds 指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('# HELP beeclaw_uptime_seconds');
    expect(res.payload).toContain('# TYPE beeclaw_uptime_seconds gauge');
    expect(res.payload).toMatch(/beeclaw_uptime_seconds \d/);
  });

  it('应包含 beeclaw_current_tick 指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_current_tick');
  });

  it('应包含 beeclaw_agents_total 指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_agents_total 0');
  });

  it('添加 agents 后指标应更新', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(5, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_agents_total 5');
    expect(res.payload).toContain('beeclaw_agents_active 5');
  });

  it('应包含 beeclaw_agents_by_status 多维标签', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_agents_by_status{status="active"}');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="dormant"}');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="dead"}');
  });

  it('应包含事件处理指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_events_active');
    expect(res.payload).toContain('beeclaw_events_processed_total');
    expect(res.payload).toContain('beeclaw_responses_collected_total');
  });

  it('应包含 LLM 调用指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_llm_calls_total');
    expect(res.payload).toContain('beeclaw_llm_calls_succeeded');
    expect(res.payload).toContain('beeclaw_llm_calls_failed');
    expect(res.payload).toContain('beeclaw_llm_avg_duration_ms');
  });

  it('应包含缓存指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_cache_hits_total');
    expect(res.payload).toContain('beeclaw_cache_misses_total');
    expect(res.payload).toContain('beeclaw_cache_hit_rate');
  });

  it('应包含内存指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_memory_rss_bytes');
    expect(res.payload).toContain('beeclaw_memory_heap_used_bytes');
    expect(res.payload).toContain('beeclaw_memory_heap_total_bytes');
  });

  it('应包含 WebSocket 连接数指标', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_ws_connections 0');
  });

  it('所有 # TYPE 行应包含有效的类型 (gauge 或 counter)', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    const typeLines = res.payload.split('\n').filter((line: string) => line.startsWith('# TYPE'));
    expect(typeLines.length).toBeGreaterThan(0);
    for (const line of typeLines) {
      expect(line).toMatch(/# TYPE \S+ (gauge|counter)/);
    }
  });
});
