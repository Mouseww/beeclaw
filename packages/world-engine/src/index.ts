// ============================================================================
// @beeclaw/world-engine — 公共 API 导出
// ============================================================================

export { WorldEngine } from './WorldEngine.js';
export type { WorldEngineOptions, TickResult } from './WorldEngine.js';
export { WorldStateManager } from './WorldState.js';
export { TickScheduler } from './TickScheduler.js';
export type { TickSchedulerOptions } from './TickScheduler.js';
export { NaturalSelection } from './NaturalSelection.js';
export type {
  NaturalSelectionConfig,
  SelectionResult,
  SelectionRecord,
  SelectionReason,
  NaturalSelectionEvent,
} from './NaturalSelection.js';
export { ScenarioRunner } from './ScenarioRunner.js';
export type {
  ScenarioRunnerOptions,
  ScenarioStatus,
  ScenarioSummary,
} from './ScenarioRunner.js';
export { AgentActivationPool } from './AgentActivationPool.js';
export type { ActivationPoolConfig, ActivationResult } from './AgentActivationPool.js';
