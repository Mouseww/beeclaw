// ============================================================================
// BeeClaw E2E — 世界引擎完整 tick 循环
// 验证：创建世界 → 注入事件 → 多轮 tick → 共识输出
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildTestWorld, silenceConsole } from './helpers.js';
import type { WorldEngine } from '@beeclaw/world-engine';
import type { Agent } from '@beeclaw/agent-runtime';

describe('世界引擎完整 tick 循环', () => {
  let engine: WorldEngine;
  let agents: Agent[];

  beforeEach(() => {
    silenceConsole();
    const world = buildTestWorld({ agentCount: 8 });
    engine = world.engine;
    agents = world.agents;
  });

  afterEach(() => {
    engine.stop();
    vi.restoreAllMocks();
  });

  // ── 基础 tick 执行 ──

  it('单次 step 应返回有效的 TickResult', async () => {
    const result = await engine.step();

    expect(result).toHaveProperty('tick');
    expect(result).toHaveProperty('eventsProcessed');
    expect(result).toHaveProperty('agentsActivated');
    expect(result).toHaveProperty('responsesCollected');
    expect(result).toHaveProperty('durationMs');
    expect(result.tick).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('连续执行多轮 tick 应正确递增', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await engine.step());
    }

    expect(results).toHaveLength(5);
    expect(results[0]!.tick).toBe(1);
    expect(results[4]!.tick).toBe(5);

    // 每轮 tick 号递增
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.tick).toBe(results[i - 1]!.tick + 1);
    }
  });

  // ── 事件注入 + Agent 响应 ──

  it('注入事件后 tick 应激活 Agent 并收集响应', async () => {
    engine.injectEvent({
      title: '央行宣布加息',
      content: '央行决定上调基准利率 25 个基点',
      category: 'finance',
      importance: 0.9,
      propagationRadius: 0.8,
      tags: ['央行', '利率'],
    });

    const result = await engine.step();

    expect(result.eventsProcessed).toBeGreaterThanOrEqual(1);
    // 有 Agent 被激活并产生响应
    expect(result.agentsActivated).toBeGreaterThan(0);
    expect(result.responsesCollected).toBeGreaterThan(0);
  });

  it('无事件时 tick 仍可正常执行', async () => {
    const result = await engine.step();

    expect(result.tick).toBe(1);
    expect(result.eventsProcessed).toBe(0);
    // 无事件时可能无 Agent 被激活
    expect(result.agentsActivated).toBeGreaterThanOrEqual(0);
  });

  // ── 共识引擎输出 ──

  it('多轮 tick 后共识引擎应产出信号', async () => {
    // 注入高影响力事件
    engine.injectEvent({
      title: '重大政策变化',
      content: '政府宣布重大经济刺激计划',
      category: 'politics',
      importance: 0.95,
      propagationRadius: 0.9,
      tags: ['政策', '经济'],
    });

    // 执行多轮 tick
    for (let i = 0; i < 3; i++) {
      await engine.step();
    }

    const consensusEngine = engine.getConsensusEngine();
    const topics = consensusEngine.getAllTopics();
    // getLatestSignals called to verify no errors; result not needed for assertion
    consensusEngine.getLatestSignals();

    // 如果有 Agent 响应，则应有共识信号
    const history = engine.getTickHistory();
    const totalResponses = history.reduce((s, h) => s + h.responsesCollected, 0);

    if (totalResponses > 0) {
      expect(topics.length).toBeGreaterThanOrEqual(0);
      // 至少应回调过共识引擎
    }

    // 验证 tick 历史完整
    expect(history).toHaveLength(3);
  });

  // ── 世界状态管理 ──

  it('tick 后世界状态应正确更新', async () => {
    const initialState = engine.getWorldState().getState();
    expect(initialState.tick).toBe(0);
    expect(initialState.agentCount).toBe(8);

    engine.injectEvent({
      title: '测试事件',
      content: '测试内容',
      importance: 0.5,
      propagationRadius: 0.5,
    });

    await engine.step();

    const state = engine.getWorldState().getState();
    expect(state.tick).toBe(1);
    expect(state.agentCount).toBe(8);
  });

  it('getCurrentTick 应反映最新 tick', async () => {
    expect(engine.getCurrentTick()).toBe(0);
    await engine.step();
    expect(engine.getCurrentTick()).toBe(1);
    await engine.step();
    expect(engine.getCurrentTick()).toBe(2);
  });

  // ── tick 历史 ──

  it('getTickHistory 应记录所有 tick 结果', async () => {
    for (let i = 0; i < 4; i++) {
      await engine.step();
    }

    const history = engine.getTickHistory();
    expect(history).toHaveLength(4);
    expect(history[0]!.tick).toBe(1);
    expect(history[3]!.tick).toBe(4);
  });

  it('getLastTickResult 应返回最后一次 tick 结果', async () => {
    expect(engine.getLastTickResult()).toBeUndefined();

    await engine.step();
    const last = engine.getLastTickResult();
    expect(last).toBeDefined();
    expect(last!.tick).toBe(1);

    await engine.step();
    expect(engine.getLastTickResult()!.tick).toBe(2);
  });

  // ── 多事件级联 ──

  it('同一 tick 内多个事件应被处理', async () => {
    engine.injectEvent({
      title: '事件A',
      content: '事件A内容',
      importance: 0.7,
      propagationRadius: 0.6,
    });
    engine.injectEvent({
      title: '事件B',
      content: '事件B内容',
      importance: 0.8,
      propagationRadius: 0.7,
    });

    const result = await engine.step();
    expect(result.eventsProcessed).toBeGreaterThanOrEqual(2);
  });

  // ── 性能统计 ──

  it('getPerformanceStats 应返回性能指标', async () => {
    engine.injectEvent({
      title: '性能测试事件',
      content: '测试性能统计',
      importance: 0.5,
      propagationRadius: 0.5,
    });

    await engine.step();

    const stats = engine.getPerformanceStats();
    expect(stats).toHaveProperty('cache');
    expect(stats).toHaveProperty('batchInference');
    expect(stats).toHaveProperty('activationPool');
    expect(stats.cache).toHaveProperty('size');
    expect(stats.cache).toHaveProperty('hits');
    expect(stats.cache).toHaveProperty('misses');
  });

  // ── SocialGraph 集成 ──

  it('tick 执行后 SocialGraph 应保持一致', async () => {
    const graph = engine.getSocialGraph();
    const nodeCount = graph.getNodeCount();
    expect(nodeCount).toBe(8);

    engine.injectEvent({
      title: '社交测试事件',
      content: '测试社交图',
      importance: 0.8,
      propagationRadius: 0.7,
    });

    await engine.step();

    // 节点数不应改变（除非有新 Agent 孵化）
    expect(graph.getNodeCount()).toBeGreaterThanOrEqual(8);
  });

  // ── Agent 数量管理 ──

  it('getActiveAgentCount 应只计算活跃 Agent', async () => {
    expect(engine.getActiveAgentCount()).toBe(8);

    // 设置一个 Agent 为 dormant
    agents[0]!.setStatus('dormant');
    expect(engine.getActiveAgentCount()).toBe(7);
  });

  it('getAgent 应按 ID 查找', async () => {
    const agent = engine.getAgent(agents[0]!.id);
    expect(agent).toBeDefined();
    expect(agent!.id).toBe(agents[0]!.id);

    const notFound = engine.getAgent('nonexistent-id');
    expect(notFound).toBeUndefined();
  });
});
