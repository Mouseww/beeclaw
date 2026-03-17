// ============================================================================
// RedisTransportLayer — 基于 Redis Pub/Sub 的跨进程通信层实现
// ============================================================================

import { Redis } from 'ioredis';
import type { TransportLayer } from './TransportLayer.js';
import type { CoordinatorMessage, WorkerMessage } from './types.js';

// ── 配置 ──

/** Redis 连接配置 */
export interface RedisTransportConfig {
  /** Redis 主机地址，默认 '127.0.0.1' */
  host?: string;
  /** Redis 端口，默认 6379 */
  port?: number;
  /** Redis 认证密码 */
  password?: string;
  /** Redis 数据库编号，默认 0 */
  db?: number;
  /** Channel 前缀，默认 'beeclaw'（支持多集群隔离） */
  prefix?: string;
}

// ── Channel 命名常量 ──

const DEFAULT_PREFIX = 'beeclaw';

function channelForWorker(prefix: string, workerId: string): string {
  return `${prefix}:worker:${workerId}`;
}

function channelForLeader(prefix: string): string {
  return `${prefix}:leader`;
}

function channelForBroadcast(prefix: string): string {
  return `${prefix}:broadcast`;
}

function workerSetKey(prefix: string): string {
  return `${prefix}:workers`;
}

// ── RedisTransportLayer 实现 ──

/**
 * RedisTransportLayer — 基于 Redis Pub/Sub 的跨进程/跨节点通信实现。
 *
 * Channel 设计：
 * - Coordinator → Worker:  {prefix}:worker:{workerId}
 * - Worker → Leader:       {prefix}:leader
 * - 广播:                  {prefix}:broadcast
 * - Worker 注册表:         {prefix}:workers (Redis Set)
 *
 * 需要两个独立的 Redis 连接：publisher 和 subscriber（ioredis 要求订阅
 * 模式下的连接不能执行其它命令）。
 */
export class RedisTransportLayer implements TransportLayer {
  private readonly config: Required<Pick<RedisTransportConfig, 'host' | 'port' | 'db' | 'prefix'>> & { password?: string };

  /** 用于 publish / set 等常规命令 */
  private publisher: Redis | null = null;
  /** 用于 subscribe 消息监听 */
  private subscriber: Redis | null = null;

  private connected = false;

  /** Worker 端消息处理器 (workerId → handler) */
  private workerHandlers: Map<string, (message: CoordinatorMessage) => void> = new Map();
  /** Leader 端消息处理器 */
  private leaderHandler: ((message: WorkerMessage) => void) | null = null;

  /** 本地缓存的已订阅 channel 集合 */
  private subscribedChannels: Set<string> = new Set();

  constructor(config: RedisTransportConfig = {}) {
    this.config = {
      host: config.host ?? '127.0.0.1',
      port: config.port ?? 6379,
      password: config.password,
      db: config.db ?? 0,
      prefix: config.prefix ?? DEFAULT_PREFIX,
    };
  }

  // ── 连接生命周期 ──

  /** 建立 Redis 连接（publisher + subscriber） */
  async connect(): Promise<void> {
    if (this.connected) return;

    const redisOpts = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      // 禁用自动重连以简化错误处理；生产环境可按需开启
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    };

    this.publisher = new Redis(redisOpts);
    this.subscriber = new Redis(redisOpts);

    await Promise.all([
      this.publisher.connect(),
      this.subscriber.connect(),
    ]);

    // 注册全局消息路由
    this.subscriber.on('message', (channel: string, rawMessage: string) => {
      this.handleIncomingMessage(channel, rawMessage);
    });

