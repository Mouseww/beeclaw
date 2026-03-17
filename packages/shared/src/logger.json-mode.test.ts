// ============================================================================
// @beeclaw/shared logger JSON 模式补充测试
// 覆盖 JSON 模式下的输出分支和子 Logger 的 JSON 格式
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createLogger,
  setLogLevel,
  getLogLevel,
  setJsonMode,
  isJsonMode,
} from './logger.js';

describe('logger JSON 模式完整覆盖', () => {
  const originalLevel = getLogLevel();
  const originalMode = isJsonMode();

  afterEach(() => {
    setLogLevel(originalLevel);
    setJsonMode(originalMode);
    vi.restoreAllMocks();
  });

  it('JSON 模式下 info 应输出一行 JSON 到 console.log', () => {
    setJsonMode(true);
    setLogLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('TestModule');
    logger.info('测试消息', { key: 'value' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.module).toBe('TestModule');
    expect(parsed.msg).toBe('测试消息');
    expect(parsed.key).toBe('value');
    expect(parsed.ts).toBeDefined();
  });

  it('JSON 模式下 error 应输出到 console.error', () => {
    setJsonMode(true);
    setLogLevel('debug');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger('ErrorModule');
    logger.error('出错了', { code: 500 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('error');
    expect(parsed.msg).toBe('出错了');
    expect(parsed.code).toBe(500);
  });

  it('JSON 模式下 warn 应输出到 console.warn', () => {
    setJsonMode(true);
    setLogLevel('debug');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = createLogger('WarnModule');
    logger.warn('警告信息');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = warnSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('warn');
  });

  it('JSON 模式下 debug 应输出到 console.log', () => {
    setJsonMode(true);
    setLogLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('DebugModule');
    logger.debug('调试信息');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('debug');
  });

  it('日志级别过滤应在 JSON 模式下工作', () => {
    setJsonMode(true);
    setLogLevel('warn');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger('FilterTest');
    logger.debug('不应输出');
    logger.info('不应输出');
    logger.warn('应输出');
    logger.error('应输出');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('带 baseData 的 Logger 应在 JSON 输出中包含基础字段', () => {
    setJsonMode(true);
    setLogLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('BaseDataModule', { requestId: 'req-123' });
    logger.info('带基础数据');

    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBe('req-123');
    expect(parsed.module).toBe('BaseDataModule');
  });

  it('child Logger 在 JSON 模式下应继承父模块名和基础数据', () => {
    setJsonMode(true);
    setLogLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const parent = createLogger('Server', { requestId: 'req-456' });
    const child = parent.child('API', { userId: 'user-789' });
    child.info('子模块消息');

    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.module).toBe('Server:API');
    expect(parsed.requestId).toBe('req-456');
    expect(parsed.userId).toBe('user-789');
  });

  it('非 JSON 模式下带附加数据的 info 应输出可读格式', () => {
    setJsonMode(false);
    setLogLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('ReadableModule');
    logger.info('可读消息', { extra: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('[ReadableModule]');
    expect(output).toContain('可读消息');
    expect(output).toContain('"extra":true');
  });

  it('非 JSON 模式下无附加数据时不输出 extra', () => {
    setJsonMode(false);
    setLogLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('CleanModule');
    logger.info('干净消息');

    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('[CleanModule] 干净消息');
    // 不应有 JSON 附加数据
    expect(output).not.toContain('{');
  });

  it('非 JSON 模式下 debug 应带 🔍 前缀', () => {
    setJsonMode(false);
    setLogLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('DebugIcon');
    logger.debug('调试');

    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('🔍');
  });

  it('非 JSON 模式下 error 应带 ❌ 前缀到 console.error', () => {
    setJsonMode(false);
    setLogLevel('debug');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger('ErrorIcon');
    logger.error('错误');

    const output = errorSpy.mock.calls[0][0];
    expect(output).toContain('❌');
  });

  it('非 JSON 模式下 warn 应带 ⚠️ 前缀到 console.warn', () => {
    setJsonMode(false);
    setLogLevel('debug');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = createLogger('WarnIcon');
    logger.warn('警告');

    const output = warnSpy.mock.calls[0][0];
    expect(output).toContain('⚠️');
  });
});
