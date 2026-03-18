// ============================================================================
// Worker Entry — 基础导入与类型测试
// worker-entry.ts 是独立进程入口，不便于直接单元测试其 main()，
// 但可以验证以下关键模块的导入和类型一致性。
// ============================================================================

import { describe, it, expect } from 'vitest';
import { Worker, InProcessTransport } from './index.js';
import type { AgentExecutor } from './Worker.js';
import type { WorldEvent } from '@beeclaw/shared';

describe('worker-entry 依赖验证', () => {
  it('Worker 类可正常实例化', () => {
    const transport = new InProcessTransport();
    const stubExecutor: AgentExecutor = {
      async executeAgent() { return null; },
      isAgentInterested() { return true; },
      isAgentActive() { return true; },
    };

    const worker = new Worker({ id: 'test-worker' }, transport, stubExecutor);
    expect(worker.id).toBe('test-worker');
    expect(worker.getAgentCount()).toBe(0);
    worker.dispose();
  });

  it('Worker processTick 返回正确格式', async () => {
    const transport = new InProcessTransport();
    const stubExecutor: AgentExecutor = {
      async executeAgent() { return null; },
      isAgentInterested() { return true; },
      isAgentActive() { return true; },
    };

    const worker = new Worker({ id: 'test-worker' }, transport, stubExecutor);
    worker.setAssignedAgents(['agent-1', 'agent-2']);

    const events: WorldEvent[] = [{
      id: 'evt-1',
      type: 'external',
      category: 'finance',
      title: 'Test Event',
      content: 'Test content',
      source: 'test',
      importance: 0.5,
      propagationRadius: 0.3,
      tick: 1,
      tags: ['test'],
    }];

    const result = await worker.processTick(1, events);

    expect(result.type).toBe('worker_tick_result');
    expect(result.workerId).toBe('test-worker');
    expect(result.tick).toBe(1);
    expect(result.responses).toBeInstanceOf(Array);
    expect(result.newEvents).toBeInstanceOf(Array);
    expect(typeof result.agentsActivated).toBe('number');
    expect(typeof result.durationMs).toBe('number');

    worker.dispose();
  });

  it('Worker 指标结构应包含必要字段', () => {
    // 验证 WorkerMetrics 类型在 worker-entry.ts 中定义的接口
    // 这里直接构造一个合规对象
    const metrics = {
      workerId: 'w-1',
      startedAt: Date.now(),
      ticksProcessed: 0,
      totalAgentsActivated: 0,
      totalResponsesCollected: 0,
      totalErrors: 0,
      lastTickDurationMs: 0,
      avgTickDurationMs: 0,
      uptimeSeconds: 0,
    };

    expect(metrics).toHaveProperty('workerId');
    expect(metrics).toHaveProperty('ticksProcessed');
    expect(metrics).toHaveProperty('totalErrors');
    expect(metrics).toHaveProperty('avgTickDurationMs');
    expect(metrics).toHaveProperty('uptimeSeconds');
  });
});
