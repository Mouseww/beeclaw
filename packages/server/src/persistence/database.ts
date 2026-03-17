// ============================================================================
// BeeClaw Server — 持久化层：SQLite 数据库初始化与 Schema
// ============================================================================

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

export function initDatabase(dbPath?: string): Database.Database {
  const finalPath = dbPath ?? resolve(process.cwd(), 'data', 'beeclaw.db');
  const dir = resolve(finalPath, '..');
  mkdirSync(dir, { recursive: true });

  const db = new Database(finalPath);

  // 性能优化
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // 建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      persona        TEXT NOT NULL,
      memory         TEXT NOT NULL,
      followers      TEXT NOT NULL DEFAULT '[]',
      following      TEXT NOT NULL DEFAULT '[]',
      influence      REAL NOT NULL DEFAULT 10,
      credibility    REAL NOT NULL DEFAULT 0.5,
      status         TEXT NOT NULL DEFAULT 'active',
      model_tier     TEXT NOT NULL DEFAULT 'cheap',
      spawned_at_tick INTEGER NOT NULL DEFAULT 0,
      last_active_tick INTEGER NOT NULL DEFAULT 0,
      updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tick_history (
      tick               INTEGER PRIMARY KEY,
      events_processed   INTEGER NOT NULL DEFAULT 0,
      agents_activated   INTEGER NOT NULL DEFAULT 0,
      responses_collected INTEGER NOT NULL DEFAULT 0,
      new_agents_spawned INTEGER NOT NULL DEFAULT 0,
      signals            INTEGER NOT NULL DEFAULT 0,
      duration_ms        INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS consensus_signals (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tick      INTEGER NOT NULL,
      topic     TEXT NOT NULL,
      data      TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_consensus_topic ON consensus_signals(topic);
    CREATE INDEX IF NOT EXISTS idx_consensus_tick ON consensus_signals(tick);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

    CREATE TABLE IF NOT EXISTS llm_config (
      tier       TEXT PRIMARY KEY,
      base_url   TEXT NOT NULL,
      api_key    TEXT NOT NULL,
      model      TEXT NOT NULL,
      max_tokens INTEGER,
      temperature REAL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id         TEXT PRIMARY KEY,
      url        TEXT NOT NULL,
      events     TEXT NOT NULL,
      secret     TEXT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- v2.0: 事件内容持久化
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      tick        INTEGER NOT NULL,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT 'general',
      importance  REAL NOT NULL DEFAULT 0.5,
      tags        TEXT NOT NULL DEFAULT '[]',
      source_id   TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);

    -- v2.0: Agent 响应内容持久化
    CREATE TABLE IF NOT EXISTS agent_responses (
      id               TEXT PRIMARY KEY,
      tick             INTEGER NOT NULL,
      event_id         TEXT NOT NULL,
      agent_id         TEXT NOT NULL,
      agent_name       TEXT NOT NULL,
      opinion          TEXT NOT NULL DEFAULT '',
      action           TEXT NOT NULL DEFAULT 'silent',
      sentiment        TEXT NOT NULL DEFAULT 'neutral',
      emotional_state  REAL NOT NULL DEFAULT 0,
      reasoning        TEXT NOT NULL DEFAULT '',
      created_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_responses_tick ON agent_responses(tick);
    CREATE INDEX IF NOT EXISTS idx_responses_event ON agent_responses(event_id);
    CREATE INDEX IF NOT EXISTS idx_responses_agent ON agent_responses(agent_id);

    -- v2.0: RSS 数据源配置持久化
    CREATE TABLE IF NOT EXISTS rss_sources (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      url              TEXT NOT NULL,
      category         TEXT NOT NULL DEFAULT 'general',
      tags             TEXT NOT NULL DEFAULT '[]',
      poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
      enabled          INTEGER NOT NULL DEFAULT 1,
      created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- v2.0: API Key 管理
    CREATE TABLE IF NOT EXISTS api_keys (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      permissions  TEXT NOT NULL DEFAULT '[]',
      rate_limit   INTEGER NOT NULL DEFAULT 100,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      active       INTEGER NOT NULL DEFAULT 1
    );

    -- v2.1: Social Graph 持久化
    CREATE TABLE IF NOT EXISTS social_nodes (
      agent_id   TEXT PRIMARY KEY,
      influence  REAL NOT NULL DEFAULT 10,
      community  TEXT NOT NULL DEFAULT 'default',
      role       TEXT NOT NULL DEFAULT 'follower',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS social_edges (
      from_agent   TEXT NOT NULL,
      to_agent     TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'follow',
      strength     REAL NOT NULL DEFAULT 0.5,
      formed_at_tick INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (from_agent, to_agent)
    );

    CREATE INDEX IF NOT EXISTS idx_social_edges_from ON social_edges(from_agent);
    CREATE INDEX IF NOT EXISTS idx_social_edges_to ON social_edges(to_agent);
  `);

  return db;
}
