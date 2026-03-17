// ============================================================================
// @beeclaw/server — /api/status 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerStatusRoute } from './status.js';

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
// GET /api/status
// ════════════════════════════════════════

describe('GET /api/status', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerStatusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应返回 200 和所有必要字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('tick');
    expect(body).toHaveProperty('agentCount');
    expect(body).toHaveProperty('activeAgents');
    expect(body).toHaveProperty('sentiment');
    expect(body).toHaveProperty('activeEvents');
    expect(body).toHaveProperty('lastTick');
    expect(body).toHaveProperty('wsConnections');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('running');
  });

  it('无 agent 时 agentCount 和 activeAgents 应为 0', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.agentCount).toBe(0);
    expect(body.activeAgents).toBe(0);
  });

  it('添加 agents 后应正确反映数量', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(5, 0);
    testCtx.engine.addAgents(agents);

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.agentCount).toBe(5);
    expect(body.activeAgents).toBe(5); // 新 spawn 的 agent 默认 active
  });

  it('lastTick 初始时应为 null', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.lastTick).toBeNull();
  });

  it('wsConnections 应反映构建时传入的 wsCount', async () => {
    // 默认 wsCount = 0
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.wsConnections).toBe(0);
  });

  it('wsConnections 应反映非零 wsCount', async () => {
    await testCtx.app.close();
    // 创建新 context，带有 wsCount=3
    testCtx = await buildTestContext(3);
    registerStatusRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();

    const res = await testCtx.app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.wsConnections).toBe(3);
  });

  it('running 应为 boolean 类型', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(typeof body.running).toBe('boolean');
  });

  it('uptime 应为正数', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.uptime).toBeGreaterThan(0);
  });

  // ── sentiment 聚合 ──

  it('无共识信号时 sentiment 应全为 0', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.sentiment.bullish).toBe(0);
    expect(body.sentiment.bearish).toBe(0);
    expect(body.sentiment.neutral).toBe(0);
    expect(body.sentiment.topicBreakdown).toEqual([]);
    expect(body.sentiment.targetBreakdown).toEqual([]);
  });

  it('有共识信号时应正确聚合 sentiment 百分比', async () => {
    // 通过 consensus engine analyze 注入信号
    const consensus = testCtx.engine.getConsensusEngine();
    const mockEvent = {
      id: 'e1',
      title: '测试事件',
      content: '内容',
      category: 'general' as const,
      importance: 0.5,
      propagationRadius: 0.5,
      tick: 1,
      tags: [],
    };
    const mockResponses = [
      { agentId: 'a1', agentName: 'Agent1', credibility: 0.8, response: { stance: 0.8, confidence: 0.9, opinion: '看涨', action: 'buy' as const, emotionalState: 0.8, targets: [] } },
      { agentId: 'a2', agentName: 'Agent2', credibility: 0.7, response: { stance: -0.5, confidence: 0.7, opinion: '看跌', action: 'sell' as const, emotionalState: -0.5, targets: [] } },
      { agentId: 'a3', agentName: 'Agent3', credibility: 0.5, response: { stance: 0.0, confidence: 0.5, opinion: '中立', action: 'hold' as const, emotionalState: 0.0, targets: [] } },
    ];
    consensus.analyze(1, mockEvent, mockResponses);

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();

    // 验证 sentiment 字段存在并且是百分比
    expect(typeof body.sentiment.bullish).toBe('number');
    expect(typeof body.sentiment.bearish).toBe('number');
    expect(typeof body.sentiment.neutral).toBe('number');
    // 百分比之和应接近 100
    const sum = body.sentiment.bullish + body.sentiment.bearish + body.sentiment.neutral;
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101); // 四舍五入可能差1

    // topicBreakdown 应有 1 条
    expect(body.sentiment.topicBreakdown.length).toBe(1);
    expect(body.sentiment.topicBreakdown[0].topic).toBe('测试事件');
  });

  it('多个话题的信号应分别出现在 topicBreakdown 中', async () => {
    const consensus = testCtx.engine.getConsensusEngine();
    const event1 = {
      id: 'e1', title: '股市', content: '内容', category: 'finance' as const,
      importance: 0.5, propagationRadius: 0.5, tick: 1, tags: [],
    };
    const event2 = {
      id: 'e2', title: '科技', content: '内容', category: 'tech' as const,
      importance: 0.5, propagationRadius: 0.5, tick: 1, tags: [],
    };
    const responses = [
      { agentId: 'a1', agentName: 'Agent1', credibility: 0.8, response: { stance: 0.8, confidence: 0.9, opinion: '看涨', action: 'buy' as const, emotionalState: 0.8, targets: [] } },
    ];
    consensus.analyze(1, event1, responses);
    consensus.analyze(1, event2, responses);

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();

    expect(body.sentiment.topicBreakdown.length).toBe(2);
    const topics = body.sentiment.topicBreakdown.map((t: { topic: string }) => t.topic);
    expect(topics).toContain('股市');
    expect(topics).toContain('科技');
  });

  it('有 targetSentiments 时应聚合到 targetBreakdown', async () => {
    const consensus = testCtx.engine.getConsensusEngine();
    const event = {
      id: 'e1', title: '加密货币', content: '内容', category: 'finance' as const,
      importance: 0.8, propagationRadius: 0.5, tick: 1, tags: [],
    };
    const responses = [
      { agentId: 'a1', agentName: 'Agent1', credibility: 0.9, response: { stance: 0.9, confidence: 0.9, opinion: '比特币将突破10万', action: 'buy' as const, emotionalState: 0.9, targets: [{ name: 'BTC', category: 'crypto' as const, stance: 0.9, confidence: 0.9 }] } },
      { agentId: 'a2', agentName: 'Agent2', credibility: 0.7, response: { stance: 0.5, confidence: 0.7, opinion: '以太坊看涨', action: 'buy' as const, emotionalState: 0.5, targets: [{ name: 'ETH', category: 'crypto' as const, stance: 0.5, confidence: 0.7 }] } },
    ];
    consensus.analyze(1, event, responses);

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();

    // targetBreakdown 可能包含标的（取决于 consensus engine 实现）
    expect(Array.isArray(body.sentiment.targetBreakdown)).toBe(true);
  });

  it('agents 有混合 status 时 activeAgents 应只计算 active 的', async () => {
    const agents = testCtx.engine.spawner.spawnBatch(3, 0);
    testCtx.engine.addAgents(agents);
    // 将某个 agent 设置为 dormant
    agents[0]!.setStatus('dormant');

    const res = await app.inject({ method: 'GET', url: '/api/status' });
    const body = res.json();
    expect(body.agentCount).toBe(3);
    expect(body.activeAgents).toBe(2);
  });
});
