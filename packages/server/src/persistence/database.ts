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
  `);

  return db;
}
