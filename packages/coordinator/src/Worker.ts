// ============================================================================
// Worker — 分布式工作节点
// 接收 Coordinator 指令，在本地执行分配的 Agent 处理逻辑
// ============================================================================

import type { WorldEvent } from '@beeclaw/shared';
import type { AgentResponseRecord } from '@beeclaw/consensus';
import type {
  CoordinatorMessage,
  WorkerConfig,
  WorkerTickResultMessage,
  WorkerSnapshotReportMessage,
  AgentStateSnapshot,
} from './types.js';
import type { TransportLayer } from './TransportLayer.js';

/**
 * AgentExecutor — Worker 用来执行 Agent 反应的回调接口。
 * 解耦 Worker 与具体 Agent 实现（DIP 原则）。
 */
export interface AgentExecutor {
  /**
   * 执行指定 Agent 对事件的反应
   * @returns Agent 响应记录 + 新产生的内部事件
   */
  executeAgent(
    agentId: string,
    event: WorldEvent,
    tick: number,
  ): Promise<{
    record: AgentResponseRecord;
    newEvents: WorldEvent[];
  } | null>;

  /**
   * 判断 Agent 是否对该事件感兴趣
   */
  isAgentInterested(agentId: string, event: WorldEvent): boolean;

  /**
   * 判断 Agent 是否处于活跃状态
   */
  isAgentActive(agentId: string): boolean;
}

/**
 * SnapshotProvider — 可选的快照生成接口。
 * 当 executor 同时实现此接口时，Worker 可在 tick 结束后自动生成快照。
 */
export interface SnapshotProvider {
  /**
   * 为指定 Agent 列表生成状态快照
   * @param agentIds 需要快照的 Agent ID 列表，空数组表示所有
   * @param tick 当前 tick 编号
   * @param workerId 来源 Worker ID
   */
  createSnapshots(
    agentIds: string[],
    tick: number,
    workerId: string,
  ): AgentStateSnapshot[];

  /**
   * 为最近一次激活的 Agent 生成状态快照
   * @param agentIds 需要快照的 Agent ID 列表
   * @param tick 当前 tick 编号
   * @param workerId 来源 Worker ID
   */
  createSnapshotsForActivated(
    agentIds: string[],
    tick: number,
    workerId: string,
  ): AgentStateSnapshot[];
}

/**
 * 判断一个 executor 是否支持快照生成
 */
export function isSnapshotProvider(obj: unknown): obj is SnapshotProvider {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as SnapshotProvider).createSnapshots === 'function' &&
    typeof (obj as SnapshotProvider).createSnapshotsForActivated === 'function'
  );
}

/** Worker 配置（扩展：支持快照开关） */
export interface WorkerConfigWithSnapshot extends WorkerConfig {
  /** 是否在每个 tick 结束后自动生成已激活 Agent 的快照，默认 true */
  enableAutoSnapshot?: boolean;
}

export class Worker {
  readonly id: string;
  private transport: TransportLayer;
  private executor: AgentExecutor;
  private assignedAgentIds: string[] = [];
  private processing = false;
  private enableAutoSnapshot: boolean;

  /** 最近一次 tick 中实际被激活（参与执行）的 Agent ID */
  private lastActivatedAgentIds: string[] = [];

  constructor(
    config: WorkerConfig | WorkerConfigWithSnapshot,
    transport: TransportLayer,
    executor: AgentExecutor,
  ) {
    this.id = config.id;
    this.transport = transport;
    this.executor = executor;
    this.enableAutoSnapshot = (config as WorkerConfigWithSnapshot).enableAutoSnapshot ?? true;

    // 注册到传输层
    this.transport.registerWorker(this.id);

    // 监听 Coordinator 发来的消息
    this.transport.onWorkerMessage(this.id, (message) => {
      this.handleMessage(message);
    });
  }

  /**
   * 设置分配的 Agent ID 列表
   */
  setAssignedAgents(agentIds: string[]): void {
    this.assignedAgentIds = [...agentIds];
  }

  /**
   * 获取当前分配的 Agent 数量
   */
  getAgentCount(): number {
    return this.assignedAgentIds.length;
  }

  /**
   * 获取分配的 Agent ID 列表
   */
  getAssignedAgentIds(): string[] {
    return [...this.assignedAgentIds];
  }

  /**
   * 获取最近一次 tick 中被激活的 Agent ID 列表
   */
  getLastActivatedAgentIds(): string[] {
    return [...this.lastActivatedAgentIds];
  }

  /**
   * 获取 executor 引用（便于外部检查类型或调用快照方法）
   */
  getExecutor(): AgentExecutor {
    return this.executor;
  }

