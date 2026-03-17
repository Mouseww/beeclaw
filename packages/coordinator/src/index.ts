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
  WorkerTickResultMessage,
  WorkerReadyMessage,
  WorkerErrorMessage,
  PartitionAssignment,
  DistributedTickResult,
  CoordinatorConfig,
  WorkerConfig,
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
export { Worker } from './Worker.js';
export type { AgentExecutor } from './Worker.js';

// Social Graph 跨节点同步
export { SocialGraphSync } from './SocialGraphSync.js';
export type { SocialGraphTransport, LocalSocialGraph } from './SocialGraphSync.js';

// 通信层
export type { TransportLayer } from './TransportLayer.js';
export { InProcessTransport } from './TransportLayer.js';
export { RedisTransportLayer } from './RedisTransportLayer.js';
export type { RedisTransportConfig } from './RedisTransportLayer.js';
