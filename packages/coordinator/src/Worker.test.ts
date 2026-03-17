// ============================================================================
// @beeclaw/coordinator Worker 单元测试
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Worker } from './Worker.js';
import { InProcessTransport } from './TransportLayer.js';
import type { AgentExecutor } from './Worker.js';
import type { WorldEvent } from '@beeclaw/shared';
import type { AgentResponseRecord } from '@beeclaw/consensus';

// ── 测试辅助 ────────────────────────────────────────────────────────

function createTestEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    type: 'external',
    category: 'finance',
    title: '测试事件',
    content: '测试内容',
    source: 'test',
    importance: 0.5,
    propagationRadius: 0.5,
    tick: 1,
    tags: ['test'],
    ...overrides,
  };
}

function createMockExecutor(overrides: Partial<AgentExecutor> = {}): AgentExecutor {
  return {
    executeAgent: vi.fn().mockResolvedValue({
      record: {
        agentId: 'a1',
        agentName: 'Agent 1',
        credibility: 0.5,
        response: {
          opinion: '看好',
          action: 'speak' as const,
          emotionalState: 0.5,
        },
      } satisfies AgentResponseRecord,
      newEvents: [],
    }),
    isAgentInterested: vi.fn().mockReturnValue(true),
    isAgentActive: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

// ── 测试套件 ────────────────────────────────────────────────────────

describe('Worker', () => {
  let transport: InProcessTransport;

  beforeEach(() => {
    transport = new InProcessTransport();
  });

  describe('构造与初始化', () => {
    it('应正确创建 Worker 并注册到传输层', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());

      expect(worker.id).toBe('w1');
      expect(transport.getRegisteredWorkerIds()).toContain('w1');
    });

    it('应正确初始化空 Agent 列表', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());

      expect(worker.getAgentCount()).toBe(0);
      expect(worker.getAssignedAgentIds()).toEqual([]);
    });
  });

  describe('Agent 分配', () => {
    it('应正确设置分配的 Agent', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());

      worker.setAssignedAgents(['a1', 'a2', 'a3']);

      expect(worker.getAgentCount()).toBe(3);
      expect(worker.getAssignedAgentIds()).toEqual(['a1', 'a2', 'a3']);
    });

    it('重新分配应覆盖之前的', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());

      worker.setAssignedAgents(['a1', 'a2']);
      worker.setAssignedAgents(['a3']);

      expect(worker.getAgentCount()).toBe(1);
      expect(worker.getAssignedAgentIds()).toEqual(['a3']);
    });

    it('getAssignedAgentIds 应返回副本', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      worker.setAssignedAgents(['a1', 'a2']);

      const ids = worker.getAssignedAgentIds();
      ids.push('a3');

      // 修改返回值不应影响内部状态
      expect(worker.getAgentCount()).toBe(2);
    });
  });

  describe('processTick', () => {
    it('应并发执行分配的 Agent 并返回结果', async () => {
      const executor = createMockExecutor();
      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1', 'a2']);

      const event = createTestEvent();
      const result = await worker.processTick(1, [event]);

      expect(result.type).toBe('worker_tick_result');
      expect(result.workerId).toBe('w1');
      expect(result.tick).toBe(1);
      expect(result.responses).toHaveLength(2);
      expect(result.agentsActivated).toBe(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('应跳过不感兴趣的 Agent', async () => {
      const executor = createMockExecutor({
        isAgentInterested: vi.fn().mockImplementation((agentId: string) => agentId === 'a1'),
      });
      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1', 'a2']);

      const event = createTestEvent();
      const result = await worker.processTick(1, [event]);

      expect(result.agentsActivated).toBe(1);
      expect(result.responses).toHaveLength(1);
    });

    it('应跳过不活跃的 Agent', async () => {
      const executor = createMockExecutor({
        isAgentActive: vi.fn().mockImplementation((agentId: string) => agentId !== 'a2'),
      });
      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1', 'a2']);

      const result = await worker.processTick(1, [createTestEvent()]);

      expect(result.agentsActivated).toBe(1);
    });

    it('应处理 executeAgent 返回 null 的情况', async () => {
      const executor = createMockExecutor({
        executeAgent: vi.fn().mockResolvedValue(null),
      });
      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1']);

      const result = await worker.processTick(1, [createTestEvent()]);

      expect(result.responses).toHaveLength(0);
    });

    it('应收集 Agent 产生的新事件', async () => {
      const newEvent = createTestEvent({ id: 'new_evt' });
      const executor = createMockExecutor({
        executeAgent: vi.fn().mockResolvedValue({
          record: {
            agentId: 'a1',
            agentName: 'Agent 1',
            credibility: 0.5,
            response: { opinion: '看好', action: 'speak', emotionalState: 0.5 },
          },
          newEvents: [newEvent],
        }),
      });
      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1']);

      const result = await worker.processTick(1, [createTestEvent()]);

      expect(result.newEvents).toHaveLength(1);
      expect(result.newEvents[0]!.id).toBe('new_evt');
    });

    it('无事件时应返回空结果', async () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      worker.setAssignedAgents(['a1']);

      const result = await worker.processTick(1, []);

      expect(result.responses).toHaveLength(0);
      expect(result.agentsActivated).toBe(0);
    });

    it('多个事件应依次处理', async () => {
      const executor = createMockExecutor();
      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1']);

      const events = [createTestEvent(), createTestEvent()];
      const result = await worker.processTick(1, events);

      // 1 个 Agent × 2 个事件 = 2 次调用
      expect(executor.executeAgent).toHaveBeenCalledTimes(2);
      expect(result.responses).toHaveLength(2);
    });
  });

  describe('消息处理', () => {
    it('应响应 assign_agents 消息', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());

      // 通过 transport 发送消息
      transport.sendToWorker('w1', {
        type: 'assign_agents',
        agentIds: ['a1', 'a2'],
      });

      expect(worker.getAssignedAgentIds()).toEqual(['a1', 'a2']);
    });

    it('应响应 tick_begin 消息并上报结果', async () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      worker.setAssignedAgents(['a1']);

      // 设置 leader handler 来接收结果
      const received: any[] = [];
      transport.onLeaderMessage((msg) => received.push(msg));

      await transport.sendToWorker('w1', {
        type: 'tick_begin',
        tick: 1,
        events: [createTestEvent()],
        timestamp: Date.now(),
      });

      // 异步消息需要等待
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received.length).toBeGreaterThanOrEqual(1);
      const tickResult = received.find((m) => m.type === 'worker_tick_result');
      expect(tickResult).toBeDefined();
      expect(tickResult.workerId).toBe('w1');
    });

    it('执行错误时应上报 worker_error', async () => {
      const executor = createMockExecutor({
        executeAgent: vi.fn().mockRejectedValue(new Error('LLM 调用失败')),
      });
      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1']);

      const received: any[] = [];
      transport.onLeaderMessage((msg) => received.push(msg));

      await transport.sendToWorker('w1', {
        type: 'tick_begin',
        tick: 1,
        events: [createTestEvent()],
        timestamp: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const errorMsg = received.find((m) => m.type === 'worker_error');
      expect(errorMsg).toBeDefined();
      expect(errorMsg.error).toContain('LLM 调用失败');
    });
  });

  describe('sendReady', () => {
    it('应发送就绪信号到 Leader', async () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());

      const received: any[] = [];
      transport.onLeaderMessage((msg) => received.push(msg));

      await worker.sendReady();

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        type: 'worker_ready',
        workerId: 'w1',
      });
    });
  });

  describe('dispose', () => {
    it('应从传输层注销', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());

      expect(transport.getRegisteredWorkerIds()).toContain('w1');

      worker.dispose();

      expect(transport.getRegisteredWorkerIds()).not.toContain('w1');
    });
  });
});
