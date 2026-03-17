// ============================================================================
// Coordinator Types — 分布式协调层类型定义
// ============================================================================

import type { WorldEvent, AgentResponse, ConsensusSignal } from '@beeclaw/shared';
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
  | AssignAgentsMessage;

/** Worker → Coordinator 的消息 */
export type WorkerMessage =
  | WorkerTickResultMessage
  | WorkerReadyMessage
  | WorkerErrorMessage;

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
