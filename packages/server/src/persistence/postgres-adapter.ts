// ============================================================================
// BeeClaw Server — 持久化层：PostgreSQL 适配器
// 实现 DatabaseAdapter 接口，使用 pg.Pool 连接池
// ============================================================================

import { Pool, type PoolClient } from 'pg';
import type { ConsensusSignal, LLMConfig, ModelTier, ModelRouterConfig, WebhookSubscription, WebhookEventType, EventCategory } from '@beeclaw/shared';
import type { Agent } from '@beeclaw/agent-runtime';
import type { TickResult, TickEventSummary, TickResponseSummary } from '@beeclaw/world-engine';
import type { FeedSource } from '@beeclaw/event-ingestion';
import { generateId } from '@beeclaw/shared';
import type { DatabaseAdapter } from './adapter.js';
import type { AgentRow, ApiKeyEntry, ApiKeyRecord } from './store.js';

// ── 内部扩展类型 ──

interface EventDetailSummary extends TickEventSummary {
  content?: string;
  tags?: string[];
  sourceId?: string;
}

interface ResponseDetailSummary extends TickResponseSummary {
  eventId?: string;
  reasoning?: string;
}

/**
 * PostgresAdapter — 持久化层 PostgreSQL 实现
 *
 * 使用 pg.Pool 连接池，所有写操作使用参数化查询（$1, $2...）。
 * JSON 字段存储为 jsonb 类型，提供更好的查询性能。
 * 批量操作使用显式事务（BEGIN/COMMIT/ROLLBACK）。
 */
