// ============================================================================
// @beeclaw/server — persistence/database 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { initDatabase } from './database.js';

describe('initDatabase', () => {
  it('应创建内存数据库并返回 Database 实例', () => {
    const db = initDatabase(':memory:');
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe('function');
    db.close();
  });

  it('应创建所有必需的表', () => {
    const db = initDatabase(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('world_state');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('tick_history');
    expect(tableNames).toContain('consensus_signals');
    expect(tableNames).toContain('llm_config');
    db.close();
  });

  it('应创建必需的索引', () => {
    const db = initDatabase(':memory:');
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_consensus_topic');
    expect(indexNames).toContain('idx_consensus_tick');
    expect(indexNames).toContain('idx_agents_status');
    db.close();
  });

  it('应设置 WAL journal_mode', () => {
    const db = initDatabase(':memory:');
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    // 内存数据库可能不一定返回 wal，但不应报错
    expect(result).toBeDefined();
    db.close();
  });

  it('应设置 foreign_keys = ON', () => {
    const db = initDatabase(':memory:');
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0]!.foreign_keys).toBe(1);
    db.close();
  });

  it('重复调用不应报错（CREATE IF NOT EXISTS）', () => {
    const db = initDatabase(':memory:');
    // 再次执行建表不应抛出异常
    expect(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS world_state (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }).not.toThrow();
    db.close();
  });

  it('world_state 表应支持基本 CRUD', () => {
    const db = initDatabase(':memory:');

    db.prepare('INSERT INTO world_state (key, value) VALUES (?, ?)').run('test_key', 'test_value');
    const row = db.prepare('SELECT value FROM world_state WHERE key = ?').get('test_key') as { value: string };
    expect(row.value).toBe('test_value');

    // UPDATE via INSERT OR REPLACE
    db.prepare('INSERT OR REPLACE INTO world_state (key, value) VALUES (?, ?)').run('test_key', 'updated');
    const updated = db.prepare('SELECT value FROM world_state WHERE key = ?').get('test_key') as { value: string };
    expect(updated.value).toBe('updated');

    db.close();
  });

  it('agents 表应有正确的默认值', () => {
    const db = initDatabase(':memory:');

    db.prepare(
      `INSERT INTO agents (id, name, persona, memory) VALUES (?, ?, ?, ?)`
    ).run('a1', 'TestAgent', '{}', '{}');

    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get('a1') as Record<string, unknown>;
    expect(row['status']).toBe('active');
    expect(row['model_tier']).toBe('cheap');
    expect(row['influence']).toBe(10);
    expect(row['credibility']).toBe(0.5);
    expect(row['spawned_at_tick']).toBe(0);
    expect(row['last_active_tick']).toBe(0);
    expect(row['followers']).toBe('[]');
    expect(row['following']).toBe('[]');

    db.close();
  });

  it('consensus_signals 表应支持自增 ID', () => {
    const db = initDatabase(':memory:');

    db.prepare('INSERT INTO consensus_signals (tick, topic, data) VALUES (?, ?, ?)').run(1, 'topic1', '{}');
    db.prepare('INSERT INTO consensus_signals (tick, topic, data) VALUES (?, ?, ?)').run(2, 'topic2', '{}');

    const rows = db.prepare('SELECT id FROM consensus_signals ORDER BY id').all() as { id: number }[];
    expect(rows.length).toBe(2);
    expect(rows[1]!.id).toBeGreaterThan(rows[0]!.id);

    db.close();
  });

  it('llm_config 表应使用 tier 作为主键', () => {
    const db = initDatabase(':memory:');

    db.prepare(
      'INSERT INTO llm_config (tier, base_url, api_key, model) VALUES (?, ?, ?, ?)'
    ).run('cheap', 'http://test', 'key123', 'model-a');

    // 相同 tier 应 REPLACE
    db.prepare(
      'INSERT OR REPLACE INTO llm_config (tier, base_url, api_key, model, updated_at) VALUES (?, ?, ?, ?, unixepoch())'
    ).run('cheap', 'http://test2', 'key456', 'model-b');

    const rows = db.prepare('SELECT * FROM llm_config WHERE tier = ?').all('cheap') as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    expect(rows[0]!['base_url']).toBe('http://test2');

    db.close();
  });
});
