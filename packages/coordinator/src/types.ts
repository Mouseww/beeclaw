// ============================================================================
// Coordinator Types — 分布式协调层类型定义
// ============================================================================

import type { WorldEvent, ConsensusSignal, SocialRole, RelationType, BeeAgent } from '@beeclaw/shared';
import type { AgentResponseRecord } from '@beeclaw/consensus';

// ── Worker 标识 ──

export interface WorkerInfo {
  id: string;
  status: 'online' | 'offline' | 'unhealthy';
  agentCount: number;
  /** 连续超时次数 */
  consecutiveTimeouts: number;
  lastHeartbeat: number;
}

// ── 消息协议 ──

/** Coordinator → Worker 的消息 */
export type CoordinatorMessage =
  | TickBeginMessage
  | TickAbortMessage
  | AssignAgentsMessage
  | RequestSnapshotsMessage;

/** Worker → Coordinator 的消息 */
export type WorkerMessage =
  | WorkerTickResultMessage
  | WorkerReadyMessage
  | WorkerErrorMessage
  | WorkerSnapshotReportMessage;

export interface TickBeginMessage {
  type: 'tick_begin';
  tick: number;
  events: WorldEvent[];
  timestamp: number;
}

export interface TickAbortMessage {
  type: 'tick_abort';
  tick: number;
  reason: string;
}

export interface AssignAgentsMessage {
  type: 'assign_agents';
  agentIds: string[];
}

export interface WorkerTickResultMessage {
  type: 'worker_tick_result';
  workerId: string;
  tick: number;
  responses: AgentResponseRecord[];
  newEvents: WorldEvent[];
  agentsActivated: number;
  durationMs: number;
}

export interface WorkerReadyMessage {
  type: 'worker_ready';
  workerId: string;
}

export interface WorkerErrorMessage {
  type: 'worker_error';
  workerId: string;
  tick: number;
  error: string;
}

/** Coordinator → Worker: 请求上报 Agent 状态快照 */
export interface RequestSnapshotsMessage {
  type: 'request_snapshots';
  /** 指定要上报的 Agent ID 列表，空数组表示所有 */
  agentIds: string[];
  /** 关联的 tick 编号（通常是刚完成的 tick） */
  tick: number;
}

// ── Agent 状态快照 ──

/**
 * AgentStateSnapshot — Agent 执行后的状态快照。
 *
 * 用于 Worker 侧导出 Agent 最新状态（记忆、观点、信誉等），
 * 上报给 Coordinator 进行持久化或汇总。
 *
 * 设计原则：
 * - 包含完整的 BeeAgent 序列化数据，可直接用于落盘或恢复
 * - 附带元信息（快照时间、关联 tick、来源 Worker）
 * - changedFields 标记本次 tick 中变化的字段，支持增量更新场景
 */
export interface AgentStateSnapshot {
  /** Agent 的完整序列化数据 */
  agentData: BeeAgent;
  /** 快照产生的 tick 编号 */
  tick: number;
  /** 快照产生时的时间戳 */
  timestamp: number;
  /** 来源 Worker ID */
  workerId: string;
  /** 本次 tick 中变化的字段列表（用于增量更新） */
  changedFields: AgentChangedField[];
}

/** Agent 可追踪变化的字段 */
export type AgentChangedField =
  | 'memory.shortTerm'
  | 'memory.longTerm'
  | 'memory.opinions'
  | 'memory.predictions'
  | 'credibility'
  | 'influence'
  | 'status'
  | 'lastActiveTick'
  | 'followers'
  | 'following';

/** Worker → Coordinator: 上报 Agent 状态快照 */
export interface WorkerSnapshotReportMessage {
  type: 'worker_snapshot_report';
  workerId: string;
  tick: number;
  snapshots: AgentStateSnapshot[];
  /** 快照生成耗时（毫秒） */
  durationMs: number;
}

// ── WorkerTickResult 扩展 ──

/**
 * 扩展的 Tick 结果 — 附带 Agent 状态快照。
 * Worker 可在 tick 结果中直接附带已激活 Agent 的快照。
 */
