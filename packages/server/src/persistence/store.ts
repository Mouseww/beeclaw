// ============================================================================
// BeeClaw Server — 持久化层：世界状态读写
// ============================================================================

import type Database from 'better-sqlite3';
import type { ConsensusSignal, LLMConfig, ModelTier, ModelRouterConfig, WebhookSubscription, WebhookEventType, EventCategory } from '@beeclaw/shared';
import type { Agent } from '@beeclaw/agent-runtime';
import type { TickResult, TickEventSummary, TickResponseSummary } from '@beeclaw/world-engine';
import type { FeedSource } from '@beeclaw/event-ingestion';
import { generateId } from '@beeclaw/shared';

export class Store {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ── 世界状态 KV ──

  getState(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM world_state WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  setState(key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO world_state (key, value) VALUES (?, ?)')
      .run(key, value);
  }

  getTick(): number {
    return parseInt(this.getState('tick') ?? '0', 10);
  }

  setTick(tick: number): void {
    this.setState('tick', String(tick));
  }

  // ── Agents ──

  saveAgent(agent: Agent): void {
    const data = agent.toData();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO agents
         (id, name, persona, memory, followers, following, influence, credibility, status, model_tier, spawned_at_tick, last_active_tick, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
      )
      .run(
        data.id,
        data.name,
        JSON.stringify(data.persona),
        JSON.stringify(data.memory),
        JSON.stringify(data.followers),
        JSON.stringify(data.following),
        data.influence,
        data.credibility,
        data.status,
        data.modelTier,
        data.spawnedAtTick,
        data.lastActiveTick
      );
  }

  saveAgents(agents: Agent[]): void {
    const tx = this.db.transaction(() => {
      for (const agent of agents) {
        this.saveAgent(agent);
      }
    });
    tx();
  }

  loadAgentRows(): AgentRow[] {
    return this.db.prepare('SELECT * FROM agents').all() as AgentRow[];
  }

  getAgentRow(id: string): AgentRow | undefined {
    return this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined;
  }

  getAgentRows(page: number, size: number): { rows: AgentRow[]; total: number } {
    const total = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM agents').get() as { cnt: number }
    ).cnt;
    const offset = (page - 1) * size;
    const rows = this.db
      .prepare('SELECT * FROM agents ORDER BY influence DESC LIMIT ? OFFSET ?')
      .all(size, offset) as AgentRow[];
    return { rows, total };
  }

  // ── Tick 历史 ──

