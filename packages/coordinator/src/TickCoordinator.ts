// ============================================================================
// TickCoordinator — 分布式 Tick 协调器（Leader 角色）
// 管理 Worker 注册/注销、协调 Tick 生命周期、超时处理、事件同步
// ============================================================================

import type { WorldEvent } from '@beeclaw/shared';
import type {
  WorkerInfo,
  CoordinatorConfig,
  WorkerTickResultMessage,
  DistributedTickResult,
  WorkerMessage,
  PartitionAssignment,
} from './types.js';
import type { TransportLayer } from './TransportLayer.js';
import { AgentPartitioner } from './AgentPartitioner.js';
import { EventRelay } from './EventRelay.js';
import type { Worker } from './Worker.js';

/** 默认配置 */
const DEFAULT_CONFIG: CoordinatorConfig = {
  workerTimeoutMs: 30_000,
  unhealthyThreshold: 3,
};

/**
 * TickCoordinator — 分布式 Tick 调度的 Leader 节点。
 *
 * 职责:
 * - 管理 Worker 注册/注销及健康状态
 * - 推进 tick 编号，协调 Tick 三阶段生命周期（Prepare → Execute → Aggregate）
 * - Worker 超时检测与不健康标记
 * - 通过 EventRelay 进行跨 Worker 事件同步
 * - 通过 AgentPartitioner 进行 Agent 分片
 */
export class TickCoordinator {
  private config: CoordinatorConfig;
  private transport: TransportLayer;
  private partitioner: AgentPartitioner;
  private eventRelay: EventRelay;

  /** Worker 信息表 */
  private workers: Map<string, WorkerInfo> = new Map();
  /** Worker 实例表（in-process 模式） */
  private workerInstances: Map<string, Worker> = new Map();
  /** 当前分片方案 */
  private currentAssignments: PartitionAssignment[] = [];
  /** 当前 tick 编号 */
  private currentTick = 0;
  /** 是否正在执行 tick */
  private tickInProgress = false;
  /** 待处理的外部事件队列 */
  private externalEventQueue: WorldEvent[] = [];

  constructor(
    transport: TransportLayer,
    partitioner?: AgentPartitioner,
    eventRelay?: EventRelay,
    config?: Partial<CoordinatorConfig>,
  ) {
    this.transport = transport;
    this.partitioner = partitioner ?? new AgentPartitioner();
    this.eventRelay = eventRelay ?? new EventRelay();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 监听 Worker 发来的消息
    this.transport.onLeaderMessage((message) => {
      this.handleWorkerMessage(message);
    });
  }

  // ── Worker 管理 ──────────────────────────────────────────────────────

  /**
   * 注册 Worker（in-process 模式直接持有 Worker 实例）
   */
  registerWorker(worker: Worker): void {
    if (this.tickInProgress) {
      throw new Error('Cannot register worker during tick execution');
    }

    const info: WorkerInfo = {
      id: worker.id,
      status: 'online',
      agentCount: worker.getAgentCount(),
      consecutiveTimeouts: 0,
      lastHeartbeat: Date.now(),
    };

    this.workers.set(worker.id, info);
    this.workerInstances.set(worker.id, worker);
  }

  /**
   * 注销 Worker
   */
  unregisterWorker(workerId: string): void {
    if (this.tickInProgress) {
      throw new Error('Cannot unregister worker during tick execution');
    }
    this.workers.delete(workerId);
    this.workerInstances.delete(workerId);
  }

  /**
   * 获取 Worker 信息
   */
  getWorkerInfo(workerId: string): WorkerInfo | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 获取所有 Worker 信息
   */
  getAllWorkers(): WorkerInfo[] {
    return [...this.workers.values()];
  }

  /**
   * 获取健康 Worker 列表
   */
  getHealthyWorkers(): WorkerInfo[] {
    return [...this.workers.values()].filter((w) => w.status === 'online');
  }

