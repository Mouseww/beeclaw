// ============================================================================
// BeeClaw Server — 持久化层：世界状态读写
// ============================================================================

import type Database from 'better-sqlite3';
import type { ConsensusSignal } from '@beeclaw/shared';
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
