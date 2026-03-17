#!/usr/bin/env npx tsx
// ============================================================================
// BeeClaw — SQLite → PostgreSQL 数据迁移脚本
//
// 用法：
//   npx tsx scripts/migrate-sqlite-to-postgres.ts \
//     --sqlite-path ./data/beeclaw.db \
//     --postgres-url postgresql://user:pass@localhost:5432/beeclaw
//
// 功能：
//   - 读取 SQLite 数据库中所有表的数据
//   - 自动在 PostgreSQL 中建表（IF NOT EXISTS）
//   - 批量插入，每批 500 行，PostgreSQL 事务保护
//   - 类型适配：TEXT→JSONB、INTEGER(0/1)→BOOLEAN、AUTOINCREMENT→BIGSERIAL
//   - 进度显示、错误处理、冲突跳过（ON CONFLICT DO NOTHING）
// ============================================================================

import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;

// ── CLI 参数解析 ──

interface MigrateOptions {
  sqlitePath: string;
  postgresUrl: string;
  batchSize: number;
  dryRun: boolean;
}

function parseArgs(): MigrateOptions {
  const args = process.argv.slice(2);
  let sqlitePath = '';
  let postgresUrl = '';
  let batchSize = 500;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sqlite-path':
        sqlitePath = args[++i] ?? '';
        break;
      case '--postgres-url':
        postgresUrl = args[++i] ?? '';
        break;
      case '--batch-size':
        batchSize = parseInt(args[++i] ?? '500', 10);
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
    }
  }

  if (!sqlitePath || !postgresUrl) {
    printUsage();
    process.exit(1);
  }

  return { sqlitePath, postgresUrl, batchSize, dryRun };
}

function printUsage(): void {
  console.log(`
BeeClaw — SQLite → PostgreSQL 数据迁移脚本

用法:
  npx tsx scripts/migrate-sqlite-to-postgres.ts [选项]

必需参数:
  --sqlite-path <path>    SQLite 数据库文件路径
  --postgres-url <url>    PostgreSQL 连接字符串

可选参数:
  --batch-size <n>        每批插入的行数 (默认: 500)
  --dry-run               仅统计数据，不执行写入
  --help                  显示帮助信息
`);
}

// ── 表配置定义 ──

/** 描述单张表的迁移元数据 */
interface TableConfig {
  name: string;
  /** PostgreSQL 建表 DDL */
  createDDL: string;
  /** 列名列表（按 SQLite schema 顺序） */
  columns: string[];
  /** 需要将 TEXT→JSONB 的列名集合 */
  jsonbColumns: Set<string>;
  /** 需要将 INTEGER(0/1)→BOOLEAN 的列名集合 */
  booleanColumns: Set<string>;
  /** AUTOINCREMENT 列名（PostgreSQL 用 BIGSERIAL，插入时需特殊处理） */
  serialColumn?: string;
  /** ON CONFLICT 子句 */
  conflictClause: string;
}

