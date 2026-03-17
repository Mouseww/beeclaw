// ============================================================================
// SocialGraphSync — Social Graph 跨节点同步模块
//
// 职责：
// - 监听本地 SocialGraph 变更，广播到其他节点
// - 接收远程节点的变更事件，应用到本地只读副本
// - 支持全量同步（节点新加入时拉取完整图）
// - 支持跨节点关系查询（通过 request/response 协议）
//
// 设计原则：
// - 写操作通过 primary 节点路由（SRP）
// - 只读副本最终一致性（通过 Pub/Sub 广播实现）
// - 通过 TransportLayer 解耦传输实现（DIP）
// ============================================================================

import type { SocialNode, SocialEdge, SocialRole, RelationType } from '@beeclaw/shared';
import type {
  SocialGraphSyncConfig,
  SocialGraphSyncMessage,
  SocialGraphFullSyncResponseMessage,
  SocialGraphQueryResponseMessage,
} from './types.js';

// ── 同步层使用的传输接口（仅需 publish/subscribe 能力） ──

/**
 * SocialGraphTransport — SocialGraphSync 所需的传输层抽象。
 *
 * 与 TransportLayer 解耦：SocialGraphSync 仅需 pub/sub 能力，
 * 不依赖完整的 Worker 通信协议。
 */
export interface SocialGraphTransport {
  /** 发布消息到指定 channel */
  publish(channel: string, payload: string): Promise<void>;
  /** 订阅 channel 并注册消息回调 */
  subscribe(channel: string, handler: (payload: string) => void): Promise<void>;
  /** 取消订阅 channel */
  unsubscribe(channel: string): Promise<void>;
}

// ── 本地图访问接口 ──

/**
 * LocalSocialGraph — SocialGraphSync 对本地 SocialGraph 的最小依赖接口。
 *
 * 遵循 ISP（接口隔离原则），仅暴露同步所需的方法。
 */
export interface LocalSocialGraph {
  addNode(agentId: string, influence: number, community: string, role: SocialRole): void;
  removeNode(agentId: string): void;
  getNode(agentId: string): SocialNode | undefined;
  getAllNodes(): SocialNode[];
  addEdge(from: string, to: string, type: RelationType, strength: number, tick: number): void;
  removeEdge(from: string, to: string): void;
  getAllEdges(): SocialEdge[];
  getNeighbors(agentId: string): string[];
  getFollowers(agentId: string): string[];
  getFollowing(agentId: string): string[];
  getEdge(from: string, to: string): SocialEdge | undefined;
}

// ── SocialGraphSync 实现 ──

const DEFAULT_CHANNEL_PREFIX = 'beeclaw:sg';
const DEFAULT_QUERY_TIMEOUT_MS = 5000;

/**
 * SocialGraphSync — 跨节点 Social Graph 同步协调器。
 *
 * 架构模型：
 * - 每个节点维护完整的 SocialGraph 只读副本
 * - 写入只在 primary 节点执行，变更通过 Pub/Sub 广播
 * - 非 primary 节点的写入请求通过 primary 路由
 * - 支持全量同步和增量同步
 */
export class SocialGraphSync {
  private readonly config: Required<SocialGraphSyncConfig>;
  private transport: SocialGraphTransport | null = null;
  private localGraph: LocalSocialGraph | null = null;
  private started = false;

  /** 广播 channel（所有节点共享） */
  private readonly broadcastChannel: string;
  /** 当前节点的私有 channel（用于点对点查询响应） */
  private readonly nodeChannel: string;

  /** 待处理的查询响应回调 (queryId → resolve) */
  private pendingQueries: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  /** 变更版本号，用于防重放 */
  private version = 0;

  /** 已处理的消息时间戳去重窗口 (sourceNodeId:timestamp) */
  private processedMessages: Set<string> = new Set();
  private readonly deduplicationWindowSize = 5000;