export interface WorkerTickResultWithSnapshots extends WorkerTickResultMessage {
  /** 本 tick 中被激活并执行的 Agent 状态快照 */
  agentSnapshots: AgentStateSnapshot[];
}

// ── 分片 ──

export interface PartitionAssignment {
  workerId: string;
  agentIds: string[];
}

// ── Tick 协调结果 ──

export interface DistributedTickResult {
  tick: number;
  eventsProcessed: number;
  totalAgentsActivated: number;
  totalResponses: number;
  workerResults: WorkerTickResultMessage[];
  signals: ConsensusSignal[];
  collectedNewEvents: WorldEvent[];
  durationMs: number;
  /** 超时的 Worker 列表 */
  timedOutWorkers: string[];
  /** 各 Worker 上报的 Agent 状态快照 */
  agentSnapshots: AgentStateSnapshot[];
}

// ── 配置 ──

export interface CoordinatorConfig {
  /** Worker 上报超时（毫秒），默认 30000 */
  workerTimeoutMs: number;
  /** 连续超时多少次标记 Worker 为不健康，默认 3 */
  unhealthyThreshold: number;
}

export interface WorkerConfig {
  /** Worker 唯一标识 */
  id: string;
}

// ── Social Graph 跨节点同步 ──

/** Social Graph 同步消息类型 */
export type SocialGraphSyncMessage =
  | SocialGraphNodeAddedMessage
  | SocialGraphNodeRemovedMessage
  | SocialGraphEdgeAddedMessage
  | SocialGraphEdgeRemovedMessage
  | SocialGraphFullSyncRequestMessage
  | SocialGraphFullSyncResponseMessage
  | SocialGraphQueryRequestMessage
  | SocialGraphQueryResponseMessage;

export interface SocialGraphNodeAddedMessage {
  type: 'sg_node_added';
  agentId: string;
  influence: number;
  community: string;
  role: SocialRole;
  sourceNodeId: string;
  timestamp: number;
}

export interface SocialGraphNodeRemovedMessage {
  type: 'sg_node_removed';
  agentId: string;
  sourceNodeId: string;
  timestamp: number;
}

export interface SocialGraphEdgeAddedMessage {
  type: 'sg_edge_added';
  from: string;
  to: string;
  edgeType: RelationType;
  strength: number;
  formedAtTick: number;
  sourceNodeId: string;
  timestamp: number;
}

export interface SocialGraphEdgeRemovedMessage {
  type: 'sg_edge_removed';
  from: string;
  to: string;
  sourceNodeId: string;
  timestamp: number;
}

export interface SocialGraphFullSyncRequestMessage {
  type: 'sg_full_sync_request';
  requesterId: string;
  timestamp: number;
}

export interface SocialGraphFullSyncResponseMessage {
  type: 'sg_full_sync_response';
  nodes: Array<{ agentId: string; influence: number; community: string; role: SocialRole }>;
  edges: Array<{ from: string; to: string; edgeType: RelationType; strength: number; formedAtTick: number }>;
  sourceNodeId: string;
  timestamp: number;
}

export interface SocialGraphQueryRequestMessage {
  type: 'sg_query_request';
  queryId: string;
  queryType: 'neighbors' | 'followers' | 'following' | 'node' | 'edge';
  agentId: string;
  /** 用于 edge 查询的目标 agentId */
  targetAgentId?: string;
  requesterId: string;
  timestamp: number;
}

export interface SocialGraphQueryResponseMessage {
  type: 'sg_query_response';
  queryId: string;
  result: unknown;
  sourceNodeId: string;
  timestamp: number;
}

/** Social Graph 同步配置 */
export interface SocialGraphSyncConfig {
  /** 当前节点 ID */
  nodeId: string;
  /** 发布变更的 channel 前缀，默认 'beeclaw:sg' */
  channelPrefix?: string;
  /** 是否为主写节点（coordinator 角色），默认 false */
  isPrimary?: boolean;
  /** 远程查询超时（毫秒），默认 5000 */
  queryTimeoutMs?: number;
}
