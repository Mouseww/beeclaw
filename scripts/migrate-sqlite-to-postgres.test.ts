// ============================================================================
// BeeClaw — SQLite → PostgreSQL 迁移脚本单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import pg from 'pg';
import { migrate } from './migrate-sqlite-to-postgres.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── 测试辅助：创建带 Schema 的 SQLite 数据库 ──

function createTestSqlite(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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
  `);

  return db;
}

function seedTestData(db: Database.Database): void {
  db.prepare('INSERT INTO world_state (key, value) VALUES (?, ?)').run('tick', '42');
  db.prepare('INSERT INTO world_state (key, value) VALUES (?, ?)').run('phase', 'running');

  db.prepare(
    `INSERT INTO agents (id, name, persona, memory, followers, following, influence, credibility, status, model_tier, spawned_at_tick, last_active_tick)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('agent-1', 'Alpha', '{"name":"Alpha","traits":["bold"]}', '{"shortTerm":[],"opinions":[]}', '["agent-2"]', '[]', 15.5, 0.8, 'active', 'cheap', 1, 40);

  db.prepare(
    `INSERT INTO agents (id, name, persona, memory, followers, following, influence, credibility, status, model_tier, spawned_at_tick, last_active_tick)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('agent-2', 'Beta', '{"name":"Beta","traits":["cautious"]}', '{"shortTerm":[],"opinions":[]}', '[]', '["agent-1"]', 8.0, 0.6, 'active', 'strong', 5, 41);

  db.prepare(
    'INSERT INTO tick_history (tick, events_processed, agents_activated, responses_collected, new_agents_spawned, signals, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(1, 2, 10, 8, 1, 3, 1500);

  db.prepare(
    'INSERT INTO consensus_signals (tick, topic, data) VALUES (?, ?, ?)',
  ).run(1, 'crypto', '{"tick":1,"topic":"crypto","direction":"bullish","agreement":0.7}');

  db.prepare(
    'INSERT INTO llm_config (tier, base_url, api_key, model, max_tokens, temperature) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('cheap', 'http://localhost:11434', 'no-key', 'qwen2.5:7b', 2048, 0.7);

  db.prepare(
    'INSERT INTO webhook_subscriptions (id, url, events, secret, active) VALUES (?, ?, ?, ?, ?)',
  ).run('wh-1', 'https://example.com/hook', '["tick","consensus"]', 'secret123', 1);

  db.prepare(
    'INSERT INTO events (id, tick, title, content, category, importance, tags, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('evt-1', 1, 'Test Event', 'Content here', 'crypto', 0.9, '["bitcoin","news"]', null);

  db.prepare(
    'INSERT INTO agent_responses (id, tick, event_id, agent_id, agent_name, opinion, action, sentiment, emotional_state, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('resp-1', 1, 'evt-1', 'agent-1', 'Alpha', 'Bullish on BTC', 'share', 'bullish', 0.8, 'Strong momentum');

  db.prepare(
    'INSERT INTO rss_sources (id, name, url, category, tags, poll_interval_ms, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run('rss-1', 'CoinDesk', 'https://coindesk.com/rss', 'crypto', '["bitcoin"]', 60000, 1);

  db.prepare(
    'INSERT INTO api_keys (id, name, key_hash, permissions, rate_limit, active) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('key-1', 'TestKey', 'hash123abc', '["read","write"]', 200, 1);

  db.prepare(
    'INSERT INTO social_nodes (agent_id, influence, community, role) VALUES (?, ?, ?, ?)',
  ).run('agent-1', 15.5, 'crypto-bulls', 'influencer');

  db.prepare(
    'INSERT INTO social_edges (from_agent, to_agent, type, strength, formed_at_tick) VALUES (?, ?, ?, ?, ?)',
  ).run('agent-1', 'agent-2', 'follow', 0.9, 3);
}

// ── Mock pg.Pool（通过依赖注入，无需 mock 模块） ──

interface QueryCall {
  text: string;
  values?: unknown[];
}

function createMockPool() {
  const queries: QueryCall[] = [];

  const mockClient = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (text.trim().startsWith('INSERT')) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('setval')) {
        return { rows: [{ setval: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };

  const pool = {
    connect: vi.fn(async () => mockClient),
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      if (text.trim().startsWith('INSERT')) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('setval')) {
        return { rows: [{ setval: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    end: vi.fn(async () => {}),
  } as unknown as pg.Pool;

  return { pool, mockClient, queries };
}

// ── 测试 ──

describe('migrate-sqlite-to-postgres', () => {
  let testDir: string;
  let sqlitePath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beeclaw-migrate-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    sqlitePath = join(testDir, 'test.db');
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  it('dry-run 模式不应写入 PostgreSQL', async () => {
    const db = createTestSqlite(sqlitePath);
    seedTestData(db);
    // 保持 db 打开，以 readonly 模式重新打开给 migrate 用
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool, queries } = createMockPool();

    const results = await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: true },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    // dry-run 不应有 INSERT 查询
    const inserts = queries.filter((q) => q.text.includes('INSERT'));
    expect(inserts).toHaveLength(0);

    // dry-run 不应有 CREATE TABLE 查询
    const creates = queries.filter((q) => q.text.includes('CREATE TABLE'));
    expect(creates).toHaveLength(0);

    // 应返回所有 12 张表的统计
    expect(results.length).toBe(12);

    // world_state 应有 2 行
    const wsResult = results.find((r) => r.table === 'world_state');
    expect(wsResult).toBeDefined();
    expect(wsResult!.sourceRows).toBe(2);
    expect(wsResult!.migratedRows).toBe(0);
  });

  it('正式迁移应执行 CREATE TABLE 和 INSERT', async () => {
    const db = createTestSqlite(sqlitePath);
    seedTestData(db);
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool, queries } = createMockPool();

    const results = await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    // 应有 CREATE TABLE 查询
    const creates = queries.filter((q) => q.text.includes('CREATE TABLE'));
    expect(creates.length).toBeGreaterThan(0);

    // 应有 INSERT 查询
    const inserts = queries.filter((q) => q.text.includes('INSERT'));
    expect(inserts.length).toBeGreaterThan(0);

    // 应有 BEGIN/COMMIT 事务
    const begins = queries.filter((q) => q.text === 'BEGIN');
    const commits = queries.filter((q) => q.text === 'COMMIT');
    expect(begins.length).toBeGreaterThan(0);
    expect(commits.length).toBe(begins.length);

    // 各表行数验证
    const check = (table: string, expected: number) => {
      const r = results.find((r) => r.table === table);
      expect(r, `table ${table} should exist in results`).toBeDefined();
      expect(r!.sourceRows).toBe(expected);
      expect(r!.migratedRows).toBe(expected);
    };

    check('world_state', 2);
    check('agents', 2);
    check('tick_history', 1);
    check('consensus_signals', 1);
    check('llm_config', 1);
    check('webhook_subscriptions', 1);
    check('events', 1);
    check('agent_responses', 1);
    check('rss_sources', 1);
    check('api_keys', 1);
    check('social_nodes', 1);
    check('social_edges', 1);
  });

  it('应正确处理 JSONB 列值转换', async () => {
    const db = createTestSqlite(sqlitePath);
    db.prepare(
      `INSERT INTO agents (id, name, persona, memory, followers, following)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('a1', 'Test', '{"name":"Test"}', '{"short":[]}', '["a2"]', '[]');
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool, queries } = createMockPool();

    await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    // 找到 agents 表的 INSERT 查询
    const agentInserts = queries.filter(
      (q) => q.text.includes('INSERT INTO agents') && q.values,
    );
    expect(agentInserts.length).toBeGreaterThan(0);

    // 验证 JSONB 字段保持为合法 JSON 字符串
    const values = agentInserts[0]!.values!;
    // persona（索引2），memory（索引3），followers（索引4），following（索引5）
    expect(() => JSON.parse(values[2] as string)).not.toThrow();
    expect(() => JSON.parse(values[3] as string)).not.toThrow();
    expect(() => JSON.parse(values[4] as string)).not.toThrow();
    expect(() => JSON.parse(values[5] as string)).not.toThrow();
  });

  it('应正确处理 BOOLEAN 列值转换', async () => {
    const db = createTestSqlite(sqlitePath);

    db.prepare(
      'INSERT INTO webhook_subscriptions (id, url, events, secret, active) VALUES (?, ?, ?, ?, ?)',
    ).run('wh-1', 'https://example.com', '["tick"]', 'sec', 1);

    db.prepare(
      'INSERT INTO api_keys (id, name, key_hash, permissions, rate_limit, active) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('k1', 'Key', 'hash1', '["read"]', 100, 0);

    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool, queries } = createMockPool();

    await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    // webhook active=1 → true（active 是 columns 中第5个，索引4）
    const webhookInserts = queries.filter(
      (q) => q.text.includes('INSERT INTO webhook_subscriptions') && q.values,
    );
    expect(webhookInserts.length).toBeGreaterThan(0);
    expect(webhookInserts[0]!.values![4]).toBe(true);

    // api_keys active=0 → false（active 是 columns 中第8个，索引7）
    const keyInserts = queries.filter(
      (q) => q.text.includes('INSERT INTO api_keys') && q.values,
    );
    expect(keyInserts.length).toBeGreaterThan(0);
    expect(keyInserts[0]!.values![7]).toBe(false);
  });

  it('空数据库不应产生错误', async () => {
    const db = createTestSqlite(sqlitePath);
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool } = createMockPool();

    const results = await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    for (const r of results) {
      expect(r.sourceRows).toBe(0);
      expect(r.migratedRows).toBe(0);
      expect(r.errors).toHaveLength(0);
    }
  });

  it('批量大小应正确控制分批插入', async () => {
    const db = createTestSqlite(sqlitePath);
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO world_state (key, value) VALUES (?, ?)').run(`key-${i}`, `val-${i}`);
    }
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool, queries } = createMockPool();

    await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 2, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    // world_state 5 行 / batchSize 2 = 3 批次 BEGIN
    const begins = queries.filter((q) => q.text === 'BEGIN');
    expect(begins.length).toBeGreaterThanOrEqual(3);
  });

  it('consensus_signals 应重置序列', async () => {
    const db = createTestSqlite(sqlitePath);
    db.prepare('INSERT INTO consensus_signals (tick, topic, data) VALUES (?, ?, ?)').run(1, 't', '{}');
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool, queries } = createMockPool();

    await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    const setvals = queries.filter((q) => q.text.includes('setval'));
    expect(setvals.length).toBeGreaterThan(0);
    expect(setvals[0]!.text).toContain('consensus_signals');
  });

  it('应处理 SQLite 中不存在的表', async () => {
    // 创建只有 world_state 表的数据库
    const db = new Database(sqlitePath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS world_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.prepare('INSERT INTO world_state (key, value) VALUES (?, ?)').run('tick', '1');
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool } = createMockPool();

    const results = await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    const ws = results.find((r) => r.table === 'world_state');
    expect(ws!.sourceRows).toBe(1);

    const agents = results.find((r) => r.table === 'agents');
    expect(agents!.sourceRows).toBe(0);
    expect(agents!.errors).toHaveLength(0);
  });

  it('NULL 值应正确传递', async () => {
    const db = createTestSqlite(sqlitePath);
    db.prepare(
      'INSERT INTO llm_config (tier, base_url, api_key, model, max_tokens, temperature) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('local', 'http://localhost', 'key', 'model', null, null);
    db.close();

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const { pool, queries } = createMockPool();

    await migrate(
      { sqlitePath, postgresUrl: 'postgresql://mock:mock@localhost/mock', batchSize: 100, dryRun: false },
      { sqliteDb, pgPool: pool },
    );

    sqliteDb.close();

    const llmInserts = queries.filter(
      (q) => q.text.includes('INSERT INTO llm_config') && q.values,
    );
    expect(llmInserts.length).toBeGreaterThan(0);
    // max_tokens（索引4）和 temperature（索引5）应为 null
    expect(llmInserts[0]!.values![4]).toBeNull();
    expect(llmInserts[0]!.values![5]).toBeNull();
  });
});
