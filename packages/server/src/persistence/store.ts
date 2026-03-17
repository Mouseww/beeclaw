// ============================================================================
// BeeClaw Server — 持久化层：世界状态读写
// ============================================================================

import type Database from 'better-sqlite3';
import type { ConsensusSignal, LLMConfig, ModelTier, ModelRouterConfig, WebhookSubscription, WebhookEventType, EventCategory, SocialEdge, SocialNode, RelationType, SocialRole } from '@beeclaw/shared';
import type { Agent } from '@beeclaw/agent-runtime';
import type { TickResult, TickEventSummary, TickResponseSummary } from '@beeclaw/world-engine';
import type { FeedSource } from '@beeclaw/event-ingestion';
import { generateId } from '@beeclaw/shared';
import type { DatabaseAdapter } from './adapter.js';

export class SqliteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ── 世界状态 KV ──

  async getState(key: string): Promise<string | undefined> {
    const row = this.db.prepare('SELECT value FROM world_state WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  async setState(key: string, value: string): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO world_state (key, value) VALUES (?, ?)')
      .run(key, value);
  }

  async getTick(): Promise<number> {
    return parseInt((await this.getState('tick')) ?? '0', 10);
  }

  async setTick(tick: number): Promise<void> {
    await this.setState('tick', String(tick));
  }

  // ── Agents ──

  async saveAgent(agent: Agent): Promise<void> {
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

  async saveAgents(agents: Agent[]): Promise<void> {
    const tx = this.db.transaction(() => {
      for (const agent of agents) {
        // 同步调用内部 db 操作，避免在 transaction 中 await
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
    });
    tx();
  }

  async loadAgentRows(): Promise<AgentRow[]> {
    return this.db.prepare('SELECT * FROM agents').all() as AgentRow[];
  }

  async getAgentRow(id: string): Promise<AgentRow | undefined> {
    return this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined;
  }

  async getAgentRows(page: number, size: number): Promise<{ rows: AgentRow[]; total: number }> {
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

  async saveTickResult(result: TickResult): Promise<void> {
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

  async getTickHistory(limit = 50): Promise<TickResult[]> {
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

  async saveConsensusSignal(signal: ConsensusSignal): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO consensus_signals (tick, topic, data) VALUES (?, ?, ?)'
      )
      .run(signal.tick, signal.topic, JSON.stringify(signal));
  }

  async getLatestSignals(limit = 20): Promise<ConsensusSignal[]> {
    const rows = this.db
      .prepare('SELECT data FROM consensus_signals ORDER BY id DESC LIMIT ?')
      .all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as ConsensusSignal);
  }

  async getSignalsByTopic(topic: string, limit = 20): Promise<ConsensusSignal[]> {
    const rows = this.db
      .prepare('SELECT data FROM consensus_signals WHERE topic = ? ORDER BY id DESC LIMIT ?')
      .all(topic, limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as ConsensusSignal);
  }

  // ── LLM 配置持久化 ──

  /** 保存单个 tier 的 LLM 配置 */
  async saveLLMConfig(tier: ModelTier, config: LLMConfig): Promise<void> {
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
  async saveLLMConfigs(configs: ModelRouterConfig): Promise<void> {
    const tiers: ModelTier[] = ['local', 'cheap', 'strong'];
    const tx = this.db.transaction(() => {
      for (const tier of tiers) {
        const c = configs[tier];
        this.db
          .prepare(
            `INSERT OR REPLACE INTO llm_config
             (tier, base_url, api_key, model, max_tokens, temperature, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
          )
          .run(
            tier,
            c.baseURL,
            c.apiKey,
            c.model,
            c.maxTokens ?? null,
            c.temperature ?? null
          );
      }
    });
    tx();
  }

  /** 加载数据库中保存的 LLM 配置，返回 null 表示无记录 */
  async loadLLMConfigs(): Promise<ModelRouterConfig | null> {
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
  async loadLLMConfig(tier: ModelTier): Promise<LLMConfig | null> {
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
  async createWebhook(sub: WebhookSubscription): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO webhook_subscriptions (id, url, events, secret, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(sub.id, sub.url, JSON.stringify(sub.events), sub.secret, sub.active ? 1 : 0, sub.createdAt);
  }

  /** 获取所有 webhook 订阅 */
  async getWebhooks(): Promise<WebhookSubscription[]> {
    const rows = this.db
      .prepare('SELECT * FROM webhook_subscriptions ORDER BY created_at DESC')
      .all() as WebhookRow[];
    return rows.map(rowToWebhook);
  }

  /** 获取单个 webhook 订阅 */
  async getWebhook(id: string): Promise<WebhookSubscription | null> {
    const row = this.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE id = ?')
      .get(id) as WebhookRow | undefined;
    return row ? rowToWebhook(row) : null;
  }

  /** 更新 webhook 订阅 */
  async updateWebhook(id: string, updates: { url?: string; events?: WebhookEventType[]; active?: boolean }): Promise<boolean> {
    const existing = await this.getWebhook(id);
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
  async deleteWebhook(id: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM webhook_subscriptions WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /** 获取所有活跃的、订阅了指定事件类型的 webhook */
  async getActiveWebhooksForEvent(eventType: WebhookEventType): Promise<WebhookSubscription[]> {
    const rows = this.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE active = 1')
      .all() as WebhookRow[];
    return rows
      .map(rowToWebhook)
      .filter(sub => sub.events.includes(eventType));
  }

  // ── 事件持久化（v2.0） ──

  /** 保存 Tick 事件到数据库 */
  async saveEvents(events: TickEventSummary[], tick: number): Promise<void> {
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
  async saveResponses(responses: TickResponseSummary[], tick: number): Promise<void> {
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
  async getEventsByTick(tick: number): Promise<TickEventSummary[]> {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE tick = ? ORDER BY importance DESC')
      .all(tick) as EventRow[];
    return rows.map(rowToEventSummary);
  }

  /** 获取某个 Tick 的所有 Agent 响应 */
  async getResponsesByTick(tick: number): Promise<TickResponseSummary[]> {
    const rows = this.db
      .prepare('SELECT * FROM agent_responses WHERE tick = ? ORDER BY created_at ASC')
      .all(tick) as ResponseRow[];
    return rows.map(rowToResponseSummary);
  }

  /** 获取某个事件的所有 Agent 响应 */
  async getResponsesByEvent(eventId: string): Promise<TickResponseSummary[]> {
    const rows = this.db
      .prepare('SELECT * FROM agent_responses WHERE event_id = ? ORDER BY created_at ASC')
      .all(eventId) as ResponseRow[];
    return rows.map(rowToResponseSummary);
  }

  /** 搜索事件（标题模糊匹配） */
  async searchEvents(query: string, limit = 20): Promise<TickEventSummary[]> {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE title LIKE ? ORDER BY tick DESC, importance DESC LIMIT ?')
      .all(`%${query}%`, limit) as EventRow[];
    return rows.map(rowToEventSummary);
  }

  // ── RSS 数据源持久化（v2.0） ──

  /** 保存 RSS 数据源配置 */
  async saveRssSource(source: FeedSource): Promise<void> {
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
  async saveRssSources(sources: FeedSource[]): Promise<void> {
    const tx = this.db.transaction(() => {
      for (const source of sources) {
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
    });
    tx();
  }

  /** 加载所有 RSS 数据源配置 */
  async loadRssSources(): Promise<FeedSource[]> {
    const rows = this.db
      .prepare('SELECT * FROM rss_sources ORDER BY created_at ASC')
      .all() as RssSourceRow[];
    return rows.map(rowToFeedSource);
  }

  /** 获取单个 RSS 数据源配置 */
  async getRssSource(id: string): Promise<FeedSource | null> {
    const row = this.db
      .prepare('SELECT * FROM rss_sources WHERE id = ?')
      .get(id) as RssSourceRow | undefined;
    return row ? rowToFeedSource(row) : null;
  }

  /** 删除 RSS 数据源配置 */
  async deleteRssSource(id: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM rss_sources WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  // ── API Key 管理（v2.0） ──

  /** 创建 API Key 记录 */
  async createApiKey(entry: ApiKeyEntry): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, name, key_hash, permissions, rate_limit, created_at, active)
         VALUES (?, ?, ?, ?, ?, unixepoch(), 1)`
      )
      .run(entry.id, entry.name, entry.keyHash, JSON.stringify(entry.permissions), entry.rateLimit);
  }

  /** 获取所有 API Key 记录 */
  async getApiKeys(): Promise<ApiKeyRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM api_keys ORDER BY created_at DESC')
      .all() as ApiKeyRow[];
    return rows.map(rowToApiKeyRecord);
  }

  /** 通过 key_hash 查找 API Key */
  async getApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND active = 1')
      .get(keyHash) as ApiKeyRow | undefined;
    return row ? rowToApiKeyRecord(row) : null;
  }

  /** 更新 API Key 最后使用时间 */
  async touchApiKey(id: string): Promise<void> {
    this.db
      .prepare('UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ?')
      .run(id);
  }

  /** 删除 API Key */
  async deleteApiKey(id: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM api_keys WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /** 获取所有活跃 API Key 的哈希集合（用于鉴权快速查找） */
  async getActiveApiKeyHashes(): Promise<Set<string>> {
    const rows = this.db
      .prepare('SELECT key_hash FROM api_keys WHERE active = 1')
      .all() as { key_hash: string }[];
    return new Set(rows.map(r => r.key_hash));
  }

  /** 批量保存 Social Graph 边关系（全量覆盖：先清空再插入） */
  async saveSocialEdges(edges: SocialEdge[]): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM social_edges').run();
      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO social_edges (from_agent, to_agent, type, strength, formed_at_tick, updated_at)
         VALUES (?, ?, ?, ?, ?, unixepoch())`
      );
      for (const edge of edges) {
        stmt.run(edge.from, edge.to, edge.type, edge.strength, edge.formedAtTick);
      }
    });
    tx();
  }

  /** 批量保存 Social Graph 节点（全量覆盖：先清空再插入） */
  async saveSocialNodes(nodes: SocialNode[]): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM social_nodes').run();
      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO social_nodes (agent_id, influence, community, role, updated_at)
         VALUES (?, ?, ?, ?, unixepoch())`
      );
      for (const node of nodes) {
        stmt.run(node.agentId, node.influence, node.community, node.role);
      }
    });
    tx();
  }

  /** 加载所有 Social Graph 边关系 */
  async loadSocialEdges(): Promise<SocialEdge[]> {
    const rows = this.db
      .prepare('SELECT * FROM social_edges')
      .all() as SocialEdgeRow[];
    return rows.map(rowToSocialEdge);
  }

  /** 加载所有 Social Graph 节点 */
  async loadSocialNodes(): Promise<SocialNode[]> {
    const rows = this.db
      .prepare('SELECT * FROM social_nodes')
      .all() as SocialNodeRow[];
    return rows.map(rowToSocialNode);
  }

  /** 仅保存指定 Agent（增量保存，用于 dirty tracking） */
  async saveDirtyAgents(agents: Agent[]): Promise<void> {
    if (agents.length === 0) return;
    await this.saveAgents(agents);
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

// ── v2.1 Social Graph Row 类型 ──

export interface SocialEdgeRow {
  from_agent: string;
  to_agent: string;
  type: string;
  strength: number;
  formed_at_tick: number;
  updated_at: number;
}

export interface SocialNodeRow {
  agent_id: string;
  influence: number;
  community: string;
  role: string;
  updated_at: number;
}

function rowToSocialEdge(row: SocialEdgeRow): SocialEdge {
  return {
    from: row.from_agent,
    to: row.to_agent,
    type: row.type as RelationType,
    strength: row.strength,
    formedAtTick: row.formed_at_tick,
  };
}

function rowToSocialNode(row: SocialNodeRow): SocialNode {
  return {
    agentId: row.agent_id,
    influence: row.influence,
    community: row.community,
    role: row.role as SocialRole,
  };
}

// ── 向后兼容别名 ──

/** @deprecated 请使用 SqliteAdapter */
export const Store = SqliteAdapter;

/** 向后兼容类型别名：允许 `store: Store` 类型注解 */
export type Store = SqliteAdapter;