function getTableConfigs(): TableConfig[] {
  return [
    {
      name: 'world_state',
      createDDL: `
        CREATE TABLE IF NOT EXISTS world_state (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`,
      columns: ['key', 'value'],
      jsonbColumns: new Set(),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (key) DO NOTHING',
    },
    {
      name: 'agents',
      createDDL: `
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
        CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`,
      columns: [
        'id', 'name', 'persona', 'memory', 'followers', 'following',
        'influence', 'credibility', 'status', 'model_tier',
        'spawned_at_tick', 'last_active_tick', 'updated_at',
      ],
      jsonbColumns: new Set(['persona', 'memory', 'followers', 'following']),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      name: 'tick_history',
      createDDL: `
        CREATE TABLE IF NOT EXISTS tick_history (
          tick                INTEGER PRIMARY KEY,
          events_processed    INTEGER NOT NULL DEFAULT 0,
          agents_activated    INTEGER NOT NULL DEFAULT 0,
          responses_collected INTEGER NOT NULL DEFAULT 0,
          new_agents_spawned  INTEGER NOT NULL DEFAULT 0,
          signals             INTEGER NOT NULL DEFAULT 0,
          duration_ms         INTEGER NOT NULL DEFAULT 0,
          created_at          BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
        )`,
      columns: [
        'tick', 'events_processed', 'agents_activated',
        'responses_collected', 'new_agents_spawned', 'signals',
        'duration_ms', 'created_at',
      ],
      jsonbColumns: new Set(),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (tick) DO NOTHING',
    },
    {
      name: 'consensus_signals',
      createDDL: `
        CREATE TABLE IF NOT EXISTS consensus_signals (
          id         BIGSERIAL PRIMARY KEY,
          tick       INTEGER NOT NULL,
          topic      TEXT NOT NULL,
          data       JSONB NOT NULL,
          created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
        );
        CREATE INDEX IF NOT EXISTS idx_consensus_topic ON consensus_signals(topic);
        CREATE INDEX IF NOT EXISTS idx_consensus_tick ON consensus_signals(tick)`,
      columns: ['id', 'tick', 'topic', 'data', 'created_at'],
      jsonbColumns: new Set(['data']),
      booleanColumns: new Set(),
      serialColumn: 'id',
      conflictClause: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      name: 'llm_config',
      createDDL: `
        CREATE TABLE IF NOT EXISTS llm_config (
          tier        TEXT PRIMARY KEY,
          base_url    TEXT NOT NULL,
          api_key     TEXT NOT NULL,
          model       TEXT NOT NULL,
          max_tokens  INTEGER,
          temperature REAL,
          updated_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
        )`,
      columns: ['tier', 'base_url', 'api_key', 'model', 'max_tokens', 'temperature', 'updated_at'],
      jsonbColumns: new Set(),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (tier) DO NOTHING',
    },
    {
      name: 'webhook_subscriptions',
      createDDL: `
        CREATE TABLE IF NOT EXISTS webhook_subscriptions (
          id         TEXT PRIMARY KEY,
          url        TEXT NOT NULL,
          events     JSONB NOT NULL DEFAULT '[]',
          secret     TEXT NOT NULL,
          active     BOOLEAN NOT NULL DEFAULT TRUE,
          created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
        )`,
      columns: ['id', 'url', 'events', 'secret', 'active', 'created_at'],
      jsonbColumns: new Set(['events']),
      booleanColumns: new Set(['active']),
      conflictClause: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      name: 'events',
      createDDL: `
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
        CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick)`,
      columns: ['id', 'tick', 'title', 'content', 'category', 'importance', 'tags', 'source_id', 'created_at'],
      jsonbColumns: new Set(['tags']),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      name: 'agent_responses',
      createDDL: `
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
        CREATE INDEX IF NOT EXISTS idx_responses_agent ON agent_responses(agent_id)`,
      columns: [
        'id', 'tick', 'event_id', 'agent_id', 'agent_name',
        'opinion', 'action', 'sentiment', 'emotional_state',
        'reasoning', 'created_at',
      ],
      jsonbColumns: new Set(),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      name: 'rss_sources',
      createDDL: `
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
        )`,
      columns: ['id', 'name', 'url', 'category', 'tags', 'poll_interval_ms', 'enabled', 'created_at', 'updated_at'],
      jsonbColumns: new Set(['tags']),
      booleanColumns: new Set(['enabled']),
      conflictClause: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      name: 'api_keys',
      createDDL: `
        CREATE TABLE IF NOT EXISTS api_keys (
          id           TEXT PRIMARY KEY,
          name         TEXT NOT NULL,
          key_hash     TEXT NOT NULL UNIQUE,
          permissions  JSONB NOT NULL DEFAULT '[]',
          rate_limit   INTEGER NOT NULL DEFAULT 100,
          created_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
          last_used_at BIGINT,
          active       BOOLEAN NOT NULL DEFAULT TRUE
        )`,
      columns: ['id', 'name', 'key_hash', 'permissions', 'rate_limit', 'created_at', 'last_used_at', 'active'],
      jsonbColumns: new Set(['permissions']),
      booleanColumns: new Set(['active']),
      conflictClause: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      name: 'social_nodes',
      createDDL: `
        CREATE TABLE IF NOT EXISTS social_nodes (
          agent_id   TEXT PRIMARY KEY,
          influence  REAL NOT NULL DEFAULT 10,
          community  TEXT NOT NULL DEFAULT 'default',
          role       TEXT NOT NULL DEFAULT 'follower',
          updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
        )`,
      columns: ['agent_id', 'influence', 'community', 'role', 'updated_at'],
      jsonbColumns: new Set(),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (agent_id) DO NOTHING',
    },
    {
      name: 'social_edges',
      createDDL: `
        CREATE TABLE IF NOT EXISTS social_edges (
          from_agent     TEXT NOT NULL,
          to_agent       TEXT NOT NULL,
          type           TEXT NOT NULL DEFAULT 'follow',
          strength       REAL NOT NULL DEFAULT 0.5,
          formed_at_tick INTEGER NOT NULL DEFAULT 0,
          updated_at     BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
          PRIMARY KEY (from_agent, to_agent)
        );
        CREATE INDEX IF NOT EXISTS idx_social_edges_from ON social_edges(from_agent);
        CREATE INDEX IF NOT EXISTS idx_social_edges_to ON social_edges(to_agent)`,
      columns: ['from_agent', 'to_agent', 'type', 'strength', 'formed_at_tick', 'updated_at'],
      jsonbColumns: new Set(),
      booleanColumns: new Set(),
      conflictClause: 'ON CONFLICT (from_agent, to_agent) DO NOTHING',
    },
  ];
}