    this.connected = true;
  }

  /** 断开 Redis 连接并清理资源 */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    this.connected = false;

    // 取消所有订阅
    if (this.subscriber && this.subscribedChannels.size > 0) {
      await this.subscriber.unsubscribe(...this.subscribedChannels);
      this.subscribedChannels.clear();
    }

    // 关闭连接
    await Promise.all([
      this.publisher?.quit(),
      this.subscriber?.quit(),
    ]);

    this.publisher = null;
    this.subscriber = null;
    this.workerHandlers.clear();
    this.leaderHandler = null;
  }

  // ── TransportLayer 接口实现 ──

  async sendToWorker(workerId: string, message: CoordinatorMessage): Promise<void> {
    this.ensureConnected();
    const channel = channelForWorker(this.config.prefix, workerId);
    const payload = this.serialize(message);
    await this.publisher!.publish(channel, payload);
  }

  async broadcastToWorkers(message: CoordinatorMessage): Promise<void> {
    this.ensureConnected();
    const channel = channelForBroadcast(this.config.prefix);
    const payload = this.serialize(message);
    await this.publisher!.publish(channel, payload);
  }

  async sendToLeader(message: WorkerMessage): Promise<void> {
    this.ensureConnected();
    const channel = channelForLeader(this.config.prefix);
    const payload = this.serialize(message);
    await this.publisher!.publish(channel, payload);
  }

  onWorkerMessage(workerId: string, handler: (message: CoordinatorMessage) => void): void {
    this.workerHandlers.set(workerId, handler);

    // 订阅该 Worker 的专属 channel 和广播 channel
    const workerChannel = channelForWorker(this.config.prefix, workerId);
    const broadcastChannel = channelForBroadcast(this.config.prefix);

    this.subscribeChannel(workerChannel);
    this.subscribeChannel(broadcastChannel);
  }

  onLeaderMessage(handler: (message: WorkerMessage) => void): void {
    this.leaderHandler = handler;

    // 订阅 leader channel
    const leaderChannel = channelForLeader(this.config.prefix);
    this.subscribeChannel(leaderChannel);
  }

  registerWorker(workerId: string): void {
    this.ensureConnected();
    // 异步添加到 Redis Set，不阻塞调用方
    this.publisher!.sadd(workerSetKey(this.config.prefix), workerId).catch((err: unknown) => {
      console.error(`[RedisTransport] Failed to register worker ${workerId}:`, err);
    });
  }

  unregisterWorker(workerId: string): void {
    this.workerHandlers.delete(workerId);

    // 取消该 Worker 的专属 channel 订阅
    const workerChannel = channelForWorker(this.config.prefix, workerId);
    this.unsubscribeChannel(workerChannel);

    if (!this.connected || !this.publisher) return;

    // 从 Redis Set 中移除
    this.publisher.srem(workerSetKey(this.config.prefix), workerId).catch((err: unknown) => {
      console.error(`[RedisTransport] Failed to unregister worker ${workerId}:`, err);
    });
  }

  getRegisteredWorkerIds(): string[] {
    // 注意：这是同步方法，返回本地缓存的 handler keys
    // 真正的完整列表需要异步查询 Redis Set
    return [...this.workerHandlers.keys()];
  }

  /**
   * 异步获取所有已注册 Worker ID（从 Redis Set 查询）。
   * 用于跨进程场景下获取全局 Worker 列表。
   */
  async getRegisteredWorkerIdsAsync(): Promise<string[]> {
    this.ensureConnected();
    return this.publisher!.smembers(workerSetKey(this.config.prefix));
  }

  // ── 内部方法 ──

  /** 路由收到的 Pub/Sub 消息到对应 handler */
  private handleIncomingMessage(channel: string, rawMessage: string): void {
    try {
      const message = this.deserialize(rawMessage);

      const prefix = this.config.prefix;

      // Leader channel: Worker → Leader
      if (channel === channelForLeader(prefix)) {
        if (this.leaderHandler) {
          this.leaderHandler(message as WorkerMessage);
        }
        return;
      }

      // Broadcast channel: 分发到所有 Worker handler
      if (channel === channelForBroadcast(prefix)) {
        for (const handler of this.workerHandlers.values()) {
          handler(message as CoordinatorMessage);
        }
        return;
      }

      // Worker 专属 channel: 提取 workerId 并分发
      const workerPrefix = `${prefix}:worker:`;
      if (channel.startsWith(workerPrefix)) {
        const workerId = channel.slice(workerPrefix.length);
        const handler = this.workerHandlers.get(workerId);
        if (handler) {
          handler(message as CoordinatorMessage);
        }
      }
    } catch (err) {
      console.error(`[RedisTransport] Failed to process message on channel ${channel}:`, err);
    }
  }

  /** 订阅 channel（幂等） */
  private subscribeChannel(channel: string): void {
    if (this.subscribedChannels.has(channel)) return;
    if (!this.subscriber || !this.connected) return;

    this.subscribedChannels.add(channel);
    this.subscriber.subscribe(channel).catch((err: unknown) => {
      console.error(`[RedisTransport] Failed to subscribe to ${channel}:`, err);
      this.subscribedChannels.delete(channel);
    });
  }

  /** 取消订阅 channel */
  private unsubscribeChannel(channel: string): void {
    if (!this.subscribedChannels.has(channel)) return;
    if (!this.subscriber || !this.connected) return;

    this.subscribedChannels.delete(channel);
    this.subscriber.unsubscribe(channel).catch((err: unknown) => {
      console.error(`[RedisTransport] Failed to unsubscribe from ${channel}:`, err);
    });
  }

  private serialize(message: CoordinatorMessage | WorkerMessage): string {
    return JSON.stringify(message);
  }

  private deserialize(raw: string): CoordinatorMessage | WorkerMessage {
    return JSON.parse(raw) as CoordinatorMessage | WorkerMessage;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('[RedisTransport] Not connected. Call connect() first.');
    }
  }
}
