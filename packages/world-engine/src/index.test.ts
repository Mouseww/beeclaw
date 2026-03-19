// ============================================================================
// @beeclaw/world-engine index 再导出验证测试
// 确保公共 API 完整导出，并触发 index.ts 的覆盖率收集
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as indexModule from './index.js';
import type {
  WorldEngineOptions,
  TickResult,
  TickEventSummary,
  TickResponseSummary,
  TickSchedulerOptions,
  NaturalSelectionConfig,
  SelectionResult,
  SelectionRecord,
  SelectionReason,
  NaturalSelectionEvent,
  ScenarioRunnerOptions,
  ScenarioStatus,
  ScenarioSummary,
  ActivationPoolConfig,
  ActivationResult,
} from './index.js';

describe('@beeclaw/world-engine index 导出', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // ── 类导出 ──

  it('WorldEngine 类应正确导出', () => {
    expect(indexModule.WorldEngine).toBeDefined();
    expect(typeof indexModule.WorldEngine).toBe('function');
  });

  it('WorldStateManager 类应正确导出', () => {
    expect(indexModule.WorldStateManager).toBeDefined();
    const wsm = new indexModule.WorldStateManager();
    expect(wsm.getCurrentTick()).toBe(0);
  });

  it('TickScheduler 类应正确导出', () => {
    expect(indexModule.TickScheduler).toBeDefined();
    const ts = new indexModule.TickScheduler({ tickIntervalMs: 1000 });
    expect(ts.getCurrentTick()).toBe(0);
    expect(ts.isRunning()).toBe(false);
  });

  it('NaturalSelection 类应正确导出', () => {
    expect(indexModule.NaturalSelection).toBeDefined();
    const ns = new indexModule.NaturalSelection();
    expect(ns.getConfig().checkIntervalTicks).toBe(100);
  });

  it('ScenarioRunner 类应正确导出', () => {
    expect(indexModule.ScenarioRunner).toBeDefined();
    const sr = new indexModule.ScenarioRunner();
    expect(sr.getStatus()).toBe('idle');
  });

  it('AgentActivationPool 类应正确导出', () => {
    expect(indexModule.AgentActivationPool).toBeDefined();
    const pool = new indexModule.AgentActivationPool();
    expect(pool.getConfig().enabled).toBe(true);
  });

  // ── 类型导出验证（通过类型断言确保类型可用） ──

  it('WorldEngine 相关类型应可用', () => {
    const options: WorldEngineOptions = {
      config: { tickIntervalMs: 1000 },
    };
    expect(options.config.tickIntervalMs).toBe(1000);

    const tickResult: TickResult = {
      tick: 1,
      eventsProcessed: 0,
      agentsActivated: 0,
      responsesCollected: 0,
      newAgentsSpawned: 0,
      signals: 0,
      durationMs: 10,
    };
    expect(tickResult.tick).toBe(1);

    const eventSummary: TickEventSummary = {
      id: 'e1',
      title: '测试',
      category: 'general',
      importance: 0.5,
    };
    expect(eventSummary.id).toBe('e1');

    const responseSummary: TickResponseSummary = {
      agentId: 'a1',
      agentName: '测试Agent',
      opinion: '观点',
      action: 'speak',
      emotionalState: 0.3,
    };
    expect(responseSummary.agentId).toBe('a1');
  });

  it('TickScheduler 相关类型应可用', () => {
    const options: TickSchedulerOptions = {
      tickIntervalMs: 500,
    };
    expect(options.tickIntervalMs).toBe(500);
  });

  it('NaturalSelection 相关类型应可用', () => {
    const config: Partial<NaturalSelectionConfig> = {
      checkIntervalTicks: 50,
    };
    expect(config.checkIntervalTicks).toBe(50);

    const result: SelectionResult = {
      activeCountBefore: 10,
      activeCountAfter: 8,
      newDormant: ['a1'],
      newDead: [],
      newSpawned: [],
    };
    expect(result.activeCountBefore).toBe(10);

    const record: SelectionRecord = {
      agentId: 'a1',
      name: '测试',
      reason: 'low_credibility',
      credibility: 0.1,
      inactiveTicks: 0,
    };
    expect(record.agentId).toBe('a1');

    const reason: SelectionReason = 'inactivity';
    expect(reason).toBe('inactivity');

    const event: NaturalSelectionEvent = {
      id: 'e1',
      type: 'system',
      category: 'general',
      title: '自然选择',
      content: '内容',
      source: 'NaturalSelection',
      importance: 0.5,
      propagationRadius: 0,
      tick: 1,
      tags: [],
    };
    expect(event.source).toBe('NaturalSelection');
  });

  it('ScenarioRunner 相关类型应可用', () => {
    const options: ScenarioRunnerOptions = {};
    expect(options).toBeDefined();

    const status: ScenarioStatus = 'idle';
    expect(status).toBe('idle');

    const summary: ScenarioSummary = {
      scenarioName: '测试场景',
      ticksCompleted: 10,
      totalEventsProcessed: 5,
      totalResponsesCollected: 20,
      totalSignals: 3,
      totalAgentsCreated: 10,
      eventSources: ['手动'],
      duration: '10s',
    };
    expect(summary.scenarioName).toBe('测试场景');
  });

  it('AgentActivationPool 相关类型应可用', () => {
    const config: Partial<ActivationPoolConfig> = {
      enabled: true,
      maxActivatedAgents: 100,
    };
    expect(config.enabled).toBe(true);

    const result: ActivationResult = {
      activatedIds: ['a1', 'a2'],
      filteredCount: 3,
      distances: new Map([['a1', 0], ['a2', 1]]),
    };
    expect(result.activatedIds).toHaveLength(2);
    expect(result.distances.get('a1')).toBe(0);
  });

  // ── 完整性测试 ──

  it('模块应导出所有预期的类', () => {
    const expectedExports = [
      'WorldEngine',
      'WorldStateManager',
      'TickScheduler',
      'NaturalSelection',
      'ScenarioRunner',
      'AgentActivationPool',
    ];

    for (const exportName of expectedExports) {
      expect(indexModule).toHaveProperty(exportName);
      expect(typeof (indexModule as Record<string, unknown>)[exportName]).toBe('function');
    }
  });
});
