// ============================================================================
// BeeClaw Server — 持久化层：数据库适配器接口
// 定义所有数据库操作的通用合约，支持 SQLite / PostgreSQL 等多驱动切换
// ============================================================================

import type { ConsensusSignal, LLMConfig, ModelTier, ModelRouterConfig, WebhookSubscription, WebhookEventType } from '@beeclaw/shared';
import type { Agent } from '@beeclaw/agent-runtime';
import type { TickResult, TickEventSummary, TickResponseSummary } from '@beeclaw/world-engine';
import type { FeedSource } from '@beeclaw/event-ingestion';
import type { AgentRow, ApiKeyEntry, ApiKeyRecord } from './store.js';

/**
 * DatabaseAdapter — 持久化层通用接口
 *
 * 所有数据库驱动（SQLite、PostgreSQL 等）必须实现此接口。
 * 上层代码仅依赖此接口，不直接耦合具体驱动。
 */
export interface DatabaseAdapter {

  // ── 世界状态 KV ──

  /** 获取世界状态键值 */
  getState(key: string): string | undefined;

  /** 设置世界状态键值 */
  setState(key: string, value: string): void;

  /** 获取当前 tick 编号 */
  getTick(): number;

  /** 设置当前 tick 编号 */
  setTick(tick: number): void;

  // ── Agents ──

  /** 保存单个 Agent */
  saveAgent(agent: Agent): void;

  /** 批量保存 Agent（事务性） */
  saveAgents(agents: Agent[]): void;

  /** 加载所有 Agent 行数据 */
  loadAgentRows(): AgentRow[];

  /** 获取单个 Agent 行数据 */
  getAgentRow(id: string): AgentRow | undefined;

  /** 分页获取 Agent 行数据 */
  getAgentRows(page: number, size: number): { rows: AgentRow[]; total: number };

  // ── Tick 历史 ──

  /** 保存 Tick 执行结果 */
  saveTickResult(result: TickResult): void;

  /** 获取 Tick 历史记录（降序） */
  getTickHistory(limit?: number): TickResult[];

  // ── 共识信号 ──

  /** 保存共识信号 */
  saveConsensusSignal(signal: ConsensusSignal): void;

  /** 获取最新共识信号 */
  getLatestSignals(limit?: number): ConsensusSignal[];

  /** 按 topic 获取共识信号 */
  getSignalsByTopic(topic: string, limit?: number): ConsensusSignal[];

  // ── LLM 配置 ──

  /** 保存单个 tier 的 LLM 配置 */
  saveLLMConfig(tier: ModelTier, config: LLMConfig): void;

  /** 保存所有 tier 的 LLM 配置 */
  saveLLMConfigs(configs: ModelRouterConfig): void;

  /** 加载所有 LLM 配置 */
  loadLLMConfigs(): ModelRouterConfig | null;

  /** 加载单个 tier 的 LLM 配置 */
  loadLLMConfig(tier: ModelTier): LLMConfig | null;

  // ── Webhook 订阅 ──

  /** 创建 webhook 订阅 */
  createWebhook(sub: WebhookSubscription): void;

  /** 获取所有 webhook 订阅 */
  getWebhooks(): WebhookSubscription[];

  /** 获取单个 webhook 订阅 */
  getWebhook(id: string): WebhookSubscription | null;

  /** 更新 webhook 订阅 */
  updateWebhook(id: string, updates: { url?: string; events?: WebhookEventType[]; active?: boolean }): boolean;

  /** 删除 webhook 订阅 */
  deleteWebhook(id: string): boolean;

  /** 获取所有活跃的指定事件类型的 webhook */
  getActiveWebhooksForEvent(eventType: WebhookEventType): WebhookSubscription[];

  // ── 事件持久化 ──

  /** 保存 Tick 事件 */
  saveEvents(events: TickEventSummary[], tick: number): void;

  /** 获取某个 Tick 的所有事件 */
  getEventsByTick(tick: number): TickEventSummary[];

  /** 搜索事件（标题模糊匹配） */
  searchEvents(query: string, limit?: number): TickEventSummary[];

  // ── Agent 响应持久化 ──

  /** 保存 Tick Agent 响应 */
  saveResponses(responses: TickResponseSummary[], tick: number): void;

  /** 获取某个 Tick 的所有 Agent 响应 */
  getResponsesByTick(tick: number): TickResponseSummary[];

  /** 获取某个事件的所有 Agent 响应 */
  getResponsesByEvent(eventId: string): TickResponseSummary[];

  // ── RSS 数据源 ──

  /** 保存 RSS 数据源配置 */
  saveRssSource(source: FeedSource): void;

  /** 批量保存 RSS 数据源配置 */
  saveRssSources(sources: FeedSource[]): void;

  /** 加载所有 RSS 数据源配置 */
  loadRssSources(): FeedSource[];

  /** 获取单个 RSS 数据源配置 */
  getRssSource(id: string): FeedSource | null;

  /** 删除 RSS 数据源配置 */
  deleteRssSource(id: string): boolean;

  // ── API Key 管理 ──

  /** 创建 API Key 记录 */
  createApiKey(entry: ApiKeyEntry): void;

  /** 获取所有 API Key 记录 */
  getApiKeys(): ApiKeyRecord[];

  /** 通过 key_hash 查找 API Key */
  getApiKeyByHash(keyHash: string): ApiKeyRecord | null;

  /** 更新 API Key 最后使用时间 */
  touchApiKey(id: string): void;

  /** 删除 API Key */
  deleteApiKey(id: string): boolean;

  /** 获取所有活跃 API Key 的哈希集合 */
  getActiveApiKeyHashes(): Set<string>;
}
