// ============================================================================
// @beeclaw/world-engine index 再导出验证测试
// 确保公共 API 完整导出
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  WorldEngine,
  WorldStateManager,
  TickScheduler,
  NaturalSelection,
  ScenarioRunner,
  AgentActivationPool,
} from './index.js';

describe('@beeclaw/world-engine index 导出', () => {
  it('WorldEngine 类应正确导出', () => {
    expect(WorldEngine).toBeDefined();
    expect(typeof WorldEngine).toBe('function');
  });

  it('WorldStateManager 类应正确导出', () => {
    expect(WorldStateManager).toBeDefined();
    const wsm = new WorldStateManager();
    expect(wsm.getCurrentTick()).toBe(0);
  });

  it('TickScheduler 类应正确导出', () => {
    expect(TickScheduler).toBeDefined();
    const ts = new TickScheduler({ tickIntervalMs: 1000 });
    expect(ts.getCurrentTick()).toBe(0);
    expect(ts.isRunning()).toBe(false);
  });

  it('NaturalSelection 类应正确导出', () => {
    expect(NaturalSelection).toBeDefined();
    const ns = new NaturalSelection();
    expect(ns.getConfig().checkIntervalTicks).toBe(100);
  });

  it('ScenarioRunner 类应正确导出', () => {
    expect(ScenarioRunner).toBeDefined();
    const sr = new ScenarioRunner();
    expect(sr.getStatus()).toBe('idle');
  });

  it('AgentActivationPool 类应正确导出', () => {
    expect(AgentActivationPool).toBeDefined();
    const pool = new AgentActivationPool();
    expect(pool.getConfig().enabled).toBe(true);
  });
});