  /**
   * 处理一个 tick（直接调用，供 TickCoordinator in-process 模式使用）
   *
   * 在 tick 执行期间追踪被激活的 Agent ID，tick 结束后可通过
   * generateSnapshots() 或 Coordinator 请求来获取这些 Agent 的最新状态快照。
   */
  async processTick(tick: number, events: WorldEvent[]): Promise<WorkerTickResultMessage> {
    const startTime = Date.now();
    const allResponses: AgentResponseRecord[] = [];
    const allNewEvents: WorldEvent[] = [];
    let agentsActivated = 0;

    // 追踪本 tick 中被激活的 Agent（去重）
    const activatedSet = new Set<string>();

    for (const event of events) {
      // 筛选活跃且感兴趣的 Agent
      const interestedIds = this.assignedAgentIds.filter(
        (id) => this.executor.isAgentActive(id) && this.executor.isAgentInterested(id, event),
      );

      agentsActivated += interestedIds.length;

      // 记录激活的 Agent
      for (const id of interestedIds) {
        activatedSet.add(id);
      }

      // 并发执行 Agent 反应
      const results = await Promise.all(
        interestedIds.map((id) => this.executor.executeAgent(id, event, tick)),
      );

      for (const result of results) {
        if (result) {
          allResponses.push(result.record);
          allNewEvents.push(...result.newEvents);
        }
      }
    }

    // 保存本 tick 激活的 Agent 列表
    this.lastActivatedAgentIds = [...activatedSet];

    return {
      type: 'worker_tick_result',
      workerId: this.id,
      tick,
      responses: allResponses,
      newEvents: allNewEvents,
      agentsActivated,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 为最近一次 tick 中激活的 Agent 生成状态快照。
   *
   * 需要 executor 同时实现 SnapshotProvider 接口才能工作。
   * @param agentIds 指定需要快照的 Agent ID 列表；未传入时默认使用最近一次 tick 激活的 Agent
   * @returns 快照数组，如果 executor 不支持则返回空数组
   */
  generateSnapshots(tick: number, agentIds?: string[]): AgentStateSnapshot[] {
    if (!isSnapshotProvider(this.executor)) {
      return [];
    }

    if (agentIds !== undefined) {
      return this.executor.createSnapshots(agentIds, tick, this.id);
    }

    return this.executor.createSnapshotsForActivated(this.lastActivatedAgentIds, tick, this.id);
  }

  /**
   * 生成快照并上报给 Coordinator（通过 transport 发送）
   */
  async reportSnapshots(
    tick: number,
    agentIds?: string[],
  ): Promise<WorkerSnapshotReportMessage | null> {
    const startTime = Date.now();
    const snapshots = this.generateSnapshots(tick, agentIds);

    if (snapshots.length === 0) {
      return null;
    }

    const report: WorkerSnapshotReportMessage = {
      type: 'worker_snapshot_report',
      workerId: this.id,
      tick,
      snapshots,
      durationMs: Date.now() - startTime,
    };

    await this.transport.sendToLeader(report);
    return report;
  }

  /**
   * 发送就绪信号
   */
  async sendReady(): Promise<void> {
    await this.transport.sendToLeader({
      type: 'worker_ready',
      workerId: this.id,
    });
  }

  /**
   * 注销 Worker
   */
  dispose(): void {
    this.transport.unregisterWorker(this.id);
  }

  /**
   * 处理来自 Coordinator 的消息
   */
  private handleMessage(message: CoordinatorMessage): void {
    switch (message.type) {
      case 'assign_agents':
        this.setAssignedAgents(message.agentIds);
        break;
      case 'tick_begin':
        // 异步处理 tick，通过 transport 上报结果
        this.handleTickBegin(message.tick, message.events);
        break;
      case 'tick_abort':
        // 暂无特殊处理，仅停止当前处理
        this.processing = false;
        break;
      case 'request_snapshots':
        // Coordinator 请求上报快照
        this.handleSnapshotRequest(message.tick, message.agentIds);
        break;
    }
  }

  /**
   * 处理 tick_begin 消息（消息驱动模式）
   */
  private async handleTickBegin(tick: number, events: WorldEvent[]): Promise<void> {
    this.processing = true;
    try {
      const result = await this.processTick(tick, events);
      await this.transport.sendToLeader(result);

      // 自动上报快照（如果启用）
      if (this.enableAutoSnapshot) {
        await this.reportSnapshots(tick);
      }
    } catch (error) {
      await this.transport.sendToLeader({
        type: 'worker_error',
        workerId: this.id,
        tick,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.processing = false;
    }
  }

  /**
   * 处理 Coordinator 请求快照的消息
   */
  private async handleSnapshotRequest(tick: number, agentIds: string[]): Promise<void> {
    try {
      await this.reportSnapshots(tick, agentIds);
    } catch (error) {
      await this.transport.sendToLeader({
        type: 'worker_error',
        workerId: this.id,
        tick,
        error: `Snapshot generation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
