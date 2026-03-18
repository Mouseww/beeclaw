// ============================================================================
// NATSTransportLayer — 基于 NATS 的高性能跨进程通信层实现
// ============================================================================

import { connect, StringCodec, type NatsConnection, type Subscription } from 'nats';
import type { TransportLayer } from './TransportLayer.js';
import type { CoordinatorMessage, WorkerMessage } from './types.js';

// ── 配置 ──

/** NATS 连接配置 */
export interface NATSTransportConfig {
  /** NATS 服务器地址列表，默认 ['nats://127.0.0.1:4222'] */
  servers?: string | string[];
  /** 认证 token */
  token?: string;
  /** 用户名 */
  user?: string;
  /** 密码 */
  pass?: string;
  /** Subject 前缀，默认 'beeclaw'（支持多集群隔离） */
  prefix?: string;
}

// ── Subject 命名常量 ──

const DEFAULT_PREFIX = 'beeclaw';

function subjectForWorker(prefix: string, workerId: string): string {
  return `${prefix}.worker.${workerId}`;
}

function subjectForLeader(prefix: string): string {
  return `${prefix}.leader`;
}

function subjectForBroadcast(prefix: string): string {
  return `${prefix}.broadcast`;
}

// ── NATSTransportLayer 实现 ──

/**
 * NATSTransportLayer — 基于 NATS 的高性能跨进程/跨节点通信实现。
 *
 * Subject 设计：
 * - Coordinator → Worker:  {prefix}.worker.{workerId}
 * - Worker → Leader:       {prefix}.leader
 * - 广播:                  {prefix}.broadcast
 *
 * 相比 Redis Pub/Sub 的优势：
 * - 更低的消息延迟（微秒级 vs 毫秒级）
 * - 内置的集群和负载均衡
 * - 无需额外的有状态中间件（NATS 服务端是轻量级的）
 * - 更好的消息路由能力（subject 层级通配符）
 */
export class NATSTransportLayer implements TransportLayer {
  private readonly prefix: string;
  private readonly serverConfig: {
    servers: string | string[];
    token?: string;
    user?: string;
    pass?: string;
  };

  /** NATS 连接实例 */
  private nc: NatsConnection | null = null;
  private connected = false;

  /** 编解码器 */
  private readonly codec = StringCodec();

  /** Worker 端消息处理器 (workerId → handler) */
  private workerHandlers: Map<string, (message: CoordinatorMessage) => void> = new Map();
  /** Leader 端消息处理器 */
  private leaderHandler: ((message: WorkerMessage) => void) | null = null;

  /** 已注册的 Worker ID 集合 */
  private registeredWorkers: Set<string> = new Set();

  /** 活跃的订阅对象 (subject → Subscription) */
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(config: NATSTransportConfig = {}) {
    this.prefix = config.prefix ?? DEFAULT_PREFIX;
    this.serverConfig = {
      servers: config.servers ?? 'nats://127.0.0.1:4222',
      token: config.token,
      user: config.user,
      pass: config.pass,
    };
  }

  // ── 连接生命周期 ──

  /** 建立 NATS 连接 */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.nc = await connect({
      servers: this.serverConfig.servers,
      token: this.serverConfig.token,
      user: this.serverConfig.user,
      pass: this.serverConfig.pass,
    });