  /**
   * 获取当前 tick 编号
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * 获取当前分片方案
   */
  getCurrentAssignments(): PartitionAssignment[] {
    return this.currentAssignments;
  }

  // ── Agent 分片 ──────────────────────────────────────────────────────

  /**
   * 执行 Agent 分片并通知各 Worker
   */
  assignAgents(agentIds: string[]): PartitionAssignment[] {
    if (this.tickInProgress) {
      throw new Error('Cannot reassign agents during tick execution');
    }

    const healthyWorkers = this.getHealthyWorkers();
    if (healthyWorkers.length === 0) {
      this.currentAssignments = [];
      return [];
    }

    const workerIds = healthyWorkers.map((w) => w.id);
    this.currentAssignments = this.partitioner.partition(agentIds, workerIds);

    // 通知各 Worker 更新分配
    for (const assignment of this.currentAssignments) {
      const worker = this.workerInstances.get(assignment.workerId);
      if (worker) {
        worker.setAssignedAgents(assignment.agentIds);
      }

      // 更新 WorkerInfo 中的 agentCount
      const info = this.workers.get(assignment.workerId);
      if (info) {
        info.agentCount = assignment.agentIds.length;
      }
    }

    return this.currentAssignments;
  }

  // ── 事件管理 ────────────────────────────────────────────────────────

  /**
   * 注入外部事件到队列
   */
  injectEvents(events: WorldEvent[]): void {
    this.externalEventQueue.push(...events);
  }

  /**
   * 获取 EventRelay 引用（供外部检查状态）
   */
  getEventRelay(): EventRelay {
    return this.eventRelay;
  }

  // ── Tick 生命周期 ──────────────────────────────────────────────────

  /**
   * 执行一个完整的 Tick 周期。
   *
   * Phase 1: Prepare — 推进 tick 编号，收集事件
   * Phase 2: Execute — Worker 并行处理
   * Phase 3: Aggregate — 收集结果、汇总信号、事件中继
   */
  async executeTick(): Promise<DistributedTickResult> {
    if (this.tickInProgress) {
      throw new Error('A tick is already in progress');
    }

    const healthyWorkers = this.getHealthyWorkers();
    if (healthyWorkers.length === 0) {
      throw new Error('No healthy workers available');
    }

    this.tickInProgress = true;
    const startTime = Date.now();
    this.currentTick++;
    const tick = this.currentTick;

    try {
      // ── Phase 1: Prepare ──
      // 收集事件：外部注入 + 上一 tick 的跨 Worker 级联事件
      const relayedEvents = this.eventRelay.consumePendingEvents();
      const allEvents = [...this.externalEventQueue, ...relayedEvents];
      this.externalEventQueue = [];

      // ── Phase 2: Execute ──
      const { results, timedOutWorkers } = await this.executeWorkers(
        tick,
        allEvents,
        healthyWorkers,
      );

      // ── Phase 3: Aggregate ──
      return this.aggregateResults(tick, allEvents.length, results, timedOutWorkers, startTime);
    } finally {
      this.tickInProgress = false;
    }
  }

  // ── 内部方法 ──────────────────────────────────────────────────────

  /**
   * Phase 2: 并行执行所有 Worker 的 tick 处理，带超时控制
   */
  private async executeWorkers(
    tick: number,
    events: WorldEvent[],
    healthyWorkers: WorkerInfo[],
  ): Promise<{
    results: WorkerTickResultMessage[];
    timedOutWorkers: string[];
  }> {
    const results: WorkerTickResultMessage[] = [];
    const timedOutWorkers: string[] = [];

    // 并发执行所有 Worker，每个带独立超时
    const workerPromises = healthyWorkers.map(async (workerInfo) => {
      const worker = this.workerInstances.get(workerInfo.id);
      if (!worker) {
        return { workerId: workerInfo.id, status: 'missing' as const };
      }

      try {
        const result = await this.executeWithTimeout(
          worker.processTick(tick, events),
          this.config.workerTimeoutMs,
          workerInfo.id,
        );
        return { workerId: workerInfo.id, status: 'success' as const, result };
      } catch {
        return { workerId: workerInfo.id, status: 'timeout' as const };
      }
    });

    const outcomes = await Promise.all(workerPromises);

    for (const outcome of outcomes) {
      if (outcome.status === 'success' && outcome.result) {
        results.push(outcome.result);
        this.recordWorkerSuccess(outcome.workerId);
      } else if (outcome.status === 'timeout') {
        timedOutWorkers.push(outcome.workerId);
        this.recordWorkerTimeout(outcome.workerId);
      }
      // 'missing' 情况忽略
    }

    return { results, timedOutWorkers };
  }

