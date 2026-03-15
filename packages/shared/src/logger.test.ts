// ============================================================================
// @beeclaw/shared logger 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  setLogLevel,
  getLogLevel,
  setJsonMode,
  isJsonMode,
} from './logger.js';
import type { LogLevel } from './logger.js';

// ── 全局控制函数 ──

describe('setLogLevel / getLogLevel', () => {
  const originalLevel = getLogLevel();

  afterEach(() => {
    setLogLevel(originalLevel);
  });

  it('应能设置和获取日志级别', () => {
    setLogLevel('debug');
    expect(getLogLevel()).toBe('debug');

    setLogLevel('warn');
    expect(getLogLevel()).toBe('warn');

    setLogLevel('error');
    expect(getLogLevel()).toBe('error');
  });
});

describe('setJsonMode / isJsonMode', () => {
  const originalMode = isJsonMode();

  afterEach(() => {
    setJsonMode(originalMode);
  });

  it('应能切换 JSON 模式', () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);

    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
  });
});

// ── createLogger ──

describe('createLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalLevel = getLogLevel();
  const originalJsonMode = isJsonMode();

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('debug');
    setJsonMode(false);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    setLogLevel(originalLevel);
    setJsonMode(originalJsonMode);
  });

  // ── 基本日志方法 ──

  describe('日志方法', () => {
    it('info 应通过 console.log 输出', () => {
      const logger = createLogger('TestModule');
      logger.info('测试消息');

      expect(logSpy).toHaveBeenCalledOnce();
      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain('[TestModule]');
      expect(output).toContain('测试消息');
    });

    it('warn 应通过 console.warn 输出', () => {
      const logger = createLogger('TestModule');
      logger.warn('警告消息');

      expect(warnSpy).toHaveBeenCalledOnce();
      const output = warnSpy.mock.calls[0]![0] as string;
      expect(output).toContain('[TestModule]');
      expect(output).toContain('⚠️');
      expect(output).toContain('警告消息');
    });

    it('error 应通过 console.error 输出', () => {
      const logger = createLogger('TestModule');
      logger.error('错误消息');

      expect(errorSpy).toHaveBeenCalledOnce();
      const output = errorSpy.mock.calls[0]![0] as string;
      expect(output).toContain('[TestModule]');
      expect(output).toContain('❌');
      expect(output).toContain('错误消息');
    });

    it('debug 应通过 console.log 输出并带 🔍', () => {
      const logger = createLogger('TestModule');
      logger.debug('调试消息');

      expect(logSpy).toHaveBeenCalledOnce();
      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain('[TestModule]');
      expect(output).toContain('🔍');
      expect(output).toContain('调试消息');
    });
  });

  // ── 附加数据 ──

  describe('附加数据', () => {
    it('应在消息后附加 JSON 数据', () => {
      const logger = createLogger('TestModule');
      logger.info('有数据', { key: 'value', count: 42 });

      expect(logSpy).toHaveBeenCalledOnce();
      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain('有数据');
      expect(output).toContain('"key":"value"');
      expect(output).toContain('"count":42');
    });

    it('无附加数据时不应有多余输出', () => {
      const logger = createLogger('TestModule');
      logger.info('纯消息');

      const output = logSpy.mock.calls[0]![0] as string;
      // 不应包含 {}
      expect(output).toBe('[TestModule] 纯消息');
    });
  });

  // ── 日志级别过滤 ──

  describe('日志级别过滤', () => {
    it('低于全局级别的日志不应输出', () => {
      setLogLevel('warn');
      const logger = createLogger('TestModule');

      logger.debug('不应输出');
      logger.info('不应输出');

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('等于或高于全局级别的日志应输出', () => {
      setLogLevel('warn');
      const logger = createLogger('TestModule');

      logger.warn('应输出');
      logger.error('应输出');

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    it('error 级别应只输出 error', () => {
      setLogLevel('error');
      const logger = createLogger('TestModule');

      logger.debug('不输出');
      logger.info('不输出');
      logger.warn('不输出');
      logger.error('输出');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    it('debug 级别应输出所有日志', () => {
      setLogLevel('debug');
      const logger = createLogger('TestModule');

      logger.debug('输出');
      logger.info('输出');
      logger.warn('输出');
      logger.error('输出');

      expect(logSpy).toHaveBeenCalledTimes(2); // debug + info
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledOnce();
    });
  });

  // ── JSON 模式 ──

  describe('JSON 模式', () => {
    it('JSON 模式下应输出一行 JSON', () => {
      setJsonMode(true);
      const logger = createLogger('TestModule');
      logger.info('JSON 消息', { key: 'val' });

      expect(logSpy).toHaveBeenCalledOnce();
      const output = logSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('info');
      expect(parsed.module).toBe('TestModule');
      expect(parsed.msg).toBe('JSON 消息');
      expect(parsed.key).toBe('val');
      expect(parsed.ts).toBeDefined();
    });

    it('JSON 模式下 error 应通过 console.error 输出', () => {
      setJsonMode(true);
      const logger = createLogger('TestModule');
      logger.error('错误');

      expect(errorSpy).toHaveBeenCalledOnce();
      const output = errorSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('error');
    });

    it('JSON 模式下 warn 应通过 console.warn 输出', () => {
      setJsonMode(true);
      const logger = createLogger('TestModule');
      logger.warn('警告');

      expect(warnSpy).toHaveBeenCalledOnce();
      const output = warnSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('warn');
    });

    it('JSON 模式下 debug/info 应通过 console.log 输出', () => {
      setJsonMode(true);
      const logger = createLogger('TestModule');
      logger.info('信息');

      expect(logSpy).toHaveBeenCalledOnce();
      const output = logSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('info');
    });
  });

  // ── baseData 绑定 ──

  describe('baseData 绑定', () => {
    it('应在每条日志中包含 baseData', () => {
      setJsonMode(true);
      const logger = createLogger('Server', { requestId: 'abc123' });
      logger.info('请求处理');

      const output = logSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.requestId).toBe('abc123');
    });

    it('data 应覆盖同名 baseData 字段', () => {
      setJsonMode(true);
      const logger = createLogger('Server', { requestId: 'abc' });
      logger.info('覆盖', { requestId: 'xyz' });

      const output = logSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.requestId).toBe('xyz');
    });

    it('开发模式下 baseData 应在输出中可见', () => {
      setJsonMode(false);
      const logger = createLogger('Server', { userId: '42' });
      logger.info('用户操作');

      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain('"userId":"42"');
    });
  });

  // ── 子 Logger ──

  describe('child Logger', () => {
    it('子 Logger 应包含父模块名和子模块名', () => {
      const parent = createLogger('Server');
      const child = parent.child('API');
      child.info('子模块消息');

      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain('[Server:API]');
    });

    it('子 Logger 应继承父 baseData', () => {
      setJsonMode(true);
      const parent = createLogger('Server', { version: '1.0' });
      const child = parent.child('API', { requestId: 'req1' });
      child.info('继承测试');

      const output = logSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.version).toBe('1.0');
      expect(parsed.requestId).toBe('req1');
      expect(parsed.module).toBe('Server:API');
    });

    it('子 Logger 的 childData 应覆盖父 baseData 同名字段', () => {
      setJsonMode(true);
      const parent = createLogger('Server', { env: 'prod' });
      const child = parent.child('API', { env: 'test' });
      child.info('覆盖测试');

      const output = logSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.env).toBe('test');
    });

    it('多层 child 应正确拼接模块名', () => {
      const root = createLogger('App');
      const level1 = root.child('Server');
      const level2 = level1.child('API');
      level2.info('深层嵌套');

      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain('[App:Server:API]');
    });
  });
});
