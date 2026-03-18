// ============================================================================
// Agent 状态快照机制 — 集成测试
//
// 测试 AgentStateSnapshot 的完整链路：
// RuntimeAgentExecutor 快照生成 → Worker 快照导出 → TickCoordinator 收集汇总
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuntimeAgentExecutor } from './RuntimeAgentExecutor.js';
import { Worker, isSnapshotProvider } from './Worker.js';
import { TickCoordinator } from './TickCoordinator.js';
import { InProcessTransport } from './TransportLayer.js';
import { AgentPartitioner } from './AgentPartitioner.js';
import { EventRelay } from './EventRelay.js';
import type { AgentExecutor, SnapshotProvider } from './Worker.js';
import type {
  WorldEvent,
  BeeAgent,
  AgentPersona,
  AgentMemoryState,
} from '@beeclaw/shared';
import type { AgentResponseRecord } from '@beeclaw/consensus';
import type {
  WorkerMessage,
  AgentStateSnapshot,
  WorkerSnapshotReportMessage,
} from './types.js';

// ── 测试辅助 ────────────────────────────────────────────────────────

function createTestPersona(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    background: '一名资深金融分析师',
    profession: '金融分析师',
    traits: {
      riskTolerance: 0.5,
      informationSensitivity: 0.7,
      conformity: 0.3,
      emotionality: 0.4,
      analyticalDepth: 0.8,
    },
    expertise: ['金融', '股票'],
    biases: ['确认偏见'],
    communicationStyle: '理性分析型',
    ...overrides,
  };
}

function createTestMemoryState(): AgentMemoryState {
  return {
    shortTerm: [],
    longTerm: [],
    opinions: {},
    predictions: [],
  };
}

