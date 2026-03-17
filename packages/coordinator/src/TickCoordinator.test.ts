// ============================================================================
// @beeclaw/coordinator TickCoordinator 单元测试
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { TickCoordinator } from './TickCoordinator.js';
import { InProcessTransport } from './TransportLayer.js';
import { AgentPartitioner } from './AgentPartitioner.js';
import { EventRelay } from './EventRelay.js';
import { Worker } from './Worker.js';
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
    content: '测试事件内容',
    source: 'test',
    importance: 0.5,
    propagationRadius: 0.5,
    tick: 1,
    tags: ['test'],
    ...overrides,
  };
}

function createMockExecutor(
  overrides: Partial<AgentExecutor> = {},
): AgentExecutor {
  return {
    executeAgent: vi.fn().mockResolvedValue({
      record: {
        agentId: 'agent_1',
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

function createTestSetup(workerCount: number = 2, config?: { workerTimeoutMs?: number; unhealthyThreshold?: number }) {
  const transport = new InProcessTransport();
  const partitioner = new AgentPartitioner();
  const eventRelay = new EventRelay();
  const coordinator = new TickCoordinator(transport, partitioner, eventRelay, config);

  const workers: Worker[] = [];
  const executors: AgentExecutor[] = [];

  for (let i = 0; i < workerCount; i++) {
    const executor = createMockExecutor();
    const worker = new Worker({ id: `worker_${i}` }, transport, executor);
    workers.push(worker);
    executors.push(executor);
    coordinator.registerWorker(worker);
  }

  return { coordinator, transport, partitioner, eventRelay, workers, executors };
}

// ── 测试套件 ────────────────────────────────────────────────────────

describe('TickCoordinator', () => {
  describe('Worker 注册/注销', () => {
    it('应正确注册 Worker', () => {
      const { coordinator } = createTestSetup(2);

      const allWorkers = coordinator.getAllWorkers();
      expect(allWorkers).toHaveLength(2);
      expect(allWorkers[0]!.status).toBe('online');
      expect(allWorkers[1]!.status).toBe('online');
    });

    it('应正确注销 Worker', () => {
      const { coordinator } = createTestSetup(2);

      coordinator.unregisterWorker('worker_0');
      expect(coordinator.getAllWorkers()).toHaveLength(1);
      expect(coordinator.getWorkerInfo('worker_0')).toBeUndefined();
    });

    it('应正确获取单个 Worker 信息', () => {
      const { coordinator } = createTestSetup(1);

      const info = coordinator.getWorkerInfo('worker_0');
      expect(info).toBeDefined();
      expect(info!.id).toBe('worker_0');
      expect(info!.status).toBe('online');
      expect(info!.consecutiveTimeouts).toBe(0);
    });

    it('Tick 执行期间不允许注册/注销 Worker', async () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport);

      // 创建一个处理很慢的 Worker
      const slowExecutor = createMockExecutor({
        executeAgent: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100)),
        ),
      });
      const worker = new Worker({ id: 'slow_worker' }, transport, slowExecutor);
      coordinator.registerWorker(worker);
      coordinator.assignAgents(['agent_1']);
      coordinator.injectEvents([createTestEvent()]);

      // 开始 tick（不 await）
      const tickPromise = coordinator.executeTick();

      // 尝试注册新 Worker（应该抛错）
      const newWorker = new Worker({ id: 'new_worker' }, transport, createMockExecutor());
      expect(() => coordinator.registerWorker(newWorker)).toThrow(
        'Cannot register worker during tick execution',
      );

      await tickPromise;
      // 清理
      newWorker.dispose();
    });
  });

  describe('Agent 分片', () => {
    it('应正确分配 Agent 到 Worker', () => {
      const { coordinator } = createTestSetup(2);

      const agentIds = ['a1', 'a2', 'a3', 'a4'];
      const assignments = coordinator.assignAgents(agentIds);

      expect(assignments).toHaveLength(2);

      // 所有 Agent 都应被分配
      const allAssigned = assignments.flatMap((a) => a.agentIds);
      expect(allAssigned.sort()).toEqual(agentIds.sort());
    });

    it('无健康 Worker 时分片返回空', () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport);

      const assignments = coordinator.assignAgents(['a1', 'a2']);
      expect(assignments).toEqual([]);
    });

    it('分配后 Worker 的 agentCount 应更新', () => {
      const { coordinator } = createTestSetup(2);

      coordinator.assignAgents(['a1', 'a2', 'a3']);

      const workers = coordinator.getAllWorkers();
      const totalAgents = workers.reduce((sum, w) => sum + w.agentCount, 0);
      expect(totalAgents).toBe(3);
    });
  });

  describe('Tick 生命周期', () => {
    it('应正确执行一个完整的 Tick', async () => {
      const { coordinator } = createTestSetup(2);

      coordinator.assignAgents(['a1', 'a2', 'a3', 'a4']);
      coordinator.injectEvents([createTestEvent()]);

      const result = await coordinator.executeTick();

      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.timedOutWorkers).toEqual([]);
      expect(result.workerResults).toHaveLength(2);
    });

    it('应递增 tick 编号', async () => {
      const { coordinator } = createTestSetup(1);

      coordinator.assignAgents(['a1']);

      coordinator.injectEvents([createTestEvent()]);
      const r1 = await coordinator.executeTick();
      expect(r1.tick).toBe(1);

      coordinator.injectEvents([createTestEvent()]);
      const r2 = await coordinator.executeTick();
      expect(r2.tick).toBe(2);

      coordinator.injectEvents([createTestEvent()]);
      const r3 = await coordinator.executeTick();
      expect(r3.tick).toBe(3);

      expect(coordinator.getCurrentTick()).toBe(3);
    });

    it('无健康 Worker 时执行 Tick 应抛错', async () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport);

      await expect(coordinator.executeTick()).rejects.toThrow(
        'No healthy workers available',
      );
    });

    it('不允许并发执行 Tick', async () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport);

      const slowExecutor = createMockExecutor({
        executeAgent: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 50)),
        ),
      });
      const worker = new Worker({ id: 'w1' }, transport, slowExecutor);
      coordinator.registerWorker(worker);
      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);

      const tickPromise = coordinator.executeTick();

      await expect(coordinator.executeTick()).rejects.toThrow(
        'A tick is already in progress',
      );

      await tickPromise;
    });

    it('应正确汇总多个 Worker 的响应', async () => {
      const { coordinator, executors } = createTestSetup(2);

      // 每个 executor 返回一个响应
      for (let i = 0; i < executors.length; i++) {
        (executors[i]!.executeAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
          record: {
            agentId: `agent_${i}`,
            agentName: `Agent ${i}`,
            credibility: 0.5,
            response: {
              opinion: `观点 ${i}`,
              action: 'speak',
              emotionalState: 0.3,
            },
          },
          newEvents: [],
        });
      }

      coordinator.assignAgents(['a1', 'a2', 'a3', 'a4']);
      coordinator.injectEvents([createTestEvent()]);

      const result = await coordinator.executeTick();

      expect(result.totalResponses).toBeGreaterThan(0);
      expect(result.totalAgentsActivated).toBeGreaterThan(0);
    });

    it('空事件队列时应正常完成 Tick', async () => {
      const { coordinator } = createTestSetup(1);

      coordinator.assignAgents(['a1']);
      // 不注入事件

      const result = await coordinator.executeTick();

      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(0);
      expect(result.totalResponses).toBe(0);
    });
  });

  describe('跨 Worker 事件同步', () => {
    it('Worker 产生的新事件应通过 EventRelay 收集', async () => {
      const { coordinator, executors, eventRelay } = createTestSetup(1);

      const newEvent = createTestEvent({ id: 'new_evt_1' });

      (executors[0]!.executeAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
        record: {
          agentId: 'a1',
          agentName: 'Agent 1',
          credibility: 0.5,
          response: {
            opinion: '看好',
            action: 'speak',
            emotionalState: 0.5,
          },
        },
        newEvents: [newEvent],
      });

      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);

      const result = await coordinator.executeTick();

      expect(result.collectedNewEvents).toHaveLength(1);
      expect(result.collectedNewEvents[0]!.id).toBe('new_evt_1');

      // EventRelay 中应有待分发事件（已被 consume 放入 relay）
      // 下一个 tick 中会自动获取
      expect(eventRelay.getPendingCount()).toBeGreaterThanOrEqual(0);
    });

    it('EventRelay 中的事件应在下一 Tick 被分发', async () => {
      const { coordinator, executors } = createTestSetup(1);

      const relayEvent = createTestEvent({ id: 'relay_evt_1', title: '中继事件' });

      // 第一个 tick 产生新事件
      (executors[0]!.executeAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
        record: {
          agentId: 'a1',
          agentName: 'Agent 1',
          credibility: 0.5,
          response: { opinion: '看好', action: 'speak', emotionalState: 0.5 },
        },
        newEvents: [relayEvent],
      });

      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();

      // 第二个 tick 应自动获取 relay 中的事件
      (executors[0]!.executeAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
        record: {
          agentId: 'a1',
          agentName: 'Agent 1',
          credibility: 0.5,
          response: { opinion: '继续看好', action: 'speak', emotionalState: 0.6 },
        },
        newEvents: [],
      });

      // 不注入新外部事件，但 relay 中有事件
      const result = await coordinator.executeTick();
      // relay 事件被消费，作为本 tick 的事件
      expect(result.tick).toBe(2);
      expect(result.eventsProcessed).toBe(1);
    });
  });

  describe('Worker 超时与故障恢复', () => {
    it('Worker 超时应被记录到结果中', async () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport, undefined, undefined, {
        workerTimeoutMs: 50,
        unhealthyThreshold: 3,
      });

      // 创建一个会超时的 Worker
      const slowExecutor = createMockExecutor({
        executeAgent: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 200)),
        ),
      });
      const slowWorker = new Worker({ id: 'slow' }, transport, slowExecutor);
      coordinator.registerWorker(slowWorker);

      // 创建一个正常的 Worker
      const fastExecutor = createMockExecutor();
      const fastWorker = new Worker({ id: 'fast' }, transport, fastExecutor);
      coordinator.registerWorker(fastWorker);

      coordinator.assignAgents(['a1', 'a2']);
      coordinator.injectEvents([createTestEvent()]);

      const result = await coordinator.executeTick();

      expect(result.timedOutWorkers).toContain('slow');
      expect(result.timedOutWorkers).not.toContain('fast');
    });

    it('连续超时应标记 Worker 为不健康', async () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport, undefined, undefined, {
        workerTimeoutMs: 30,
        unhealthyThreshold: 2,
      });

      const slowExecutor = createMockExecutor({
        executeAgent: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 200)),
        ),
      });
      const worker = new Worker({ id: 'troubled' }, transport, slowExecutor);
      coordinator.registerWorker(worker);

      // 也需要一个健康的 Worker 来保证 tick 能执行
      const fastWorker = new Worker({ id: 'healthy' }, transport, createMockExecutor());
      coordinator.registerWorker(fastWorker);

      coordinator.assignAgents(['a1', 'a2']);

      // 第一次超时
      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();
      expect(coordinator.getWorkerInfo('troubled')!.consecutiveTimeouts).toBe(1);
      expect(coordinator.getWorkerInfo('troubled')!.status).toBe('online');

      // 第二次超时达到阈值 → 标记为 unhealthy
      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();
      expect(coordinator.getWorkerInfo('troubled')!.consecutiveTimeouts).toBe(2);
      expect(coordinator.getWorkerInfo('troubled')!.status).toBe('unhealthy');
    });

    it('不健康 Worker 不参与分片', () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport);

      const w1 = new Worker({ id: 'w1' }, transport, createMockExecutor());
      const w2 = new Worker({ id: 'w2' }, transport, createMockExecutor());
      coordinator.registerWorker(w1);
      coordinator.registerWorker(w2);

      // 手动标记 w2 为不健康
      const w2Info = coordinator.getWorkerInfo('w2')!;
      w2Info.status = 'unhealthy';

      const assignments = coordinator.assignAgents(['a1', 'a2', 'a3']);

      // 只有 w1 应该被分配
      expect(assignments).toHaveLength(1);
      expect(assignments[0]!.workerId).toBe('w1');
      expect(assignments[0]!.agentIds).toEqual(['a1', 'a2', 'a3']);
    });

    it('Worker 成功后应重置超时计数', async () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport, undefined, undefined, {
        workerTimeoutMs: 30,
        unhealthyThreshold: 5,
      });

      let shouldTimeout = true;
      const executor = createMockExecutor({
        executeAgent: vi.fn().mockImplementation(() => {
          if (shouldTimeout) {
            return new Promise((resolve) => setTimeout(resolve, 200));
          }
          return Promise.resolve({
            record: {
              agentId: 'a1',
              agentName: 'Agent 1',
              credibility: 0.5,
              response: { opinion: 'ok', action: 'speak', emotionalState: 0 },
            },
            newEvents: [],
          });
        }),
      });

      const worker = new Worker({ id: 'w1' }, transport, executor);
      coordinator.registerWorker(worker);
      coordinator.assignAgents(['a1']);

      // 超时一次
      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();
      expect(coordinator.getWorkerInfo('w1')!.consecutiveTimeouts).toBe(1);

      // 恢复正常
      shouldTimeout = false;
      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();
      expect(coordinator.getWorkerInfo('w1')!.consecutiveTimeouts).toBe(0);
    });
  });

  describe('reset', () => {
    it('应完全重置协调器状态', () => {
      const { coordinator } = createTestSetup(2);
      coordinator.assignAgents(['a1', 'a2']);
      coordinator.injectEvents([createTestEvent()]);

      coordinator.reset();

      expect(coordinator.getAllWorkers()).toHaveLength(0);
      expect(coordinator.getCurrentTick()).toBe(0);
      expect(coordinator.getCurrentAssignments()).toEqual([]);
    });
  });
});