// ── 进度显示 ──

function progressBar(current: number, total: number, width = 30): string {
  if (total === 0) return `[${'='.repeat(width)}] 0/0`;
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const percent = (ratio * 100).toFixed(1);
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}% (${current}/${total})`;
}

// ── 类型转换 ──

/**
 * 将 SQLite 原始值适配为 PostgreSQL 参数
 * - JSONB 列：确保传入合法 JSON 字符串
 * - BOOLEAN 列：0/1 → false/true
 */
function adaptValue(
  value: unknown,
  column: string,
  config: TableConfig,
): unknown {
  if (value === null || value === undefined) return null;

  if (config.booleanColumns.has(column)) {
    return Boolean(value);
  }

  if (config.jsonbColumns.has(column)) {
    if (typeof value === 'string') {
      // 验证 JSON 合法性，非法时包裹为 JSON 字符串
      try {
        JSON.parse(value);
        return value; // pg 驱动会自动处理 jsonb
      } catch {
        return JSON.stringify(value);
      }
    }
    return JSON.stringify(value);
  }

  return value;
}

// ── 核心迁移逻辑 ──

interface MigrateResult {
  table: string;
  sourceRows: number;
  migratedRows: number;
  skippedRows: number;
  errors: string[];
  durationMs: number;
}

/**
 * 迁移单张表
 */
async function migrateTable(
  sqliteDb: Database.Database,
  pgPool: pg.Pool,
  config: TableConfig,
  batchSize: number,
  dryRun: boolean,
): Promise<MigrateResult> {
  const startTime = Date.now();
  const result: MigrateResult = {
    table: config.name,
    sourceRows: 0,
    migratedRows: 0,
    skippedRows: 0,
    errors: [],
    durationMs: 0,
  };

  // 检查 SQLite 中是否存在此表
  const tableExists = sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(config.name);
  if (!tableExists) {
    console.log(`  ⏭  表 ${config.name} 在 SQLite 中不存在，跳过`);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // 读取全部数据
  const rows = sqliteDb.prepare(`SELECT * FROM ${config.name}`).all() as Record<string, unknown>[];
  result.sourceRows = rows.length;

  if (rows.length === 0) {
    console.log(`  ⏭  表 ${config.name}: 0 行，跳过`);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (dryRun) {
    console.log(`  📊 表 ${config.name}: ${rows.length} 行 (dry-run，不写入)`);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // 构建 INSERT 语句
  // 对于 BIGSERIAL 列，显式插入原始 ID 值以保持一致性
  const insertColumns = config.columns;
  const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(', ');
  const insertSQL = `INSERT INTO ${config.name} (${insertColumns.join(', ')}) VALUES (${placeholders}) ${config.conflictClause}`;

  // 分批插入
  const totalBatches = Math.ceil(rows.length / batchSize);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batch = rows.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize);
    const client = await pgPool.connect();

    try {
      await client.query('BEGIN');

      for (const row of batch) {
        const values = insertColumns.map((col) =>
          adaptValue(row[col], col, config),
        );

        try {
          const res = await client.query(insertSQL, values);
          if ((res.rowCount ?? 0) > 0) {
            result.migratedRows++;
          } else {
            result.skippedRows++;
          }
        } catch (err) {
          result.skippedRows++;
          const msg = err instanceof Error ? err.message : String(err);
          if (result.errors.length < 5) {
            result.errors.push(`Row error in ${config.name}: ${msg}`);
          }
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Batch ${batchIdx + 1} rollback: ${msg}`);
    } finally {
      client.release();
    }

    // 进度
    const done = Math.min((batchIdx + 1) * batchSize, rows.length);
    process.stdout.write(`\r  ${progressBar(done, rows.length)} `);
  }

  // 对 BIGSERIAL 表需重置序列
  if (config.serialColumn) {
    try {
      await pgPool.query(
        `SELECT setval(pg_get_serial_sequence('${config.name}', '${config.serialColumn}'), COALESCE((SELECT MAX(${config.serialColumn}) FROM ${config.name}), 1))`,
      );
    } catch {
      // 序列重置失败不阻断迁移
    }
  }

  process.stdout.write('\n');
  result.durationMs = Date.now() - startTime;
  return result;
}

// ── 主函数 ──

/**
 * 可注入依赖的迁移选项（用于测试时注入 mock）
 */
export interface MigrateDeps {
  /** 注入已打开的 SQLite 实例（跳过文件连接） */
  sqliteDb?: Database.Database;
  /** 注入 pg.Pool 实例（跳过 URL 连接） */
  pgPool?: pg.Pool;
}