  constructor(config: SocialGraphSyncConfig) {
    this.config = {
      nodeId: config.nodeId,
      channelPrefix: config.channelPrefix ?? DEFAULT_CHANNEL_PREFIX,
      isPrimary: config.isPrimary ?? false,
      queryTimeoutMs: config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
    };

    this.broadcastChannel = `${this.config.channelPrefix}:broadcast`;
    this.nodeChannel = `${this.config.channelPrefix}:node:${this.config.nodeId}`;
  }

  // ── 生命周期 ──

  /**
   * 启动同步模块：绑定传输层和本地图，订阅 channel
   */
  async start(transport: SocialGraphTransport, localGraph: LocalSocialGraph): Promise<void> {
    if (this.started) return;

    this.transport = transport;
    this.localGraph = localGraph;

    // 订阅广播 channel（接收其他节点的变更通知）
    await this.transport.subscribe(this.broadcastChannel, (payload) => {
      this.handleMessage(payload);
    });

    // 订阅本节点私有 channel（接收查询请求和响应）
    await this.transport.subscribe(this.nodeChannel, (payload) => {
      this.handleMessage(payload);
    });

    this.started = true;
  }

  /**
   * 停止同步模块：取消订阅、清理资源
   */
  async stop(): Promise<void> {
    if (!this.started || !this.transport) return;

    // 取消所有待处理的查询
    for (const [queryId, pending] of this.pendingQueries) {
      clearTimeout(pending.timer);
      pending.reject(new Error('SocialGraphSync stopped'));
      this.pendingQueries.delete(queryId);
    }

    await this.transport.unsubscribe(this.broadcastChannel);
    await this.transport.unsubscribe(this.nodeChannel);

    this.transport = null;
    this.localGraph = null;
    this.started = false;
    this.processedMessages.clear();
  }

  /**
   * 是否已启动
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * 获取当前节点 ID
   */
  getNodeId(): string {
    return this.config.nodeId;
  }

  /**
   * 获取当前版本号
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * 是否为 primary 节点
   */
  isPrimary(): boolean {
    return this.config.isPrimary;
  }

  // ── 写操作（仅 primary 执行，广播变更） ──

  /**
   * 广播节点新增事件
   */
  async broadcastNodeAdded(agentId: string, influence: number, community: string, role: SocialRole): Promise<void> {
    this.ensureStarted();
    this.ensurePrimary('broadcastNodeAdded');

    const message: SocialGraphSyncMessage = {
      type: 'sg_node_added',
      agentId,
      influence,
      community,
      role,
      sourceNodeId: this.config.nodeId,
      timestamp: Date.now(),
    };

    this.version++;
    await this.publish(this.broadcastChannel, message);
  }

  /**
   * 广播节点移除事件
   */
  async broadcastNodeRemoved(agentId: string): Promise<void> {
    this.ensureStarted();
    this.ensurePrimary('broadcastNodeRemoved');

    const message: SocialGraphSyncMessage = {
      type: 'sg_node_removed',
      agentId,
      sourceNodeId: this.config.nodeId,
      timestamp: Date.now(),
    };

    this.version++;
    await this.publish(this.broadcastChannel, message);
  }

  /**
   * 广播边新增/更新事件
   */
  async broadcastEdgeAdded(
    from: string,
    to: string,
    edgeType: RelationType,
    strength: number,
    formedAtTick: number,
  ): Promise<void> {
    this.ensureStarted();
    this.ensurePrimary('broadcastEdgeAdded');

    const message: SocialGraphSyncMessage = {
      type: 'sg_edge_added',
      from,
      to,
      edgeType,
      strength,
      formedAtTick,
      sourceNodeId: this.config.nodeId,
      timestamp: Date.now(),
    };

    this.version++;
    await this.publish(this.broadcastChannel, message);
  }

  /**
   * 广播边移除事件
   */
  async broadcastEdgeRemoved(from: string, to: string): Promise<void> {
    this.ensureStarted();
    this.ensurePrimary('broadcastEdgeRemoved');

    const message: SocialGraphSyncMessage = {
      type: 'sg_edge_removed',
      from,
      to,
      sourceNodeId: this.config.nodeId,
      timestamp: Date.now(),
    };

    this.version++;
    await this.publish(this.broadcastChannel, message);
  }

