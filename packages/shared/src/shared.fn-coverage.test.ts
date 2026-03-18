// ============================================================================
// shared 包 — 函数覆盖率补充测试
// 覆盖 logger.ts 和 utils.ts 中 V8 未触达的函数（闭包、回调、child）
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createLogger,
  setLogLevel,
  getLogLevel,
  setJsonMode,
  isJsonMode,
} from './logger.js';
import {
  batchProcess,
  randomSample,
  extractJson,
} from './utils.js';

// ══════════════════════════════════════════════════════════════════════════════
// logger.ts 补充
// ══════════════════════════════════════════════════════════════════════════════

describe('logger 函数覆盖率补充', () => {
  const originalLevel = getLogLevel();
  const originalMode = isJsonMode();

  afterEach(() => {
    setLogLevel(originalLevel);
    setJsonMode(originalMode);
    vi.restoreAllMocks();
  });

  describe('createLogger 闭包中的 log 函数', () => {
    it('debug/info/warn/error 四个方法都应调用内部 log 函数', () => {
      setLogLevel('debug');
      setJsonMode(false);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const logger = createLogger('TestMod');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(logSpy).toHaveBeenCalledTimes(2); // debug + info
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('JSON 模式下所有 level 的分支路径', () => {
    it('JSON 模式 debug 应走 console.log', () => {
      setLogLevel('debug');
      setJsonMode(true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createLogger('Mod');
      logger.debug('test debug');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('debug');
    });

    it('JSON 模式 info 应走 console.log (else 分支)', () => {
      setLogLevel('debug');
      setJsonMode(true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createLogger('Mod');
      logger.info('test info');

      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('info');
    });
  });

  describe('child 函数', () => {
    it('child 应创建新的 createLogger 调用', () => {
      setLogLevel('debug');
      setJsonMode(true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const parent = createLogger('Parent', { pid: 1 });
      const child = parent.child('Child', { cid: 2 });
      child.debug('child msg');

      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed.module).toBe('Parent:Child');
      expect(parsed.pid).toBe(1);
      expect(parsed.cid).toBe(2);
    });

    it('child 无 childData 时应只继承 baseData', () => {
      setLogLevel('debug');
      setJsonMode(true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const parent = createLogger('P', { key: 'val' });
      const child = parent.child('C');
      child.info('msg');

      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed.module).toBe('P:C');
      expect(parsed.key).toBe('val');
    });
  });

  describe('开发模式下 baseData 和 data 合并', () => {
    it('baseData + data 同时存在时应合并输出', () => {
      setLogLevel('debug');
      setJsonMode(false);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createLogger('Merged', { base: 'b' });
      logger.info('msg', { extra: 'e' });

      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('"base":"b"');
      expect(output).toContain('"extra":"e"');
    });

    it('仅有 baseData 无 data 时也应输出 baseData', () => {
      setLogLevel('debug');
      setJsonMode(false);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createLogger('OnlyBase', { only: 'base' });
      logger.info('msg');

      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('"only":"base"');
    });
  });

  describe('级别过滤的早期返回', () => {
    it('低于 minLevel 的日志应触发早期返回', () => {
      setLogLevel('error');
      setJsonMode(false);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const logger = createLogger('Filter');
      logger.debug('should not appear');
      logger.info('should not appear');
      logger.warn('should not appear');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// utils.ts 补充
// ══════════════════════════════════════════════════════════════════════════════

describe('utils 函数覆盖率补充', () => {
  describe('batchProcess — Promise.allSettled 回调路径', () => {
    it('所有 fulfilled 时应收集所有 result.value', async () => {
      const results = await batchProcess([1, 2, 3, 4], 2, async (x) => x * 10);
      expect(results).toEqual([10, 20, 30, 40]);
    });

    it('混合 rejected 时应只收集 fulfilled', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const results = await batchProcess([1, 2, 3], 3, async (x) => {
        if (x === 2) throw new Error('fail');
        return x * 10;
      });
      expect(results).toEqual([10, 30]);
      errorSpy.mockRestore();
    });
  });

  describe('randomSample — sort 回调', () => {
    it('sort 回调应被执行（多元素数组）', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample = randomSample(arr, 5);
      expect(sample).toHaveLength(5);
      for (const item of sample) {
        expect(arr).toContain(item);
      }
    });
  });

  describe('extractJson — 多分支覆盖', () => {
    it('code block 内 JSON 无效时应降级到裸 JSON 提取', () => {
      const text = '```json\n[invalid json\n```\n{"fallback": true}';
      const result = extractJson<{ fallback: boolean }>(text);
      expect(result).toEqual({ fallback: true });
    });

    it('code block 有效时应直接返回不走后续分支', () => {
      const text = '```json\n{"valid": true}\n```\n{"ignored": true}';
      const result = extractJson<{ valid: boolean }>(text);
      expect(result).toEqual({ valid: true });
    });

    it('无 code block + 有裸 JSON 时应走第二分支', () => {
      const text = 'some text {"bare": 123} more text';
      const result = extractJson<{ bare: number }>(text);
      expect(result).toEqual({ bare: 123 });
    });

    it('无 code block + 无裸 JSON + 文本本身是有效 JSON 时走第三分支', () => {
      const result = extractJson<number>('42');
      expect(result).toBe(42);
    });

    it('无 code block + 无裸 JSON + 文本无效 JSON 时返回 null', () => {
      const result = extractJson('plain text without json');
      expect(result).toBeNull();
    });
  });
});