export async function migrate(
  options: MigrateOptions,
  deps?: MigrateDeps,
): Promise<MigrateResult[]> {
  const { sqlitePath, postgresUrl, batchSize, dryRun } = options;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   BeeClaw — SQLite → PostgreSQL 数据迁移工具    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();
  console.log(`  SQLite 源：  ${sqlitePath}`);
  console.log(`  PostgreSQL： ${postgresUrl.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`  批大小：     ${batchSize}`);
  console.log(`  模式：       ${dryRun ? '🔍 Dry-run（仅统计）' : '🚀 正式迁移'}`);
  console.log();

  // 连接 SQLite（支持依赖注入）
  let sqliteDb: Database.Database;
  let ownsSqlite = false;
  if (deps?.sqliteDb) {
    sqliteDb = deps.sqliteDb;
  } else {
    try {
      sqliteDb = new Database(sqlitePath, { readonly: true });
      sqliteDb.pragma('journal_mode = WAL');
      ownsSqlite = true;
      console.log('✅ SQLite 连接成功');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ SQLite 连接失败: ${msg}`);
      process.exit(1);
    }
  }

  // 连接 PostgreSQL（支持依赖注入）
  let pgPool: pg.Pool;
  let ownsPool = false;
  if (deps?.pgPool) {
    pgPool = deps.pgPool;
  } else {
    pgPool = new Pool({ connectionString: postgresUrl });
    ownsPool = true;
    try {
      const client = await pgPool.connect();
      client.release();
      console.log('✅ PostgreSQL 连接成功');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ PostgreSQL 连接失败: ${msg}`);
      if (ownsSqlite) sqliteDb.close();
      process.exit(1);
    }
  }

  // 建表
  const configs = getTableConfigs();
  if (!dryRun) {
    console.log('\n📐 创建 PostgreSQL 表结构...');
    for (const config of configs) {
      try {
        await pgPool.query(config.createDDL);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ⚠️  建表 ${config.name} 失败: ${msg}`);
      }
    }
    console.log('✅ 表结构就绪');
  }

  // 逐表迁移
  console.log('\n📦 开始迁移数据...\n');
  const results: MigrateResult[] = [];
  const overallStart = Date.now();

  for (const config of configs) {
    console.log(`🔄 迁移表: ${config.name}`);
    const r = await migrateTable(sqliteDb, pgPool, config, batchSize, dryRun);
    results.push(r);

    if (r.sourceRows > 0) {
      console.log(
        `  ✅ ${r.migratedRows} 行已迁移, ${r.skippedRows} 行跳过 (${r.durationMs}ms)`,
      );
    }
    if (r.errors.length > 0) {
      for (const e of r.errors) {
        console.log(`  ⚠️  ${e}`);
      }
    }
    console.log();
  }

  const overallDuration = Date.now() - overallStart;

  // 汇总
  console.log('═══════════════════════════════════════════════════');
  console.log('                    迁移报告');
  console.log('═══════════════════════════════════════════════════');
  console.log();

  const totalSource = results.reduce((s, r) => s + r.sourceRows, 0);
  const totalMigrated = results.reduce((s, r) => s + r.migratedRows, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skippedRows, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  console.log(`  表总数：      ${configs.length}`);
  console.log(`  源数据行：    ${totalSource}`);
  console.log(`  已迁移行：    ${totalMigrated}`);
  console.log(`  跳过行：      ${totalSkipped}`);
  console.log(`  错误数：      ${totalErrors}`);
  console.log(`  总耗时：      ${overallDuration}ms`);
  console.log();

  for (const r of results) {
    const status = r.errors.length > 0 ? '⚠️' : r.sourceRows === 0 ? '⏭' : '✅';
    console.log(
      `  ${status} ${r.table.padEnd(25)} ${String(r.sourceRows).padStart(6)} → ${String(r.migratedRows).padStart(6)} (${r.durationMs}ms)`,
    );
  }

  console.log();

  if (totalErrors > 0) {
    console.log('⚠️  迁移完成，但存在错误。请检查上方日志。');
  } else if (dryRun) {
    console.log('🔍 Dry-run 完成。使用不带 --dry-run 执行正式迁移。');
  } else {
    console.log('🎉 迁移成功完成！');
  }

  // 清理（仅清理自己创建的连接）
  if (ownsSqlite) sqliteDb.close();
  if (ownsPool) await pgPool.end();

  return results;
}

// ── 入口 ──

const isDirectRun = process.argv[1]?.includes('migrate-sqlite-to-postgres');
if (isDirectRun) {
  const opts = parseArgs();
  migrate(opts).catch((err) => {
    console.error('❌ 迁移过程中出现致命错误:', err);
    process.exit(1);
  });
}