export class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 建表 DDL — 初始化数据库 Schema
   * 使用 IF NOT EXISTS，支持幂等调用
   */
  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS world_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        persona          JSONB NOT NULL DEFAULT '{}',
        memory           JSONB NOT NULL DEFAULT '{}',
        followers        JSONB NOT NULL DEFAULT '[]',
        following        JSONB NOT NULL DEFAULT '[]',
        influence        REAL NOT NULL DEFAULT 10,
        credibility      REAL NOT NULL DEFAULT 0.5,
        status           TEXT NOT NULL DEFAULT 'active',
        model_tier       TEXT NOT NULL DEFAULT 'cheap',
        spawned_at_tick  INTEGER NOT NULL DEFAULT 0,
        last_active_tick INTEGER NOT NULL DEFAULT 0,
        updated_at       BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

      CREATE TABLE IF NOT EXISTS tick_history (
        tick                INTEGER PRIMARY KEY,
        events_processed    INTEGER NOT NULL DEFAULT 0,
        agents_activated    INTEGER NOT NULL DEFAULT 0,
        responses_collected INTEGER NOT NULL DEFAULT 0,
        new_agents_spawned  INTEGER NOT NULL DEFAULT 0,
        signals             INTEGER NOT NULL DEFAULT 0,
        duration_ms         INTEGER NOT NULL DEFAULT 0,
        created_at          BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS consensus_signals (
        id         BIGSERIAL PRIMARY KEY,
        tick       INTEGER NOT NULL,
        topic      TEXT NOT NULL,
        data       JSONB NOT NULL,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE INDEX IF NOT EXISTS idx_consensus_topic ON consensus_signals(topic);
      CREATE INDEX IF NOT EXISTS idx_consensus_tick ON consensus_signals(tick);

      CREATE TABLE IF NOT EXISTS llm_config (
        tier        TEXT PRIMARY KEY,
        base_url    TEXT NOT NULL,
        api_key     TEXT NOT NULL,
        model       TEXT NOT NULL,
        max_tokens  INTEGER,
        temperature REAL,
        updated_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id         TEXT PRIMARY KEY,
        url        TEXT NOT NULL,
        events     JSONB NOT NULL DEFAULT '[]',
        secret     TEXT NOT NULL,
        active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS events (
        id         TEXT PRIMARY KEY,
        tick       INTEGER NOT NULL,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        category   TEXT NOT NULL DEFAULT 'general',
        importance REAL NOT NULL DEFAULT 0.5,
        tags       JSONB NOT NULL DEFAULT '[]',
        source_id  TEXT,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);

      CREATE TABLE IF NOT EXISTS agent_responses (
        id              TEXT PRIMARY KEY,
        tick            INTEGER NOT NULL,
        event_id        TEXT NOT NULL DEFAULT '',
        agent_id        TEXT NOT NULL,
        agent_name      TEXT NOT NULL,
        opinion         TEXT NOT NULL DEFAULT '',
        action          TEXT NOT NULL DEFAULT 'silent',
        sentiment       TEXT NOT NULL DEFAULT 'neutral',
        emotional_state REAL NOT NULL DEFAULT 0,
        reasoning       TEXT NOT NULL DEFAULT '',
        created_at      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE INDEX IF NOT EXISTS idx_responses_tick ON agent_responses(tick);
      CREATE INDEX IF NOT EXISTS idx_responses_event ON agent_responses(event_id);
      CREATE INDEX IF NOT EXISTS idx_responses_agent ON agent_responses(agent_id);

      CREATE TABLE IF NOT EXISTS rss_sources (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        url              TEXT NOT NULL,
        category         TEXT NOT NULL DEFAULT 'general',
        tags             JSONB NOT NULL DEFAULT '[]',
        poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
        enabled          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at       BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at       BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        key_hash     TEXT NOT NULL UNIQUE,
        permissions  JSONB NOT NULL DEFAULT '[]',
        rate_limit   INTEGER NOT NULL DEFAULT 100,
        created_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        last_used_at BIGINT,
        active       BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);
  }

  // ── 通用事务包装 ──

  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── 世界状态 KV ──

  async getState(key: string): Promise<string | undefined> {
    const res = await this.pool.query<{ value: string }>(
      'SELECT value FROM world_state WHERE key = $1',
      [key]
    );
    return res.rows[0]?.value;
  }

  async setState(key: string, value: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO world_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, value]
    );
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
    await this.pool.query(
      `INSERT INTO agents
       (id, name, persona, memory, followers, following, influence, credibility, status, model_tier, spawned_at_tick, last_active_tick, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         persona = EXCLUDED.persona,
         memory = EXCLUDED.memory,
         followers = EXCLUDED.followers,
         following = EXCLUDED.following,
         influence = EXCLUDED.influence,
         credibility = EXCLUDED.credibility,
         status = EXCLUDED.status,
         model_tier = EXCLUDED.model_tier,
         spawned_at_tick = EXCLUDED.spawned_at_tick,
         last_active_tick = EXCLUDED.last_active_tick,
         updated_at = EXTRACT(EPOCH FROM NOW())`,
      [
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
        data.lastActiveTick,
      ]
    );
  }

  async saveAgents(agents: Agent[]): Promise<void> {
    if (agents.length === 0) return;
    await this.withTransaction(async (client) => {
      for (const agent of agents) {
        const data = agent.toData();
        await client.query(
          `INSERT INTO agents
           (id, name, persona, memory, followers, following, influence, credibility, status, model_tier, spawned_at_tick, last_active_tick, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, EXTRACT(EPOCH FROM NOW()))
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             persona = EXCLUDED.persona,
             memory = EXCLUDED.memory,
             followers = EXCLUDED.followers,
             following = EXCLUDED.following,
             influence = EXCLUDED.influence,
             credibility = EXCLUDED.credibility,
             status = EXCLUDED.status,
             model_tier = EXCLUDED.model_tier,
             spawned_at_tick = EXCLUDED.spawned_at_tick,
             last_active_tick = EXCLUDED.last_active_tick,
             updated_at = EXTRACT(EPOCH FROM NOW())`,
          [
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
            data.lastActiveTick,
          ]
        );
      }
    });
  }

  async loadAgentRows(): Promise<AgentRow[]> {
    const res = await this.pool.query('SELECT * FROM agents');
    return res.rows.map(pgRowToAgentRow);
  }

  async getAgentRow(id: string): Promise<AgentRow | undefined> {
    const res = await this.pool.query('SELECT * FROM agents WHERE id = $1', [id]);
    return res.rows[0] ? pgRowToAgentRow(res.rows[0]) : undefined;
  }

  async getAgentRows(page: number, size: number): Promise<{ rows: AgentRow[]; total: number }> {
    const countRes = await this.pool.query<{ cnt: string }>(
      'SELECT COUNT(*) as cnt FROM agents'
    );
    const total = parseInt(countRes.rows[0]?.cnt ?? '0', 10);
    const offset = (page - 1) * size;
    const res = await this.pool.query(
      'SELECT * FROM agents ORDER BY influence DESC LIMIT $1 OFFSET $2',
      [size, offset]
    );
    return { rows: res.rows.map(pgRowToAgentRow), total };
  }

  // ── Tick 历史 ──

  async saveTickResult(result: TickResult): Promise<void> {
    await this.pool.query(
      `INSERT INTO tick_history
       (tick, events_processed, agents_activated, responses_collected, new_agents_spawned, signals, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tick) DO UPDATE SET
         events_processed = EXCLUDED.events_processed,
         agents_activated = EXCLUDED.agents_activated,
         responses_collected = EXCLUDED.responses_collected,
         new_agents_spawned = EXCLUDED.new_agents_spawned,
         signals = EXCLUDED.signals,
         duration_ms = EXCLUDED.duration_ms`,
      [
        result.tick,
        result.eventsProcessed,
        result.agentsActivated,
        result.responsesCollected,
        result.newAgentsSpawned,
        result.signals,
        result.durationMs,
      ]
    );
  }

  async getTickHistory(limit = 50): Promise<TickResult[]> {
    const res = await this.pool.query(
      'SELECT * FROM tick_history ORDER BY tick DESC LIMIT $1',
      [limit]
    );
    return res.rows.map((r) => ({
      tick: r.tick,
      eventsProcessed: r.events_processed,
      agentsActivated: r.agents_activated,
      responsesCollected: r.responses_collected,
      newAgentsSpawned: r.new_agents_spawned,
      signals: r.signals,
      durationMs: r.duration_ms,
      timestamp: new Date(Number(r.created_at) * 1000).toISOString(),
    }));
  }

  // ── 共识信号 ──

  async saveConsensusSignal(signal: ConsensusSignal): Promise<void> {
    await this.pool.query(
      'INSERT INTO consensus_signals (tick, topic, data) VALUES ($1, $2, $3)',
      [signal.tick, signal.topic, JSON.stringify(signal)]
    );
  }

  async getLatestSignals(limit = 20): Promise<ConsensusSignal[]> {
    const res = await this.pool.query(
      'SELECT data FROM consensus_signals ORDER BY id DESC LIMIT $1',
      [limit]
    );
    return res.rows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as ConsensusSignal);
  }

  async getSignalsByTopic(topic: string, limit = 20): Promise<ConsensusSignal[]> {
    const res = await this.pool.query(
      'SELECT data FROM consensus_signals WHERE topic = $1 ORDER BY id DESC LIMIT $2',
      [topic, limit]
    );
    return res.rows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as ConsensusSignal);
  }

  // ── LLM 配置 ──

  async saveLLMConfig(tier: ModelTier, config: LLMConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_config (tier, base_url, api_key, model, max_tokens, temperature, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (tier) DO UPDATE SET
         base_url = EXCLUDED.base_url,
         api_key = EXCLUDED.api_key,
         model = EXCLUDED.model,
         max_tokens = EXCLUDED.max_tokens,
         temperature = EXCLUDED.temperature,
         updated_at = EXTRACT(EPOCH FROM NOW())`,
      [tier, config.baseURL, config.apiKey, config.model, config.maxTokens ?? null, config.temperature ?? null]
    );
  }

  async saveLLMConfigs(configs: ModelRouterConfig): Promise<void> {
    const tiers: ModelTier[] = ['local', 'cheap', 'strong'];
    await this.withTransaction(async (client) => {
      for (const tier of tiers) {
        const c = configs[tier];
        await client.query(
          `INSERT INTO llm_config (tier, base_url, api_key, model, max_tokens, temperature, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW()))
           ON CONFLICT (tier) DO UPDATE SET
             base_url = EXCLUDED.base_url,
             api_key = EXCLUDED.api_key,
             model = EXCLUDED.model,
             max_tokens = EXCLUDED.max_tokens,
             temperature = EXCLUDED.temperature,
             updated_at = EXTRACT(EPOCH FROM NOW())`,
          [tier, c.baseURL, c.apiKey, c.model, c.maxTokens ?? null, c.temperature ?? null]
        );
      }
    });
  }

  async loadLLMConfigs(): Promise<ModelRouterConfig | null> {
    const res = await this.pool.query('SELECT * FROM llm_config ORDER BY tier');
    if (res.rows.length === 0) return null;

    const result: Partial<ModelRouterConfig> = {};
    for (const row of res.rows) {
      const tier = row.tier as ModelTier;
      result[tier] = {
        baseURL: row.base_url,
        apiKey: row.api_key,
        model: row.model,
        maxTokens: row.max_tokens ?? undefined,
        temperature: row.temperature ?? undefined,
      };
    }

    if (result.local && result.cheap && result.strong) {
      return result as ModelRouterConfig;
    }
    return null;
  }

  async loadLLMConfig(tier: ModelTier): Promise<LLMConfig | null> {
    const res = await this.pool.query('SELECT * FROM llm_config WHERE tier = $1', [tier]);
    const row = res.rows[0];
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

  async createWebhook(sub: WebhookSubscription): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_subscriptions (id, url, events, secret, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sub.id, sub.url, JSON.stringify(sub.events), sub.secret, sub.active, sub.createdAt]
    );
  }

  async getWebhooks(): Promise<WebhookSubscription[]> {
    const res = await this.pool.query(
      'SELECT * FROM webhook_subscriptions ORDER BY created_at DESC'
    );
    return res.rows.map(pgRowToWebhook);
  }

  async getWebhook(id: string): Promise<WebhookSubscription | null> {
    const res = await this.pool.query(
      'SELECT * FROM webhook_subscriptions WHERE id = $1',
      [id]
    );
    return res.rows[0] ? pgRowToWebhook(res.rows[0]) : null;
  }

  async updateWebhook(
    id: string,
    updates: { url?: string; events?: WebhookEventType[]; active?: boolean }
  ): Promise<boolean> {
    const existing = await this.getWebhook(id);
    if (!existing) return false;

    const url = updates.url ?? existing.url;
    const events = updates.events ?? existing.events;
    const active = updates.active ?? existing.active;

    const res = await this.pool.query(
      'UPDATE webhook_subscriptions SET url = $1, events = $2, active = $3 WHERE id = $4',
      [url, JSON.stringify(events), active, id]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const res = await this.pool.query(
      'DELETE FROM webhook_subscriptions WHERE id = $1',
      [id]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async getActiveWebhooksForEvent(eventType: WebhookEventType): Promise<WebhookSubscription[]> {
    const res = await this.pool.query(
      'SELECT * FROM webhook_subscriptions WHERE active = TRUE'
    );
    return res.rows
      .map(pgRowToWebhook)
      .filter((sub) => sub.events.includes(eventType));
  }

  // ── 事件持久化 ──

  async saveEvents(events: TickEventSummary[], tick: number): Promise<void> {
    if (events.length === 0) return;
    await this.withTransaction(async (client) => {
      for (const evt of events) {
        const detail = evt as EventDetailSummary;
        await client.query(
          `INSERT INTO events (id, tick, title, content, category, importance, tags, source_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            evt.id,
            tick,
            evt.title,
            detail.content ?? '',
            evt.category,
            evt.importance,
            JSON.stringify(detail.tags ?? []),
            detail.sourceId ?? null,
          ]
        );
      }
    });
  }

  async getEventsByTick(tick: number): Promise<TickEventSummary[]> {
    const res = await this.pool.query(
      'SELECT * FROM events WHERE tick = $1 ORDER BY importance DESC',
      [tick]
    );
    return res.rows.map(pgRowToEventSummary);
  }

  async searchEvents(query: string, limit = 20): Promise<TickEventSummary[]> {
    const res = await this.pool.query(
      'SELECT * FROM events WHERE title ILIKE $1 ORDER BY tick DESC, importance DESC LIMIT $2',
      [`%${query}%`, limit]
    );
    return res.rows.map(pgRowToEventSummary);
  }

  // ── Agent 响应持久化 ──

  async saveResponses(responses: TickResponseSummary[], tick: number): Promise<void> {
    if (responses.length === 0) return;
    await this.withTransaction(async (client) => {
      for (const resp of responses) {
        const detail = resp as ResponseDetailSummary;
        const sentiment =
          detail.emotionalState > 0.2
            ? 'bullish'
            : detail.emotionalState < -0.2
              ? 'bearish'
              : 'neutral';
        await client.query(
          `INSERT INTO agent_responses (id, tick, event_id, agent_id, agent_name, opinion, action, sentiment, emotional_state, reasoning)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
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
          ]
        );
      }
    });
  }

  async getResponsesByTick(tick: number): Promise<TickResponseSummary[]> {
    const res = await this.pool.query(
      'SELECT * FROM agent_responses WHERE tick = $1 ORDER BY created_at ASC',
      [tick]
    );
    return res.rows.map(pgRowToResponseSummary);
  }

  async getResponsesByEvent(eventId: string): Promise<TickResponseSummary[]> {
    const res = await this.pool.query(
      'SELECT * FROM agent_responses WHERE event_id = $1 ORDER BY created_at ASC',
      [eventId]
    );
    return res.rows.map(pgRowToResponseSummary);
  }

  // ── RSS 数据源 ──

  async saveRssSource(source: FeedSource): Promise<void> {
    await this.pool.query(
      `INSERT INTO rss_sources (id, name, url, category, tags, poll_interval_ms, enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         url = EXCLUDED.url,
         category = EXCLUDED.category,
         tags = EXCLUDED.tags,
         poll_interval_ms = EXCLUDED.poll_interval_ms,
         enabled = EXCLUDED.enabled,
         updated_at = EXTRACT(EPOCH FROM NOW())`,
      [
        source.id,
        source.name,
        source.url,
        source.category,
        JSON.stringify(source.tags ?? []),
        source.pollIntervalMs ?? 300_000,
        source.enabled ?? true,
      ]
    );
  }

  async saveRssSources(sources: FeedSource[]): Promise<void> {
    if (sources.length === 0) return;
    await this.withTransaction(async (client) => {
      for (const source of sources) {
        await client.query(
          `INSERT INTO rss_sources (id, name, url, category, tags, poll_interval_ms, enabled, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW()))
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             url = EXCLUDED.url,
             category = EXCLUDED.category,
             tags = EXCLUDED.tags,
             poll_interval_ms = EXCLUDED.poll_interval_ms,
             enabled = EXCLUDED.enabled,
             updated_at = EXTRACT(EPOCH FROM NOW())`,
          [
            source.id,
            source.name,
            source.url,
            source.category,
            JSON.stringify(source.tags ?? []),
            source.pollIntervalMs ?? 300_000,
            source.enabled ?? true,
          ]
        );
      }
    });
  }

  async loadRssSources(): Promise<FeedSource[]> {
    const res = await this.pool.query('SELECT * FROM rss_sources ORDER BY created_at ASC');
    return res.rows.map(pgRowToFeedSource);
  }

  async getRssSource(id: string): Promise<FeedSource | null> {
    const res = await this.pool.query('SELECT * FROM rss_sources WHERE id = $1', [id]);
    return res.rows[0] ? pgRowToFeedSource(res.rows[0]) : null;
  }

  async deleteRssSource(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM rss_sources WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── API Key 管理 ──

  async createApiKey(entry: ApiKeyEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO api_keys (id, name, key_hash, permissions, rate_limit, created_at, active)
       VALUES ($1, $2, $3, $4, $5, EXTRACT(EPOCH FROM NOW()), TRUE)`,
      [entry.id, entry.name, entry.keyHash, JSON.stringify(entry.permissions), entry.rateLimit]
    );
  }

  async getApiKeys(): Promise<ApiKeyRecord[]> {
    const res = await this.pool.query('SELECT * FROM api_keys ORDER BY created_at DESC');
    return res.rows.map(pgRowToApiKeyRecord);
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const res = await this.pool.query(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND active = TRUE',
      [keyHash]
    );
    return res.rows[0] ? pgRowToApiKeyRecord(res.rows[0]) : null;
  }

  async touchApiKey(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE api_keys SET last_used_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1',
      [id]
    );
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async getActiveApiKeyHashes(): Promise<Set<string>> {
    const res = await this.pool.query<{ key_hash: string }>(
      'SELECT key_hash FROM api_keys WHERE active = TRUE'
    );
    return new Set(res.rows.map((r) => r.key_hash));
  }
}

// ── Row 映射函数 ──

function pgRowToAgentRow(row: Record<string, unknown>): AgentRow {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    // jsonb 字段由 pg 自动解析为对象，需要重新序列化为字符串以兼容 AgentRow 接口
    persona: typeof row['persona'] === 'string' ? row['persona'] : JSON.stringify(row['persona']),
    memory: typeof row['memory'] === 'string' ? row['memory'] : JSON.stringify(row['memory']),
    followers: typeof row['followers'] === 'string' ? row['followers'] : JSON.stringify(row['followers']),
    following: typeof row['following'] === 'string' ? row['following'] : JSON.stringify(row['following']),
    influence: Number(row['influence']),
    credibility: Number(row['credibility']),
    status: row['status'] as string,
    model_tier: row['model_tier'] as string,
    spawned_at_tick: Number(row['spawned_at_tick']),
    last_active_tick: Number(row['last_active_tick']),
    updated_at: Number(row['updated_at']),
  };
}

function pgRowToWebhook(row: Record<string, unknown>): WebhookSubscription {
  const events = typeof row['events'] === 'string'
    ? JSON.parse(row['events'] as string)
    : row['events'];
  return {
    id: row['id'] as string,
    url: row['url'] as string,
    events: events as WebhookEventType[],
    secret: row['secret'] as string,
    active: Boolean(row['active']),
    createdAt: Number(row['created_at']),
  };
}

function pgRowToEventSummary(row: Record<string, unknown>): TickEventSummary {
  return {
    id: row['id'] as string,
    title: row['title'] as string,
    category: row['category'] as string,
    importance: Number(row['importance']),
  };
}

function pgRowToResponseSummary(row: Record<string, unknown>): TickResponseSummary {
  return {
    agentId: row['agent_id'] as string,
    agentName: row['agent_name'] as string,
    opinion: row['opinion'] as string,
    action: row['action'] as string,
    emotionalState: Number(row['emotional_state']),
  };
}

function pgRowToFeedSource(row: Record<string, unknown>): FeedSource {
  const tags = typeof row['tags'] === 'string'
    ? JSON.parse(row['tags'] as string)
    : row['tags'];
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    url: row['url'] as string,
    category: row['category'] as EventCategory,
    tags: tags as string[],
    pollIntervalMs: Number(row['poll_interval_ms']),
    enabled: Boolean(row['enabled']),
  };
}

function pgRowToApiKeyRecord(row: Record<string, unknown>): ApiKeyRecord {
  const permissions = typeof row['permissions'] === 'string'
    ? JSON.parse(row['permissions'] as string)
    : row['permissions'];
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    keyHash: row['key_hash'] as string,
    permissions: permissions as string[],
    rateLimit: Number(row['rate_limit']),
    createdAt: Number(row['created_at']),
    lastUsedAt: row['last_used_at'] != null ? Number(row['last_used_at']) : null,
    active: Boolean(row['active']),
  };
}
