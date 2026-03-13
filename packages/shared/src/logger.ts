// ============================================================================
// BeeClaw — 结构化日志工具
// 统一的 JSON 日志格式，便于生产环境日志收集和分析
//
// 特性：
//   - 结构化 JSON 格式输出（带 level/timestamp/module）
//   - 开发环境人类可读格式 + 生产环境一行 JSON
//   - 全局日志级别控制（BEECLAW_LOG_LEVEL 环境变量）
//   - 子 Logger 支持（child）
//   - 请求上下文绑定（requestId 等固定字段）
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  /** ISO 时间戳 */
  ts: string;
  /** 日志级别 */
  level: LogLevel;
  /** 模块名称 */
  module: string;
  /** 日志消息 */
  msg: string;
  /** 附加数据 */
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 全局最低日志级别 */
let globalMinLevel: LogLevel = (process.env['BEECLAW_LOG_LEVEL'] as LogLevel) ?? 'info';
/** 是否输出 JSON 格式（生产环境） */
let jsonMode = process.env['NODE_ENV'] === 'production';

/**
 * 设置全局日志级别
 */
export function setLogLevel(level: LogLevel): void {
  globalMinLevel = level;
}

/**
 * 获取当前全局日志级别
 */
export function getLogLevel(): LogLevel {
  return globalMinLevel;
}

/**
 * 设置是否使用 JSON 格式输出
 */
export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

/**
 * 获取当前是否使用 JSON 格式
 */
export function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * 创建带模块前缀的结构化 Logger
 *
 * @param module  模块名（如 'Server', 'WorldEngine'）
 * @param baseData 绑定到每条日志的固定字段（如 requestId）
 */
export function createLogger(module: string, baseData?: Record<string, unknown>) {
  function log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[globalMinLevel]) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      module,
      msg,
      ...baseData,
      ...data,
    };

    if (jsonMode) {
      // 生产环境：输出一行 JSON（便于 ELK/Loki 等日志系统收集）
      const output = JSON.stringify(entry);
      if (level === 'error') {
        console.error(output);
      } else if (level === 'warn') {
        console.warn(output);
      } else {
        console.log(output);
      }
    } else {
      // 开发环境：可读格式
      const prefix = `[${module}]`;
      const merged = { ...baseData, ...data };
      const extra = Object.keys(merged).length > 0
        ? ' ' + JSON.stringify(merged)
        : '';
      if (level === 'error') {
        console.error(`${prefix} ❌ ${msg}${extra}`);
      } else if (level === 'warn') {
        console.warn(`${prefix} ⚠️  ${msg}${extra}`);
      } else if (level === 'debug') {
        console.log(`${prefix} 🔍 ${msg}${extra}`);
      } else {
        console.log(`${prefix} ${msg}${extra}`);
      }
    }
  }

  return {
    debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),

    /**
     * 创建子 Logger，继承父 module 名并附加子模块名和固定字段
     *
     * @example
     * const parentLog = createLogger('Server');
     * const childLog = parentLog.child('API', { requestId: 'abc123' });
     * childLog.info('请求处理完成'); // [Server:API] 请求处理完成 {"requestId":"abc123"}
     */
    child: (subModule: string, childData?: Record<string, unknown>) => {
      return createLogger(`${module}:${subModule}`, {
        ...baseData,
        ...childData,
      });
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
