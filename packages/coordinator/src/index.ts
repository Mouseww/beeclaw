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
} from './types.js';

// 核心类
export { TickCoordinator } from './TickCoordinator.js';
export { AgentPartitioner } from './AgentPartitioner.js';
export { EventRelay } from './EventRelay.js';
export { Worker } from './Worker.js';
export type { AgentExecutor } from './Worker.js';

// 通信层
export type { TransportLayer } from './TransportLayer.js';
export { InProcessTransport } from './TransportLayer.js';
