// ============================================================================
// BeeClaw Server — 持久化层：数据库驱动工厂
// 根据 BEECLAW_DB_DRIVER 环境变量选择 SQLite 或 PostgreSQL 驱动
// ============================================================================

import { Pool } from 'pg';
import { initDatabase } from './database.js';
import { SqliteAdapter } from './store.js';
import { PostgresAdapter } from './postgres-adapter.js';
import type { DatabaseAdapter } from './adapter.js';

export type DbDriver = 'sqlite' | 'postgres';

export interface CreateStoreOptions {
  /** 数据库驱动类型，默认从 BEECLAW_DB_DRIVER 读取，fallback 为 'sqlite' */
  driver?: DbDriver;
  /** SQLite 文件路径（仅 sqlite 驱动） */
  sqlitePath?: string;
  /** PostgreSQL 连接字符串（仅 postgres 驱动），默认从 DATABASE_URL 读取 */
  postgresUrl?: string;
}

export interface CreateStoreResult {
  store: DatabaseAdapter;
  driver: DbDriver;
  /** 优雅关闭回调 */
  close: () => Promise<void>;
}

/**
 * createStore — 工厂函数，根据配置创建对应的数据库适配器
 *
 * 优先级：options.driver > BEECLAW_DB_DRIVER > 默认 sqlite
 */
export async function createStore(options: CreateStoreOptions = {}): Promise<CreateStoreResult> {
  const driver = (options.driver ?? process.env['BEECLAW_DB_DRIVER'] ?? 'sqlite') as DbDriver;

  if (driver === 'postgres') {
    const connectionString = options.postgresUrl ?? process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error(
        '[createStore] PostgreSQL 驱动需要连接字符串：设置 DATABASE_URL 环境变量或传入 postgresUrl 参数'
      );
    }

    const pool = new Pool({ connectionString });
    const adapter = new PostgresAdapter(pool);

    // 建表
    await adapter.ensureSchema();

    console.log(`[Store] PostgreSQL 已初始化 (${connectionString.replace(/\/\/[^@]*@/, '//***@')})`);

    return {
      store: adapter,
      driver: 'postgres',
      close: async () => {
        await pool.end();
      },
    };
  }

  // 默认: SQLite
  const db = initDatabase(options.sqlitePath ?? process.env['BEECLAW_DB_PATH']);
  const adapter = new SqliteAdapter(db);

  console.log(`[Store] SQLite 已初始化`);

  return {
    store: adapter,
    driver: 'sqlite',
    close: async () => {
      db.close();
    },
  };
}