  /**
   * 带超时的 Promise 执行
   */
  private executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    workerId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Worker ${workerId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Phase 3: 汇总所有 Worker 的结果
   */
  private aggregateResults(
    tick: number,
    eventsProcessed: number,
    results: WorkerTickResultMessage[],
    timedOutWorkers: string[],
    startTime: number,
  ): DistributedTickResult {
    let totalAgentsActivated = 0;
    let totalResponses = 0;
    const allNewEvents: WorldEvent[] = [];

    for (const result of results) {
      totalAgentsActivated += result.agentsActivated;
      totalResponses += result.responses.length;

      // 收集跨 Worker 新事件 → 放入 EventRelay，下一 tick 分发
      if (result.newEvents.length > 0) {
        this.eventRelay.collectEvents(result.newEvents);
        allNewEvents.push(...result.newEvents);
      }
    }

    return {
      tick,
      eventsProcessed,
      totalAgentsActivated,
      totalResponses,
      workerResults: results,
      signals: [], // 共识信号由外部 ConsensusEngine 处理
      collectedNewEvents: allNewEvents,
      durationMs: Date.now() - startTime,
      timedOutWorkers,
    };
  }

  /**
   * 记录 Worker 成功完成
   */
  private recordWorkerSuccess(workerId: string): void {
    const info = this.workers.get(workerId);
    if (info) {
      info.consecutiveTimeouts = 0;
      info.lastHeartbeat = Date.now();
    }
  }

  /**
   * 记录 Worker 超时，连续超时达到阈值则标记为不健康
   */
  private recordWorkerTimeout(workerId: string): void {
    const info = this.workers.get(workerId);
    if (!info) return;

    info.consecutiveTimeouts++;
    if (info.consecutiveTimeouts >= this.config.unhealthyThreshold) {
      info.status = 'unhealthy';
    }
  }

  /**
   * 处理 Worker 发来的消息（消息驱动模式兼容）
   */
  private handleWorkerMessage(message: WorkerMessage): void {
    switch (message.type) {
      case 'worker_ready': {
        const info = this.workers.get(message.workerId);
        if (info) {
          info.status = 'online';
          info.lastHeartbeat = Date.now();
        }
        break;
      }
      case 'worker_error': {
        const info = this.workers.get(message.workerId);
        if (info) {
          info.consecutiveTimeouts++;
          if (info.consecutiveTimeouts >= this.config.unhealthyThreshold) {
            info.status = 'unhealthy';
          }
        }
        break;
      }
      case 'worker_tick_result': {
        // in-process 模式下 tick result 通过 processTick 直接返回
        // 此处用于消息驱动模式的兼容预留
        const info = this.workers.get(message.workerId);
        if (info) {
          info.consecutiveTimeouts = 0;
          info.lastHeartbeat = Date.now();
        }
        break;
      }
    }
  }

  /**
   * 重置协调器状态
   */
  reset(): void {
    if (this.tickInProgress) {
      throw new Error('Cannot reset during tick execution');
    }

    this.workers.clear();
    this.workerInstances.clear();
    this.currentAssignments = [];
    this.currentTick = 0;
    this.externalEventQueue = [];
    this.eventRelay.reset();
  }
}
