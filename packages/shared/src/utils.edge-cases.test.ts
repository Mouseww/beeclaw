// ============================================================================
// @beeclaw/shared utils 边界条件补充测试
// 覆盖 batchProcess 错误处理、randomPick 空数组等边界
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  batchProcess,
  randomPick,
  randomSample,
  extractJson,
  safeJsonParse,
  randomInRange,
  weightedAverage,
  clamp,
  truncate,
} from './utils.js';

describe('batchProcess 边界条件', () => {
  it('空数组应返回空结果', async () => {
    const results = await batchProcess([], 5, async (x: number) => x * 2);
    expect(results).toEqual([]);
  });

  it('单批次应正常处理', async () => {
    const items = [1, 2, 3];
    const results = await batchProcess(items, 10, async (x) => x * 2);
    expect(results).toEqual([2, 4, 6]);
  });

  it('多批次应正确分割处理', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await batchProcess(items, 2, async (x) => x * 10);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('处理器抛出异常时应跳过失败项并记录错误', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items = [1, 2, 3, 4, 5];
    const results = await batchProcess(items, 3, async (x) => {
      if (x === 3) throw new Error('item 3 failed');
      return x * 10;
    });

    // 1, 2 成功; 3 失败; 4, 5 成功
    expect(results).toEqual([10, 20, 40, 50]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[BeeClaw] Batch item failed:',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('batchSize=1 时应逐个处理', async () => {
    const order: number[] = [];
    const items = [1, 2, 3];
    await batchProcess(items, 1, async (x) => {
      order.push(x);
      return x;
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it('所有项都失败时应返回空数组', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items = [1, 2, 3];
    const results = await batchProcess(items, 5, async () => {
      throw new Error('all fail');
    });
    expect(results).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
  });
});

describe('randomPick 边界条件', () => {
  it('空数组应抛出错误', () => {
    expect(() => randomPick([])).toThrow('Cannot pick from empty array');
  });

  it('单元素数组应返回唯一元素', () => {
    expect(randomPick([42])).toBe(42);
  });
});

describe('randomSample 边界条件', () => {
  it('n 大于数组长度时应返回全部元素', () => {
    const result = randomSample([1, 2, 3], 10);
    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual([1, 2, 3]);
  });

  it('n=0 时应返回空数组', () => {
    expect(randomSample([1, 2, 3], 0)).toEqual([]);
  });

  it('空数组应返回空数组', () => {
    expect(randomSample([], 5)).toEqual([]);
  });
});

describe('randomInRange 边界条件', () => {
  it('min 等于 max 时应返回该值', () => {
    expect(randomInRange(5, 5)).toBe(5);
  });

  it('负数范围应正常工作', () => {
    const result = randomInRange(-10, -5);
    expect(result).toBeGreaterThanOrEqual(-10);
    expect(result).toBeLessThan(-5);
  });
});

describe('extractJson 边界条件', () => {
  it('纯文本（无 JSON）应返回 null', () => {
    expect(extractJson('hello world no json here')).toBeNull();
  });

  it('空字符串应返回 null', () => {
    expect(extractJson('')).toBeNull();
  });

  it('裸 JSON 对象应直接解析', () => {
    const result = extractJson<{ a: number }>('{"a": 1}');
    expect(result).toEqual({ a: 1 });
  });

  it('裸 JSON 数组应直接解析', () => {
    const result = extractJson<number[]>('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('混合文本中的 JSON 应被提取', () => {
    const text = '前面的文字 {"key": "value"} 后面的文字';
    expect(extractJson<{ key: string }>(text)).toEqual({ key: 'value' });
  });

  it('markdown 代码块中的 JSON 应被提取', () => {
    const text = '一些描述\n```json\n{"code": true}\n```\n更多描述';
    expect(extractJson<{ code: boolean }>(text)).toEqual({ code: true });
  });

  it('无语言标记的代码块也应被提取', () => {
    const text = '```\n{"noLang": 42}\n```';
    expect(extractJson<{ noLang: number }>(text)).toEqual({ noLang: 42 });
  });

  it('损坏的 JSON 应返回 null', () => {
    expect(extractJson('{broken: json}')).toBeNull();
  });
});

describe('safeJsonParse 边界条件', () => {
  it('有效 JSON 应正确解析', () => {
    expect(safeJsonParse<number>('42')).toBe(42);
  });

  it('无效 JSON 应返回 null', () => {
    expect(safeJsonParse('not json')).toBeNull();
  });
});

describe('weightedAverage 边界条件', () => {
  it('weight=0 应保留旧值', () => {
    expect(weightedAverage(10, 20, 0)).toBe(10);
  });

  it('weight=1 应使用新值', () => {
    expect(weightedAverage(10, 20, 1)).toBe(20);
  });

  it('weight=0.5 应取均值', () => {
    expect(weightedAverage(10, 20, 0.5)).toBe(15);
  });
});

describe('clamp 边界条件', () => {
  it('值在范围内应保持不变', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('值低于最小值应返回最小值', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('值高于最大值应返回最大值', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('值等于边界应返回该值', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('truncate 边界条件', () => {
  it('短于 maxLen 的字符串不应截断', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('等于 maxLen 的字符串不应截断', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('超过 maxLen 应截断并添加省略号', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('maxLen 小于等于 3 时应只返回裁切结果', () => {
    expect(truncate('hello', 3)).toBe('hel');
    expect(truncate('hello', 1)).toBe('h');
    expect(truncate('hello', 0)).toBe('');
  });
});
