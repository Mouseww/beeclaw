// ============================================================================
// BeeClaw Server — 持久化层：世界状态读写
// ============================================================================

import type Database from 'better-sqlite3';
import type { ConsensusSignal, LLMConfig, ModelTier, ModelRouterConfig, WebhookSubscription, WebhookEventType } from '@beeclaw/shared';
import type { Agent } from '@beeclaw/agent-runtime';
import type { TickResult } from '@beeclaw/world-engine';

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
