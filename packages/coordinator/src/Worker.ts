// ============================================================================
// Worker — 分布式工作节点
// 接收 Coordinator 指令，在本地执行分配的 Agent 处理逻辑
// ============================================================================

import type { WorldEvent, AgentResponse } from '@beeclaw/shared';
import type { AgentResponseRecord } from '@beeclaw/consensus';
import type {
  CoordinatorMessage,
  WorkerConfig,
  WorkerTickResultMessage,
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

export class Worker {
  readonly id: string;
  private transport: TransportLayer;
  private executor: AgentExecutor;
  private assignedAgentIds: string[] = [];
  private processing = false;

  constructor(config: WorkerConfig, transport: TransportLayer, executor: AgentExecutor) {
    this.id = config.id;
    this.transport = transport;
    this.executor = executor;

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
   * 处理一个 tick（直接调用，供 TickCoordinator in-process 模式使用）
   */
  async processTick(tick: number, events: WorldEvent[]): Promise<WorkerTickResultMessage> {
    const startTime = Date.now();
    const allResponses: AgentResponseRecord[] = [];
    const allNewEvents: WorldEvent[] = [];
    let agentsActivated = 0;

    for (const event of events) {
      // 筛选活跃且感兴趣的 Agent
      const interestedIds = this.assignedAgentIds.filter(
        (id) => this.executor.isAgentActive(id) && this.executor.isAgentInterested(id, event),
      );

      agentsActivated += interestedIds.length;

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
}
