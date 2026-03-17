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

  // ── 覆盖率补充：不同 Agent 状态分支 ──

  it('Agent 有 dormant 状态时应正确统计', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);
    agents[0]!.setStatus('dormant');

    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_agents_total 3');
    expect(res.payload).toContain('beeclaw_agents_active 2');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="active"} 2');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="dormant"} 1');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="dead"} 0');
  });

  it('Agent 有 dead 状态时应正确统计', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(4, 0);
    testCtx.engine.addAgents(agents);
    agents[0]!.setStatus('dormant');
    agents[1]!.setStatus('dead');

    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_agents_total 4');
    expect(res.payload).toContain('beeclaw_agents_active 2');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="active"} 2');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="dormant"} 1');
    expect(res.payload).toContain('beeclaw_agents_by_status{status="dead"} 1');
  });

  // ── 覆盖率补充：tick 历史分支 ──

  it('有 tick 历史时应正确计算平均 tick 耗时', async () => {
    // 执行几个 step 产生 tick 历史
    const agents = testCtx.engine.spawner.spawnBatch(2, 0);
    testCtx.engine.addAgents(agents);
    await testCtx.engine.step();
    await testCtx.engine.step();
    await testCtx.engine.step();

    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_tick_avg_duration_ms');
    // 有 tick 历史后，事件处理总量和响应总量相关指标也应有值
    expect(res.payload).toContain('beeclaw_events_processed_total');
    expect(res.payload).toContain('beeclaw_responses_collected_total');
  });

  it('有事件处理后 events_processed_total 和 responses_collected_total 应递增', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(5, 0);
    testCtx.engine.addAgents(agents);

    testCtx.engine.injectEvent({
      title: 'Prometheus测试事件',
      content: '内容',
      importance: 0.9,
      propagationRadius: 0.8,
    });

    await testCtx.engine.step();

    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    // events_processed_total 至少为 1
    const eventsMatch = res.payload.match(/beeclaw_events_processed_total (\d+)/);
    expect(eventsMatch).not.toBeNull();
    expect(parseInt(eventsMatch![1]!)).toBeGreaterThanOrEqual(1);
  });

  it('有共识信号时 consensus_signals_latest 应大于 0', async () => {
    const consensus = testCtx.engine.getConsensusEngine();
    const event = {
      id: 'prom-e1', title: 'Prometheus信号事件', content: '内容', category: 'general' as const,
      importance: 0.5, propagationRadius: 0.5, tick: 1, tags: [],
    };
    const responses = [
      { agentId: 'a1', agentName: 'Agent1', credibility: 0.8, response: { stance: 0.8, confidence: 0.9, opinion: '看涨', action: 'buy' as const, emotionalState: 0.8, targets: [] } },
    ];
    consensus.analyze(1, event, responses);

    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    const signalsMatch = res.payload.match(/beeclaw_consensus_signals_latest (\d+)/);
    expect(signalsMatch).not.toBeNull();
    expect(parseInt(signalsMatch![1]!)).toBeGreaterThanOrEqual(1);
  });

  it('非零 wsCount 时 ws_connections 应正确反映', async () => {
    await testCtx.app.close();
    testCtx = await buildTestContext(5);
    registerPrometheusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();

    const res = await testCtx.app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_ws_connections 5');
  });

  it('current_tick 应随 step 递增', async () => {
    await testCtx.engine.step();
    await testCtx.engine.step();

    const res = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    expect(res.payload).toContain('beeclaw_current_tick 2');
  });
});