  // ── 全量同步 ──

  /**
   * 请求全量同步（新节点加入时调用）。
   * 向广播 channel 发送请求，等待 primary 节点响应。
   */
  async requestFullSync(): Promise<{ nodes: SocialNode[]; edges: SocialEdge[] }> {
    this.ensureStarted();

    const message: SocialGraphSyncMessage = {
      type: 'sg_full_sync_request',
      requesterId: this.config.nodeId,
      timestamp: Date.now(),
    };

    // 创建 Promise 等待响应
    const queryId = `full_sync_${this.config.nodeId}_${Date.now()}`;

    const result = await new Promise<{ nodes: SocialNode[]; edges: SocialEdge[] }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error(`Full sync request timed out after ${this.config.queryTimeoutMs}ms`));
      }, this.config.queryTimeoutMs);

      this.pendingQueries.set(queryId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.publish(this.broadcastChannel, message).catch((err) => {
        clearTimeout(timer);
        this.pendingQueries.delete(queryId);
        reject(err);
      });
    });

    return result;
  }

  // ── 远程查询 ──

  /**
   * 查询远程节点的邻居列表
   */
  async queryNeighbors(agentId: string, targetNodeId: string): Promise<string[]> {
    return this.sendQuery('neighbors', agentId, targetNodeId) as Promise<string[]>;
  }

  /**
   * 查询远程节点的 followers 列表
   */
  async queryFollowers(agentId: string, targetNodeId: string): Promise<string[]> {
    return this.sendQuery('followers', agentId, targetNodeId) as Promise<string[]>;
  }

  /**
   * 查询远程节点的 following 列表
   */
  async queryFollowing(agentId: string, targetNodeId: string): Promise<string[]> {
    return this.sendQuery('following', agentId, targetNodeId) as Promise<string[]>;
  }

  /**
   * 查询远程节点的特定节点信息
   */
  async queryNode(agentId: string, targetNodeId: string): Promise<SocialNode | null> {
    return this.sendQuery('node', agentId, targetNodeId) as Promise<SocialNode | null>;
  }

  /**
   * 查询远程节点的特定边信息
   */
  async queryEdge(from: string, to: string, targetNodeId: string): Promise<SocialEdge | null> {
    return this.sendQuery('edge', from, targetNodeId, to) as Promise<SocialEdge | null>;
  }

  // ── 内部：消息处理 ──

  private handleMessage(payload: string): void {
    let message: SocialGraphSyncMessage;
    try {
      message = JSON.parse(payload) as SocialGraphSyncMessage;
    } catch {
      console.error('[SocialGraphSync] Failed to parse message:', payload);
      return;
    }

    // 忽略自己发出的消息
    if ('sourceNodeId' in message && message.sourceNodeId === this.config.nodeId) {
      // 但 full_sync_response 和 query_response 需要处理（可能是发给自己的响应）
      if (message.type !== 'sg_full_sync_response' && message.type !== 'sg_query_response') {
        return;
      }
    }

    // 去重
    const deduplicationKey = this.getDeduplicationKey(message);
    if (deduplicationKey && this.processedMessages.has(deduplicationKey)) {
      return;
    }
    if (deduplicationKey) {
      this.processedMessages.add(deduplicationKey);
      this.trimDeduplicationWindow();
    }

    switch (message.type) {
      case 'sg_node_added':
        this.handleNodeAdded(message);
        break;
      case 'sg_node_removed':
        this.handleNodeRemoved(message);
        break;
      case 'sg_edge_added':
        this.handleEdgeAdded(message);
        break;
      case 'sg_edge_removed':
        this.handleEdgeRemoved(message);
        break;
      case 'sg_full_sync_request':
        this.handleFullSyncRequest(message);
        break;
      case 'sg_full_sync_response':
        this.handleFullSyncResponse(message);
        break;
      case 'sg_query_request':
        this.handleQueryRequest(message);
        break;
      case 'sg_query_response':
        this.handleQueryResponse(message);
        break;
    }
  }

  private handleNodeAdded(message: SocialGraphSyncMessage & { type: 'sg_node_added' }): void {
    if (!this.localGraph) return;
    this.localGraph.addNode(message.agentId, message.influence, message.community, message.role);
    this.version++;
  }

  private handleNodeRemoved(message: SocialGraphSyncMessage & { type: 'sg_node_removed' }): void {
    if (!this.localGraph) return;
    this.localGraph.removeNode(message.agentId);
    this.version++;
  }

  private handleEdgeAdded(message: SocialGraphSyncMessage & { type: 'sg_edge_added' }): void {
    if (!this.localGraph) return;
    this.localGraph.addEdge(message.from, message.to, message.edgeType, message.strength, message.formedAtTick);
    this.version++;
  }

  private handleEdgeRemoved(message: SocialGraphSyncMessage & { type: 'sg_edge_removed' }): void {
    if (!this.localGraph) return;
    this.localGraph.removeEdge(message.from, message.to);
    this.version++;
  }

  private handleFullSyncRequest(message: SocialGraphSyncMessage & { type: 'sg_full_sync_request' }): void {
    // 只有 primary 节点响应全量同步请求
    if (!this.config.isPrimary || !this.localGraph || !this.transport) return;

    const nodes = this.localGraph.getAllNodes().map((n) => ({
      agentId: n.agentId,
      influence: n.influence,
      community: n.community,
      role: n.role,
    }));

    const edges = this.localGraph.getAllEdges().map((e) => ({
      from: e.from,
      to: e.to,
      edgeType: e.type,
      strength: e.strength,
      formedAtTick: e.formedAtTick,
    }));

    const response: SocialGraphFullSyncResponseMessage = {
      type: 'sg_full_sync_response',
      nodes,
      edges,
      sourceNodeId: this.config.nodeId,
      timestamp: Date.now(),
    };

    // 发送到请求者的私有 channel
    const requesterChannel = `${this.config.channelPrefix}:node:${message.requesterId}`;
    this.publish(requesterChannel, response).catch((err) => {
      console.error('[SocialGraphSync] Failed to send full sync response:', err);
    });
  }

  private handleFullSyncResponse(message: SocialGraphFullSyncResponseMessage): void {
    if (!this.localGraph) return;

    // 找到对应的 pending query
    const queryId = [...this.pendingQueries.keys()].find((id) => id.startsWith('full_sync_'));
    if (!queryId) return;

    const pending = this.pendingQueries.get(queryId);
    if (!pending) return;

    // 应用全量数据到本地图
    for (const node of message.nodes) {
      this.localGraph.addNode(node.agentId, node.influence, node.community, node.role);
    }
    for (const edge of message.edges) {
      this.localGraph.addEdge(edge.from, edge.to, edge.edgeType, edge.strength, edge.formedAtTick);
    }

    // 构造返回结果
    const nodesResult: SocialNode[] = message.nodes.map((n) => ({
      agentId: n.agentId,
      influence: n.influence,
      community: n.community,
      role: n.role,
    }));

    const edgesResult: SocialEdge[] = message.edges.map((e) => ({
      from: e.from,
      to: e.to,
      type: e.edgeType,
      strength: e.strength,
      formedAtTick: e.formedAtTick,
    }));

    clearTimeout(pending.timer);
    this.pendingQueries.delete(queryId);
    pending.resolve({ nodes: nodesResult, edges: edgesResult });
  }

  private handleQueryRequest(message: SocialGraphSyncMessage & { type: 'sg_query_request' }): void {
    if (!this.localGraph || !this.transport) return;

    let result: unknown;
    switch (message.queryType) {
      case 'neighbors':
        result = this.localGraph.getNeighbors(message.agentId);
        break;
      case 'followers':
        result = this.localGraph.getFollowers(message.agentId);
        break;
      case 'following':
        result = this.localGraph.getFollowing(message.agentId);
        break;
      case 'node':
        result = this.localGraph.getNode(message.agentId) ?? null;
        break;
      case 'edge':
        result = this.localGraph.getEdge(message.agentId, message.targetAgentId ?? '') ?? null;
        break;
      default:
        result = null;
    }

    const response: SocialGraphQueryResponseMessage = {
      type: 'sg_query_response',
      queryId: message.queryId,
      result,
      sourceNodeId: this.config.nodeId,
      timestamp: Date.now(),
    };

    const requesterChannel = `${this.config.channelPrefix}:node:${message.requesterId}`;
    this.publish(requesterChannel, response).catch((err) => {
      console.error('[SocialGraphSync] Failed to send query response:', err);
    });
  }

  private handleQueryResponse(message: SocialGraphQueryResponseMessage): void {
    const pending = this.pendingQueries.get(message.queryId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingQueries.delete(message.queryId);
    pending.resolve(message.result);
  }

  // ── 内部：查询辅助 ──

  private async sendQuery(
    queryType: 'neighbors' | 'followers' | 'following' | 'node' | 'edge',
    agentId: string,
    targetNodeId: string,
    targetAgentId?: string,
  ): Promise<unknown> {
    this.ensureStarted();

    const queryId = `${queryType}_${agentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const message: SocialGraphSyncMessage = {
      type: 'sg_query_request',
      queryId,
      queryType,
      agentId,
      targetAgentId,
      requesterId: this.config.nodeId,
      timestamp: Date.now(),
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error(`Query ${queryType} timed out after ${this.config.queryTimeoutMs}ms`));
      }, this.config.queryTimeoutMs);

      this.pendingQueries.set(queryId, { resolve, reject, timer });

      // 发送到目标节点的私有 channel
      const targetChannel = `${this.config.channelPrefix}:node:${targetNodeId}`;
      this.publish(targetChannel, message).catch((err) => {
        clearTimeout(timer);
        this.pendingQueries.delete(queryId);
        reject(err);
      });
    });
  }

  // ── 内部：工具方法 ──

  private async publish(channel: string, message: SocialGraphSyncMessage): Promise<void> {
    if (!this.transport) {
      throw new Error('[SocialGraphSync] Transport not available');
    }
    await this.transport.publish(channel, JSON.stringify(message));
  }

  private getDeduplicationKey(message: SocialGraphSyncMessage): string | null {
    if (!('sourceNodeId' in message) || !('timestamp' in message)) {
      return null;
    }

    const src = (message as { sourceNodeId: string }).sourceNodeId;
    const ts = (message as { timestamp: number }).timestamp;

    // 包含消息类型和关键标识，避免同一毫秒内不同变更被误判为重复
    switch (message.type) {
      case 'sg_node_added':
        return `${src}:${ts}:${message.type}:${message.agentId}`;
      case 'sg_node_removed':
        return `${src}:${ts}:${message.type}:${message.agentId}`;
      case 'sg_edge_added':
        return `${src}:${ts}:${message.type}:${message.from}:${message.to}`;
      case 'sg_edge_removed':
        return `${src}:${ts}:${message.type}:${message.from}:${message.to}`;
      default:
        return `${src}:${ts}:${message.type}`;
    }
  }

  private trimDeduplicationWindow(): void {
    if (this.processedMessages.size > this.deduplicationWindowSize * 2) {
      const entries = [...this.processedMessages];
      const keep = entries.slice(-this.deduplicationWindowSize);
      this.processedMessages = new Set(keep);
    }
  }

  private ensureStarted(): void {
    if (!this.started) {
      throw new Error('[SocialGraphSync] Not started. Call start() first.');
    }
  }

  private ensurePrimary(operation: string): void {
    if (!this.config.isPrimary) {
      throw new Error(`[SocialGraphSync] Only primary node can execute ${operation}`);
    }
  }
}