  saveTickResult(result: TickResult): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tick_history
         (tick, events_processed, agents_activated, responses_collected, new_agents_spawned, signals, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.tick,
        result.eventsProcessed,
        result.agentsActivated,
        result.responsesCollected,
        result.newAgentsSpawned,
        result.signals,
        result.durationMs
      );
  }

  getTickHistory(limit = 50): TickResult[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM tick_history ORDER BY tick DESC LIMIT ?'
      )
      .all(limit) as TickHistoryRow[];
    return rows.map(r => ({
      tick: r.tick,
      eventsProcessed: r.events_processed,
      agentsActivated: r.agents_activated,
      responsesCollected: r.responses_collected,
      newAgentsSpawned: r.new_agents_spawned,
      signals: r.signals,
      durationMs: r.duration_ms,
      timestamp: new Date(r.created_at * 1000).toISOString(),
    }));
  }

  // ── 共识信号 ──

  saveConsensusSignal(signal: ConsensusSignal): void {
    this.db
      .prepare(
        'INSERT INTO consensus_signals (tick, topic, data) VALUES (?, ?, ?)'
      )
      .run(signal.tick, signal.topic, JSON.stringify(signal));
  }

  getLatestSignals(limit = 20): ConsensusSignal[] {
    const rows = this.db
      .prepare('SELECT data FROM consensus_signals ORDER BY id DESC LIMIT ?')
      .all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as ConsensusSignal);
  }

  getSignalsByTopic(topic: string, limit = 20): ConsensusSignal[] {
    const rows = this.db
      .prepare('SELECT data FROM consensus_signals WHERE topic = ? ORDER BY id DESC LIMIT ?')
      .all(topic, limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as ConsensusSignal);
  }

  // ── LLM 配置持久化 ──

  /** 保存单个 tier 的 LLM 配置 */
  saveLLMConfig(tier: ModelTier, config: LLMConfig): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO llm_config
         (tier, base_url, api_key, model, max_tokens, temperature, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
      )
      .run(
        tier,
        config.baseURL,
        config.apiKey,
        config.model,
        config.maxTokens ?? null,
        config.temperature ?? null
      );
  }

  /** 保存所有 tier 的 LLM 配置 */
  saveLLMConfigs(configs: ModelRouterConfig): void {
    const tiers: ModelTier[] = ['local', 'cheap', 'strong'];
    const tx = this.db.transaction(() => {
      for (const tier of tiers) {
        this.saveLLMConfig(tier, configs[tier]);
      }
    });
    tx();
  }

  /** 加载数据库中保存的 LLM 配置，返回 null 表示无记录 */
  loadLLMConfigs(): ModelRouterConfig | null {
    const rows = this.db
      .prepare('SELECT * FROM llm_config ORDER BY tier')
      .all() as LLMConfigRow[];
    if (rows.length === 0) return null;

    const result: Partial<ModelRouterConfig> = {};
    for (const row of rows) {
      const tier = row.tier as ModelTier;
      result[tier] = {
        baseURL: row.base_url,
        apiKey: row.api_key,
        model: row.model,
        maxTokens: row.max_tokens ?? undefined,
        temperature: row.temperature ?? undefined,
      };
    }

    // 确保三个 tier 都有配置才返回完整对象
    if (result.local && result.cheap && result.strong) {
      return result as ModelRouterConfig;
    }

    return null;
  }

  /** 加载单个 tier 的 LLM 配置 */
  loadLLMConfig(tier: ModelTier): LLMConfig | null {
    const row = this.db
      .prepare('SELECT * FROM llm_config WHERE tier = ?')
      .get(tier) as LLMConfigRow | undefined;
    if (!row) return null;
    return {
      baseURL: row.base_url,
      apiKey: row.api_key,
      model: row.model,
      maxTokens: row.max_tokens ?? undefined,
      temperature: row.temperature ?? undefined,
    };
  }

  // ── Webhook 订阅 ──

  /** 创建 webhook 订阅 */
  createWebhook(sub: WebhookSubscription): void {
    this.db
      .prepare(
        `INSERT INTO webhook_subscriptions (id, url, events, secret, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(sub.id, sub.url, JSON.stringify(sub.events), sub.secret, sub.active ? 1 : 0, sub.createdAt);
  }

  /** 获取所有 webhook 订阅 */
  getWebhooks(): WebhookSubscription[] {
    const rows = this.db
      .prepare('SELECT * FROM webhook_subscriptions ORDER BY created_at DESC')
      .all() as WebhookRow[];
    return rows.map(rowToWebhook);
  }

  /** 获取单个 webhook 订阅 */
  getWebhook(id: string): WebhookSubscription | null {
    const row = this.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE id = ?')
      .get(id) as WebhookRow | undefined;
    return row ? rowToWebhook(row) : null;
  }

  /** 更新 webhook 订阅 */
  updateWebhook(id: string, updates: { url?: string; events?: WebhookEventType[]; active?: boolean }): boolean {
    const existing = this.getWebhook(id);
    if (!existing) return false;

    const url = updates.url ?? existing.url;
    const events = updates.events ?? existing.events;
    const active = updates.active ?? existing.active;

    this.db
      .prepare(
        `UPDATE webhook_subscriptions SET url = ?, events = ?, active = ? WHERE id = ?`
      )
      .run(url, JSON.stringify(events), active ? 1 : 0, id);
    return true;
  }

  /** 删除 webhook 订阅 */
  deleteWebhook(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM webhook_subscriptions WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /** 获取所有活跃的、订阅了指定事件类型的 webhook */
  getActiveWebhooksForEvent(eventType: WebhookEventType): WebhookSubscription[] {
    const rows = this.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE active = 1')
      .all() as WebhookRow[];
    return rows
      .map(rowToWebhook)
      .filter(sub => sub.events.includes(eventType));
  }

  // ── 事件持久化（v2.0） ──

  /** 保存 Tick 事件到数据库 */
  saveEvents(events: TickEventSummary[], tick: number): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO events (id, tick, title, content, category, importance, tags, source_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      for (const evt of events) {
        stmt.run(
          evt.id,
          tick,
          evt.title,
          (evt as EventDetailSummary).content ?? '',
          evt.category,
          evt.importance,
          JSON.stringify((evt as EventDetailSummary).tags ?? []),
          (evt as EventDetailSummary).sourceId ?? null,
        );
      }
    });
    tx();
  }

  /** 保存 Tick Agent 响应到数据库 */
  saveResponses(responses: TickResponseSummary[], tick: number): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO agent_responses (id, tick, event_id, agent_id, agent_name, opinion, action, sentiment, emotional_state, reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      for (const resp of responses) {
        const detail = resp as ResponseDetailSummary;
        const sentiment = detail.emotionalState > 0.2 ? 'bullish' : detail.emotionalState < -0.2 ? 'bearish' : 'neutral';
        stmt.run(
          generateId(),
          tick,
          detail.eventId ?? '',
          resp.agentId,
          resp.agentName,
          resp.opinion,
          resp.action,
          sentiment,
          resp.emotionalState,
          detail.reasoning ?? '',
        );
      }
    });
    tx();
  }

  /** 获取某个 Tick 的所有事件 */
  getEventsByTick(tick: number): TickEventSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE tick = ? ORDER BY importance DESC')
      .all(tick) as EventRow[];
    return rows.map(rowToEventSummary);
  }

  /** 获取某个 Tick 的所有 Agent 响应 */
  getResponsesByTick(tick: number): TickResponseSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_responses WHERE tick = ? ORDER BY created_at ASC')
      .all(tick) as ResponseRow[];
    return rows.map(rowToResponseSummary);
  }

  /** 获取某个事件的所有 Agent 响应 */
  getResponsesByEvent(eventId: string): TickResponseSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_responses WHERE event_id = ? ORDER BY created_at ASC')
      .all(eventId) as ResponseRow[];
    return rows.map(rowToResponseSummary);
  }

  /** 搜索事件（标题模糊匹配） */
  searchEvents(query: string, limit = 20): TickEventSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE title LIKE ? ORDER BY tick DESC, importance DESC LIMIT ?')
      .all(`%${query}%`, limit) as EventRow[];
    return rows.map(rowToEventSummary);
  }

  // ── RSS 数据源持久化（v2.0） ──

  /** 保存 RSS 数据源配置 */
  saveRssSource(source: FeedSource): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rss_sources (id, name, url, category, tags, poll_interval_ms, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`
      )
      .run(
        source.id,
        source.name,
        source.url,
        source.category,
        JSON.stringify(source.tags ?? []),
        source.pollIntervalMs ?? 300_000,
        (source.enabled ?? true) ? 1 : 0,
      );
  }

  /** 批量保存 RSS 数据源配置 */
  saveRssSources(sources: FeedSource[]): void {
    const tx = this.db.transaction(() => {
      for (const source of sources) {
        this.saveRssSource(source);
      }
    });
    tx();
  }

  /** 加载所有 RSS 数据源配置 */
  loadRssSources(): FeedSource[] {
    const rows = this.db
      .prepare('SELECT * FROM rss_sources ORDER BY created_at ASC')
      .all() as RssSourceRow[];
    return rows.map(rowToFeedSource);
  }

  /** 获取单个 RSS 数据源配置 */
  getRssSource(id: string): FeedSource | null {
    const row = this.db
      .prepare('SELECT * FROM rss_sources WHERE id = ?')
      .get(id) as RssSourceRow | undefined;
    return row ? rowToFeedSource(row) : null;
  }

  /** 删除 RSS 数据源配置 */
  deleteRssSource(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM rss_sources WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  // ── API Key 管理（v2.0） ──

  /** 创建 API Key 记录 */
  createApiKey(entry: ApiKeyEntry): void {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, name, key_hash, permissions, rate_limit, created_at, active)
         VALUES (?, ?, ?, ?, ?, unixepoch(), 1)`
      )
      .run(entry.id, entry.name, entry.keyHash, JSON.stringify(entry.permissions), entry.rateLimit);
  }

  /** 获取所有 API Key 记录 */
  getApiKeys(): ApiKeyRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM api_keys ORDER BY created_at DESC')
      .all() as ApiKeyRow[];
    return rows.map(rowToApiKeyRecord);
  }

  /** 通过 key_hash 查找 API Key */
  getApiKeyByHash(keyHash: string): ApiKeyRecord | null {
    const row = this.db
      .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND active = 1')
      .get(keyHash) as ApiKeyRow | undefined;
    return row ? rowToApiKeyRecord(row) : null;
  }

  /** 更新 API Key 最后使用时间 */
  touchApiKey(id: string): void {
    this.db
      .prepare('UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ?')
      .run(id);
  }

  /** 删除 API Key */
  deleteApiKey(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM api_keys WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /** 获取所有活跃 API Key 的哈希集合（用于鉴权快速查找） */
  getActiveApiKeyHashes(): Set<string> {
    const rows = this.db
      .prepare('SELECT key_hash FROM api_keys WHERE active = 1')
      .all() as { key_hash: string }[];
    return new Set(rows.map(r => r.key_hash));
  }
}

// ── Row 类型 ──

export interface AgentRow {
  id: string;
  name: string;
  persona: string;   // JSON
  memory: string;    // JSON
  followers: string; // JSON
  following: string; // JSON
  influence: number;
  credibility: number;
  status: string;
  model_tier: string;
  spawned_at_tick: number;
  last_active_tick: number;
  updated_at: number;
}

export interface TickHistoryRow {
  tick: number;
  events_processed: number;
  agents_activated: number;
  responses_collected: number;
  new_agents_spawned: number;
  signals: number;
  duration_ms: number;
  created_at: number;
}

export interface LLMConfigRow {
  tier: string;
  base_url: string;
  api_key: string;
  model: string;
  max_tokens: number | null;
  temperature: number | null;
  updated_at: number;
}

export interface WebhookRow {
  id: string;
  url: string;
  events: string;   // JSON
  secret: string;
  active: number;    // 0 | 1
  created_at: number;
}

function rowToWebhook(row: WebhookRow): WebhookSubscription {
  return {
    id: row.id,
    url: row.url,
    events: JSON.parse(row.events) as WebhookEventType[],
    secret: row.secret,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

// ── v2.0 Row 类型 ──

/** 事件内容摘要扩展（允许可选字段） */
interface EventDetailSummary extends TickEventSummary {
  content?: string;
  tags?: string[];
  sourceId?: string;
}

/** 响应内容摘要扩展（允许可选字段） */
interface ResponseDetailSummary extends TickResponseSummary {
  eventId?: string;
  reasoning?: string;
}

export interface EventRow {
  id: string;
  tick: number;
  title: string;
  content: string;
  category: string;
  importance: number;
  tags: string;
  source_id: string | null;
  created_at: number;
}

export interface ResponseRow {
  id: string;
  tick: number;
  event_id: string;
  agent_id: string;
  agent_name: string;
  opinion: string;
  action: string;
  sentiment: string;
  emotional_state: number;
  reasoning: string;
  created_at: number;
}

export interface RssSourceRow {
  id: string;
  name: string;
  url: string;
  category: string;
  tags: string;
  poll_interval_ms: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  permissions: string;
  rate_limit: number;
  created_at: number;
  last_used_at: number | null;
  active: number;
}

export interface ApiKeyEntry {
  id: string;
  name: string;
  keyHash: string;
  permissions: string[];
  rateLimit: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  permissions: string[];
  rateLimit: number;
  createdAt: number;
  lastUsedAt: number | null;
  active: boolean;
}

function rowToEventSummary(row: EventRow): TickEventSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    importance: row.importance,
  };
}

function rowToResponseSummary(row: ResponseRow): TickResponseSummary {
  return {
    agentId: row.agent_id,
    agentName: row.agent_name,
    opinion: row.opinion,
    action: row.action,
    emotionalState: row.emotional_state,
  };
}

function rowToFeedSource(row: RssSourceRow): FeedSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    category: row.category as EventCategory,
    tags: JSON.parse(row.tags) as string[],
    pollIntervalMs: row.poll_interval_ms,
    enabled: row.enabled === 1,
  };
}

function rowToApiKeyRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    permissions: JSON.parse(row.permissions) as string[],
    rateLimit: row.rate_limit,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    active: row.active === 1,
  };
}