    this.connected = true;
  }

  /** 断开 NATS 连接并清理资源 */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    this.connected = false;

    // 取消所有订阅
    for (const sub of this.subscriptions.values()) {
      sub.unsubscribe();
    }
    this.subscriptions.clear();

    // 排空并关闭连接
    if (this.nc) {
      await this.nc.drain();
      this.nc = null;
    }

    this.workerHandlers.clear();
    this.leaderHandler = null;
    this.registeredWorkers.clear();
  }

  // ── TransportLayer 接口实现 ──

  async sendToWorker(workerId: string, message: CoordinatorMessage): Promise<void> {
    this.ensureConnected();
    const subject = subjectForWorker(this.prefix, workerId);
    const payload = this.serialize(message);
    this.nc!.publish(subject, this.codec.encode(payload));
  }

  async broadcastToWorkers(message: CoordinatorMessage): Promise<void> {
    this.ensureConnected();
    const subject = subjectForBroadcast(this.prefix);
    const payload = this.serialize(message);
    this.nc!.publish(subject, this.codec.encode(payload));
  }

  async sendToLeader(message: WorkerMessage): Promise<void> {
    this.ensureConnected();
    const subject = subjectForLeader(this.prefix);
    const payload = this.serialize(message);
    this.nc!.publish(subject, this.codec.encode(payload));
  }

  onWorkerMessage(workerId: string, handler: (message: CoordinatorMessage) => void): void {
    this.workerHandlers.set(workerId, handler);

    // 订阅该 Worker 的专属 subject
    const workerSubject = subjectForWorker(this.prefix, workerId);
    this.ensureSubscription(workerSubject, (raw: string) => {
      try {
        const msg = this.deserialize(raw) as CoordinatorMessage;
        const h = this.workerHandlers.get(workerId);
        if (h) h(msg);
      } catch (err) {
        console.error(`[NATSTransport] Failed to process message on ${workerSubject}:`, err);
      }
    });

    // 订阅广播 subject（幂等）
    const broadcastSubject = subjectForBroadcast(this.prefix);
    this.ensureSubscription(broadcastSubject, (raw: string) => {
      try {
        const msg = this.deserialize(raw) as CoordinatorMessage;
        for (const h of this.workerHandlers.values()) {
          h(msg);
        }
      } catch (err) {
        console.error(`[NATSTransport] Failed to process broadcast message:`, err);
      }
    });
  }

  onLeaderMessage(handler: (message: WorkerMessage) => void): void {
    this.leaderHandler = handler;

    // 订阅 leader subject
    const leaderSubject = subjectForLeader(this.prefix);
    this.ensureSubscription(leaderSubject, (raw: string) => {
      try {
        const msg = this.deserialize(raw) as WorkerMessage;
        if (this.leaderHandler) {
          this.leaderHandler(msg);
        }
      } catch (err) {
        console.error(`[NATSTransport] Failed to process leader message:`, err);
      }
    });
  }

  registerWorker(workerId: string): void {
    this.ensureConnected();
    this.registeredWorkers.add(workerId);
  }

  unregisterWorker(workerId: string): void {
    this.workerHandlers.delete(workerId);
    this.registeredWorkers.delete(workerId);

    // 取消该 Worker 的专属 subject 订阅
    const workerSubject = subjectForWorker(this.prefix, workerId);
    this.removeSubscription(workerSubject);
  }

  getRegisteredWorkerIds(): string[] {
    return [...this.registeredWorkers];
  }

  // ── 内部方法 ──

  /** 确保指定 subject 有且仅有一个订阅（幂等） */
  private ensureSubscription(subject: string, handler: (raw: string) => void): void {
    if (this.subscriptions.has(subject)) return;
    if (!this.nc || !this.connected) return;

    const sub = this.nc.subscribe(subject);
    this.subscriptions.set(subject, sub);

    // 异步迭代消息
    (async () => {
      try {
        for await (const msg of sub) {
          handler(this.codec.decode(msg.data));
        }
      } catch {
        // 订阅关闭时正常退出
      }
    })();
  }

  /** 移除指定 subject 的订阅 */
  private removeSubscription(subject: string): void {
    const sub = this.subscriptions.get(subject);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(subject);
    }
  }

  private serialize(message: CoordinatorMessage | WorkerMessage): string {
    return JSON.stringify(message);
  }

  private deserialize(raw: string): CoordinatorMessage | WorkerMessage {
    return JSON.parse(raw) as CoordinatorMessage | WorkerMessage;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('[NATSTransport] Not connected. Call connect() first.');
    }
  }
}