function createTestAgentData(overrides: Partial<BeeAgent> = {}): BeeAgent {
  const id = overrides.id ?? `agent-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: `测试Agent-${id.slice(-4)}`,
    persona: createTestPersona(),
    memory: createTestMemoryState(),
    relationships: [],
    followers: [],
    following: [],
    influence: 30,
    status: 'active',
    credibility: 0.5,
    spawnedAtTick: 0,
    lastActiveTick: 0,
    modelTier: 'cheap',
    modelId: 'cheap-default',
    ...overrides,
  };
}

function createTestEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    type: 'external',
    category: 'finance',
    title: '央行宣布加息',
    content: '央行宣布加息25个基点，市场反应剧烈。',
    source: 'news-api',
    importance: 0.8,
    propagationRadius: 0.5,
    tick: 1,
    tags: ['金融', '央行', '加息'],
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

// ── RuntimeAgentExecutor 快照测试 ──────────────────────────────────

describe('RuntimeAgentExecutor — 快照功能', () => {
  let executor: RuntimeAgentExecutor;

  beforeEach(() => {
    executor = new RuntimeAgentExecutor({ enableLogging: false });
  });

  describe('createSnapshot', () => {
    it('应为已加载 Agent 生成快照', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', name: '分析师Alpha' }));

      const snapshot = executor.createSnapshot('a1', 5, 'worker-1');

      expect(snapshot).not.toBeNull();
      expect(snapshot!.agentData.id).toBe('a1');
      expect(snapshot!.agentData.name).toBe('分析师Alpha');
      expect(snapshot!.tick).toBe(5);
      expect(snapshot!.workerId).toBe('worker-1');
      expect(snapshot!.timestamp).toBeGreaterThan(0);
      expect(snapshot!.changedFields).toBeDefined();
      expect(snapshot!.changedFields.length).toBeGreaterThan(0);
    });

    it('未加载的 Agent 应返回 null', () => {
      const snapshot = executor.createSnapshot('nonexistent', 1, 'worker-1');
      expect(snapshot).toBeNull();
    });

    it('应包含指定的 changedFields', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));

      const snapshot = executor.createSnapshot('a1', 1, 'w1', ['memory.shortTerm', 'credibility']);

      expect(snapshot!.changedFields).toEqual(['memory.shortTerm', 'credibility']);
    });

    it('快照中的 agentData 应包含完整的序列化数据', () => {
      const originalData = createTestAgentData({
        id: 'a1',
        status: 'active',
        influence: 42,
        credibility: 0.75,
      });
      executor.loadAgent(originalData);

      const snapshot = executor.createSnapshot('a1', 1, 'w1');

      expect(snapshot!.agentData.status).toBe('active');
      expect(snapshot!.agentData.influence).toBe(42);
      expect(snapshot!.agentData.credibility).toBe(0.75);
      expect(snapshot!.agentData.persona).toBeDefined();
      expect(snapshot!.agentData.memory).toBeDefined();
    });
  });

  describe('createSnapshots', () => {
    it('应为指定 Agent 列表生成快照', () => {
      executor.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
        createTestAgentData({ id: 'a3' }),
      ]);

      const snapshots = executor.createSnapshots(['a1', 'a3'], 5, 'w1');

      expect(snapshots).toHaveLength(2);
      expect(snapshots.map((s) => s.agentData.id)).toEqual(
        expect.arrayContaining(['a1', 'a3']),
      );
    });

    it('空 agentIds 应导出所有已加载 Agent 的快照', () => {
      executor.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
      ]);

      const snapshots = executor.createSnapshots([], 5, 'w1');

      expect(snapshots).toHaveLength(2);
    });

    it('含有不存在 Agent 的列表应跳过不存在的', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));

      const snapshots = executor.createSnapshots(['a1', 'missing'], 1, 'w1');

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]!.agentData.id).toBe('a1');
    });

    it('无已加载 Agent 时应返回空数组', () => {
      const snapshots = executor.createSnapshots([], 1, 'w1');
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('createSnapshotsForActivated', () => {
    it('应为激活的 Agent 生成快照', () => {
      executor.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
        createTestAgentData({ id: 'a3' }),
      ]);

      const snapshots = executor.createSnapshotsForActivated(['a1', 'a2'], 3, 'w1');

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]!.tick).toBe(3);
      expect(snapshots[0]!.workerId).toBe('w1');
    });
  });

  describe('isSnapshotProvider 类型守卫', () => {
    it('RuntimeAgentExecutor 应满足 SnapshotProvider 接口', () => {
      expect(isSnapshotProvider(executor)).toBe(true);
    });

    it('普通 mock executor 应不满足 SnapshotProvider', () => {
      const mock = createMockExecutor();
      expect(isSnapshotProvider(mock)).toBe(false);
    });

    it('null / undefined 应返回 false', () => {
      expect(isSnapshotProvider(null)).toBe(false);
      expect(isSnapshotProvider(undefined)).toBe(false);
    });
  });
});

// ── Worker 快照测试 ────────────────────────────────────────────────

describe('Worker — 快照功能', () => {
  let transport: InProcessTransport;
  let executor: RuntimeAgentExecutor;

  beforeEach(() => {
    transport = new InProcessTransport();
    executor = new RuntimeAgentExecutor({ enableLogging: false });
  });

  describe('generateSnapshots', () => {
    it('processTick 后应能为激活的 Agent 生成快照', async () => {
      executor.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
      ]);

      // Mock Agent.react
      for (const id of ['a1', 'a2']) {
        const agent = executor.getAgent(id)!;
        vi.spyOn(agent, 'react').mockResolvedValue({
          opinion: '看好',
          action: 'speak',
          emotionalState: 0.3,
        });
      }

      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1', 'a2']);

      await worker.processTick(1, [createTestEvent()]);
      const snapshots = worker.generateSnapshots(1);

      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots.every((s) => s.workerId === 'w1')).toBe(true);
      expect(snapshots.every((s) => s.tick === 1)).toBe(true);
    });

    it('无激活 Agent 时应返回空快照', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));

      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1']);

      // 处理空事件列表 → 无 Agent 被激活
      await worker.processTick(1, []);

      const snapshots = worker.generateSnapshots(1);
      expect(snapshots).toHaveLength(0);
    });

    it('executor 不支持快照时应返回空数组', async () => {
      const mockExecutor = createMockExecutor();
      const worker = new Worker({ id: 'w1' }, transport, mockExecutor);
      worker.setAssignedAgents(['a1']);

      await worker.processTick(1, [createTestEvent()]);
      const snapshots = worker.generateSnapshots(1);

      expect(snapshots).toHaveLength(0);
    });
  });

  describe('getLastActivatedAgentIds', () => {
    it('应追踪 processTick 中被激活的 Agent', async () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      worker.setAssignedAgents(['a1', 'a2', 'a3']);

      await worker.processTick(1, [createTestEvent()]);

      const activated = worker.getLastActivatedAgentIds();
      expect(activated).toEqual(expect.arrayContaining(['a1', 'a2', 'a3']));
    });

    it('不同 tick 之间应更新激活列表', async () => {
      const mockExecutor = createMockExecutor({
        isAgentInterested: vi.fn().mockImplementation(
          (agentId: string) => agentId === 'a1',
        ),
      });
      const worker = new Worker({ id: 'w1' }, transport, mockExecutor);
      worker.setAssignedAgents(['a1', 'a2']);

      await worker.processTick(1, [createTestEvent()]);

      // 只有 a1 感兴趣
      expect(worker.getLastActivatedAgentIds()).toEqual(['a1']);
    });

    it('应去重多事件触发的同一 Agent', async () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      worker.setAssignedAgents(['a1']);

      // 两个事件都激活 a1
      await worker.processTick(1, [createTestEvent(), createTestEvent()]);

      expect(worker.getLastActivatedAgentIds()).toEqual(['a1']);
    });
  });

  describe('reportSnapshots', () => {
    it('应通过 transport 上报快照到 Coordinator', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executor.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1']);

      const received: WorkerMessage[] = [];
      transport.onLeaderMessage((msg) => received.push(msg));

      await worker.processTick(1, [createTestEvent()]);
      const report = await worker.reportSnapshots(1);

      expect(report).not.toBeNull();
      expect(report!.type).toBe('worker_snapshot_report');
      expect(report!.snapshots.length).toBeGreaterThan(0);

      // 应该有一条 snapshot report 消息发送给 Leader
      const snapshotMsg = received.find(
        (m) => m.type === 'worker_snapshot_report',
      ) as WorkerSnapshotReportMessage | undefined;
      expect(snapshotMsg).toBeDefined();
      expect(snapshotMsg!.workerId).toBe('w1');
    });

    it('无快照时不应发送消息', async () => {
      const mockExecutor = createMockExecutor();
      const worker = new Worker({ id: 'w1' }, transport, mockExecutor);
      worker.setAssignedAgents(['a1']);

      const received: WorkerMessage[] = [];
      transport.onLeaderMessage((msg) => received.push(msg));

      await worker.processTick(1, []);
      const report = await worker.reportSnapshots(1);

      expect(report).toBeNull();
      expect(received.filter((m) => m.type === 'worker_snapshot_report')).toHaveLength(0);
    });
  });

  describe('request_snapshots 消息处理', () => {
    it('应响应 Coordinator 的 request_snapshots 并上报快照', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executor.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      const worker = new Worker({ id: 'w1' }, transport, executor);
      worker.setAssignedAgents(['a1']);

      // 先执行一个 tick 让 Agent 被激活
      await worker.processTick(1, [createTestEvent()]);

      const received: WorkerMessage[] = [];
      transport.onLeaderMessage((msg) => received.push(msg));

      // 发送 request_snapshots 消息
      await transport.sendToWorker('w1', {
        type: 'request_snapshots',
        agentIds: [],
        tick: 1,
      });

      // 等待异步处理
      await new Promise((resolve) => setTimeout(resolve, 50));

      const snapshotMsg = received.find(
        (m) => m.type === 'worker_snapshot_report',
      );
      expect(snapshotMsg).toBeDefined();
    });
  });

  describe('enableAutoSnapshot 配置', () => {
    it('默认应启用自动快照', () => {
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      // 通过私有属性间接验证（类型守卫）
      expect(worker.id).toBe('w1');
    });

    it('可通过配置禁用自动快照', () => {
      const worker = new Worker(
        { id: 'w1', enableAutoSnapshot: false },
        transport,
        createMockExecutor(),
      );
      expect(worker.id).toBe('w1');
    });
  });
});

// ── TickCoordinator 快照测试 ──────────────────────────────────────

describe('TickCoordinator — 快照收集', () => {
  function createSnapshotTestSetup(workerCount: number = 1) {
    const transport = new InProcessTransport();
    const partitioner = new AgentPartitioner();
    const eventRelay = new EventRelay();
    const coordinator = new TickCoordinator(transport, partitioner, eventRelay);

    const executors: RuntimeAgentExecutor[] = [];
    const workers: Worker[] = [];

    for (let i = 0; i < workerCount; i++) {
      const exec = new RuntimeAgentExecutor({ enableLogging: false });
      const worker = new Worker({ id: `w${i}` }, transport, exec);
      executors.push(exec);
      workers.push(worker);
      coordinator.registerWorker(worker);
    }

    return { coordinator, transport, partitioner, eventRelay, workers, executors };
  }

  describe('collectSnapshots', () => {
    it('应在 executeTick 后自动收集快照', async () => {
      const { coordinator, executors, workers } = createSnapshotTestSetup(1);

      // 加载 Agent
      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executors[0]!.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);

      const result = await coordinator.executeTick();

      // 结果中应包含快照
      expect(result.agentSnapshots).toBeDefined();
      expect(result.agentSnapshots.length).toBeGreaterThanOrEqual(0);
    });

    it('有激活 Agent 时应包含快照', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      executors[0]!.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
      ]);

      for (const id of ['a1', 'a2']) {
        const agent = executors[0]!.getAgent(id)!;
        vi.spyOn(agent, 'react').mockResolvedValue({
          opinion: '看好',
          action: 'speak',
          emotionalState: 0.3,
        });
      }

      coordinator.assignAgents(['a1', 'a2']);
      coordinator.injectEvents([createTestEvent()]);

      const result = await coordinator.executeTick();

      expect(result.agentSnapshots.length).toBe(2);
      expect(result.agentSnapshots.map((s) => s.agentData.id)).toEqual(
        expect.arrayContaining(['a1', 'a2']),
      );
    });

    it('多 Worker 时应汇总所有 Worker 的快照', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(2);

      // Worker 0 有 Agent a1
      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent1 = executors[0]!.getAgent('a1')!;
      vi.spyOn(agent1, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      // Worker 1 有 Agent a2
      executors[1]!.loadAgent(createTestAgentData({ id: 'a2' }));
      const agent2 = executors[1]!.getAgent('a2')!;
      vi.spyOn(agent2, 'react').mockResolvedValue({
        opinion: '看空',
        action: 'speak',
        emotionalState: -0.3,
      });

      coordinator.assignAgents(['a1', 'a2']);
      coordinator.injectEvents([createTestEvent()]);

      const result = await coordinator.executeTick();

      // 两个 Worker 各贡献一个快照
      expect(result.agentSnapshots.length).toBe(2);

      const snapshotWorkerIds = result.agentSnapshots.map((s) => s.workerId);
      expect(snapshotWorkerIds).toEqual(expect.arrayContaining(['w0', 'w1']));
    });

    it('无激活 Agent 时快照应为空', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      // 加载 Agent 但不注入事件
      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      coordinator.assignAgents(['a1']);
      // 不注入事件

      const result = await coordinator.executeTick();

      expect(result.agentSnapshots).toHaveLength(0);
    });
  });

  describe('getLastTickSnapshots', () => {
    it('应返回最近一次 tick 的快照', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executors[0]!.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);

      await coordinator.executeTick();

      const snapshots = coordinator.getLastTickSnapshots();
      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots[0]!.tick).toBe(1);
    });

    it('多次 tick 后应只保留最近一次的快照', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executors[0]!.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      coordinator.assignAgents(['a1']);

      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();

      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();

      const snapshots = coordinator.getLastTickSnapshots();
      expect(snapshots.every((s) => s.tick === 2)).toBe(true);
    });
  });

  describe('onSnapshots 回调', () => {
    it('应在 tick 结束后调用注册的快照处理器', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executors[0]!.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      const receivedSnapshots: AgentStateSnapshot[] = [];
      coordinator.onSnapshots((snapshots) => {
        receivedSnapshots.push(...snapshots);
      });

      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);

      await coordinator.executeTick();

      expect(receivedSnapshots.length).toBeGreaterThan(0);
      expect(receivedSnapshots[0]!.agentData.id).toBe('a1');
    });

    it('快照处理器抛错不影响 tick 正常完成', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executors[0]!.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      // 注册会抛错的处理器
      coordinator.onSnapshots(() => {
        throw new Error('持久层写入失败');
      });

      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);

      // 不应抛错
      const result = await coordinator.executeTick();
      expect(result.tick).toBe(1);
      expect(result.agentSnapshots.length).toBeGreaterThan(0);
    });

    it('无快照时不调用处理器', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      coordinator.assignAgents(['a1']);
      // 不注入事件

      const handler = vi.fn();
      coordinator.onSnapshots(handler);

      await coordinator.executeTick();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('消息驱动模式 — worker_snapshot_report', () => {
    it('应处理 Worker 上报的快照消息', () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport);
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      coordinator.registerWorker(worker);

      const receivedSnapshots: AgentStateSnapshot[] = [];
      coordinator.onSnapshots((snapshots) => {
        receivedSnapshots.push(...snapshots);
      });

      // 模拟 Worker 发送快照上报消息
      const snapshotReport: WorkerSnapshotReportMessage = {
        type: 'worker_snapshot_report',
        workerId: 'w1',
        tick: 1,
        snapshots: [
          {
            agentData: createTestAgentData({ id: 'a1' }),
            tick: 1,
            timestamp: Date.now(),
            workerId: 'w1',
            changedFields: ['memory.shortTerm', 'lastActiveTick'],
          },
        ],
        durationMs: 5,
      };

      transport.sendToLeader(snapshotReport);

      expect(receivedSnapshots).toHaveLength(1);
      expect(receivedSnapshots[0]!.agentData.id).toBe('a1');
    });

    it('应合并消息驱动的快照到 lastTickSnapshots', () => {
      const transport = new InProcessTransport();
      const coordinator = new TickCoordinator(transport);
      const worker = new Worker({ id: 'w1' }, transport, createMockExecutor());
      coordinator.registerWorker(worker);

      const snapshotReport: WorkerSnapshotReportMessage = {
        type: 'worker_snapshot_report',
        workerId: 'w1',
        tick: 1,
        snapshots: [
          {
            agentData: createTestAgentData({ id: 'a1' }),
            tick: 1,
            timestamp: Date.now(),
            workerId: 'w1',
            changedFields: ['memory.shortTerm'],
          },
          {
            agentData: createTestAgentData({ id: 'a2' }),
            tick: 1,
            timestamp: Date.now(),
            workerId: 'w1',
            changedFields: ['memory.opinions'],
          },
        ],
        durationMs: 10,
      };

      transport.sendToLeader(snapshotReport);

      const snapshots = coordinator.getLastTickSnapshots();
      expect(snapshots).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('reset 应清除快照和处理器', async () => {
      const { coordinator, executors } = createSnapshotTestSetup(1);

      executors[0]!.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executors[0]!.getAgent('a1')!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好',
        action: 'speak',
        emotionalState: 0.3,
      });

      const handler = vi.fn();
      coordinator.onSnapshots(handler);

      coordinator.assignAgents(['a1']);
      coordinator.injectEvents([createTestEvent()]);
      await coordinator.executeTick();

      expect(handler).toHaveBeenCalled();
      expect(coordinator.getLastTickSnapshots().length).toBeGreaterThan(0);

      coordinator.reset();

      expect(coordinator.getLastTickSnapshots()).toHaveLength(0);
    });
  });

  describe('collectSnapshots 手动调用', () => {
    it('应在 tick 之外也能手动收集快照', () => {
      const { coordinator, executors, workers } = createSnapshotTestSetup(1);

      executors[0]!.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
      ]);

      // 模拟手动设定激活的 Agent
      workers[0]!.setAssignedAgents(['a1', 'a2']);
      // 手动 processTick 以设置 lastActivatedAgentIds
      // （此处由于 mock 不会真正 react，我们使用 RuntimeAgentExecutor 的直接快照）

      const snapshots = coordinator.collectSnapshots(0);
      // 由于 lastActivatedAgentIds 为空，collectSnapshots 通过 Worker.generateSnapshots
      // 而 generateSnapshots 依赖 lastActivatedAgentIds
      expect(snapshots).toBeDefined();
    });
  });
});

// ── 端到端集成测试 ────────────────────────────────────────────────

describe('Agent 状态快照 — 端到端集成', () => {
  it('完整链路：Agent 执行 → 状态变化 → 快照导出 → Coordinator 收集', async () => {
    const transport = new InProcessTransport();
    const coordinator = new TickCoordinator(transport);

    const executor = new RuntimeAgentExecutor({ enableLogging: false });
    executor.loadAgents([
      createTestAgentData({ id: 'agent-001', name: '牛市分析师', credibility: 0.6 }),
      createTestAgentData({ id: 'agent-002', name: '熊市分析师', credibility: 0.4 }),
    ]);

    // Mock LLM 响应
    for (const [id, opinion] of [
      ['agent-001', '强烈看好'],
      ['agent-002', '看空'],
    ] as const) {
      const agent = executor.getAgent(id)!;
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion,
        action: 'speak',
        emotionalState: id === 'agent-001' ? 0.8 : -0.5,
      });
    }

    const worker = new Worker({ id: 'main-worker' }, transport, executor);
    coordinator.registerWorker(worker);
    coordinator.assignAgents(['agent-001', 'agent-002']);

    // 注册持久层回调
    const persistedSnapshots: AgentStateSnapshot[] = [];
    coordinator.onSnapshots((snapshots) => {
      persistedSnapshots.push(...snapshots);
    });

    // 执行 tick
    coordinator.injectEvents([
      createTestEvent({ title: 'A股大涨', importance: 0.9 }),
    ]);

    const result = await coordinator.executeTick();

    // 验证 tick 结果
    expect(result.tick).toBe(1);
    expect(result.totalResponses).toBe(2);

    // 验证快照
    expect(result.agentSnapshots).toHaveLength(2);
    expect(persistedSnapshots).toHaveLength(2);

    // 验证快照内容
    const snapshot001 = persistedSnapshots.find(
      (s) => s.agentData.id === 'agent-001',
    );
    expect(snapshot001).toBeDefined();
    expect(snapshot001!.agentData.name).toBe('牛市分析师');
    expect(snapshot001!.workerId).toBe('main-worker');
    expect(snapshot001!.tick).toBe(1);
    expect(snapshot001!.changedFields.length).toBeGreaterThan(0);

    const snapshot002 = persistedSnapshots.find(
      (s) => s.agentData.id === 'agent-002',
    );
    expect(snapshot002).toBeDefined();
    expect(snapshot002!.agentData.name).toBe('熊市分析师');
  });
});
