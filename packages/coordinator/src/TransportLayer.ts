// ============================================================================
// TransportLayer — 通信层抽象接口 + InProcess 实现
// ============================================================================

import type { CoordinatorMessage, WorkerMessage } from './types.js';

/**
 * 通信层接口 — 定义 Coordinator 与 Worker 之间的消息传递方式。
 * 通过接口抽象解耦业务逻辑与传输实现（DIP 原则）。
 */
export interface TransportLayer {
  /** 发送消息到指定 Worker */
  sendToWorker(workerId: string, message: CoordinatorMessage): Promise<void>;
  /** 广播消息到所有已注册 Worker */
  broadcastToWorkers(message: CoordinatorMessage): Promise<void>;
  /** Worker 发送消息到 Leader */
  sendToLeader(message: WorkerMessage): Promise<void>;

  /** 注册 Worker 端的消息处理器 */
  onWorkerMessage(workerId: string, handler: (message: CoordinatorMessage) => void): void;
  /** 注册 Leader 端的消息处理器 */
  onLeaderMessage(handler: (message: WorkerMessage) => void): void;

  /** 注册一个 Worker 到传输层 */
  registerWorker(workerId: string): void;
  /** 注销一个 Worker */
  unregisterWorker(workerId: string): void;
  /** 获取所有已注册的 Worker ID */
  getRegisteredWorkerIds(): string[];
}

/**
 * InProcessTransport — 进程内通信实现。
 *
 * 所有 Worker 在同一进程内，使用同步回调模拟消息传递。
 * 接口与远程实现完全一致，方便后续替换为 Redis/NATS。
 */
export class InProcessTransport implements TransportLayer {
  private workerHandlers: Map<string, (message: CoordinatorMessage) => void> = new Map();
  private leaderHandler: ((message: WorkerMessage) => void) | null = null;
  private registeredWorkers: Set<string> = new Set();

  registerWorker(workerId: string): void {
    this.registeredWorkers.add(workerId);
  }

  unregisterWorker(workerId: string): void {
    this.registeredWorkers.delete(workerId);
    this.workerHandlers.delete(workerId);
  }

  getRegisteredWorkerIds(): string[] {
    return [...this.registeredWorkers];
  }

  async sendToWorker(workerId: string, message: CoordinatorMessage): Promise<void> {
    const handler = this.workerHandlers.get(workerId);
    if (!handler) {
      throw new Error(`Worker ${workerId} has no message handler registered`);
    }
    // 使用 queueMicrotask 模拟异步消息传递
    handler(message);
  }

  async broadcastToWorkers(message: CoordinatorMessage): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const workerId of this.registeredWorkers) {
      promises.push(this.sendToWorker(workerId, message));
    }
    await Promise.all(promises);
  }

  async sendToLeader(message: WorkerMessage): Promise<void> {
    if (!this.leaderHandler) {
      throw new Error('No leader message handler registered');
    }
    this.leaderHandler(message);
  }

  onWorkerMessage(workerId: string, handler: (message: CoordinatorMessage) => void): void {
    this.workerHandlers.set(workerId, handler);
  }

  onLeaderMessage(handler: (message: WorkerMessage) => void): void {
    this.leaderHandler = handler;
  }
}
