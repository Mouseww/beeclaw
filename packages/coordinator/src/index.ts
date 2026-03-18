// ============================================================================
// Coordinator 包统一导出
// ============================================================================

// 类型
export type {
  WorkerInfo,
  CoordinatorMessage,
  WorkerMessage,
  TickBeginMessage,
  TickAbortMessage,
  AssignAgentsMessage,
  RequestSnapshotsMessage,
  WorkerTickResultMessage,
  WorkerReadyMessage,
  WorkerErrorMessage,
  WorkerSnapshotReportMessage,
  PartitionAssignment,
  DistributedTickResult,
  CoordinatorConfig,
  WorkerConfig,
  // Agent 状态快照
  AgentStateSnapshot,
  AgentChangedField,
  WorkerTickResultWithSnapshots,
  // Social Graph 同步类型
  SocialGraphSyncMessage,
  SocialGraphNodeAddedMessage,
  SocialGraphNodeRemovedMessage,
  SocialGraphEdgeAddedMessage,
  SocialGraphEdgeRemovedMessage,
  SocialGraphFullSyncRequestMessage,
  SocialGraphFullSyncResponseMessage,
  SocialGraphQueryRequestMessage,
  SocialGraphQueryResponseMessage,
  SocialGraphSyncConfig,
} from './types.js';

// 核心类
export { TickCoordinator } from './TickCoordinator.js';
export { AgentPartitioner } from './AgentPartitioner.js';
export { EventRelay } from './EventRelay.js';
export { Worker, isSnapshotProvider } from './Worker.js';
export type { AgentExecutor, SnapshotProvider, WorkerConfigWithSnapshot } from './Worker.js';
export { RuntimeAgentExecutor } from './RuntimeAgentExecutor.js';
export type { RuntimeAgentExecutorConfig } from './RuntimeAgentExecutor.js';

// Social Graph 跨节点同步
export { SocialGraphSync } from './SocialGraphSync.js';
export type { SocialGraphTransport, LocalSocialGraph } from './SocialGraphSync.js';

// 通信层
export type { TransportLayer } from './TransportLayer.js';
export { InProcessTransport } from './TransportLayer.js';
export { RedisTransportLayer } from './RedisTransportLayer.js';
export type { RedisTransportConfig } from './RedisTransportLayer.js';
export { NATSTransportLayer } from './NATSTransportLayer.js';
export type { NATSTransportConfig } from './NATSTransportLayer.js';
