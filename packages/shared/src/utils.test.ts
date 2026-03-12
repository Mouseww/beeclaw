// ============================================================================
// @beeclaw/shared utils 单元测试
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  generateId,
  clamp,
  randomInRange,
  randomPick,
  randomSample,
  delay,
  safeJsonParse,
  extractJson,
  formatTimestamp,
  weightedAverage,
  truncate,
  batchProcess,
} from './utils.js';

// ── generateId ──

describe('generateId', () => {
  it('应该生成 UUID 格式的 ID', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('带前缀时应包含前缀', () => {
    const id = generateId('agent');
    expect(id).toMatch(/^agent_[0-9a-f]{8}-/);
  });

  it('不带前缀时不含下划线前缀', () => {
    const id = generateId();
    expect(id).not.toContain('undefined');
  });

  it('每次生成的 ID 应不同', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});

// ── clamp ──

describe('clamp', () => {
  it('值在范围内应返回原值', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('值低于最小值应返回最小值', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('值高于最大值应返回最大值', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('边界值应正确处理', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('负数范围应正确工作', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0, -10, -1)).toBe(-1);
  });
});

// ── randomInRange ──

describe('randomInRange', () => {
  it('结果应在指定范围内', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomInRange(5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it('min 等于 max 时应返回该值', () => {
    expect(randomInRange(5, 5)).toBe(5);
  });
});

// ── randomPick ──

describe('randomPick', () => {
  it('应从数组中选取一个元素', () => {
    const arr = [1, 2, 3, 4, 5];
    const picked = randomPick(arr);
    expect(arr).toContain(picked);
  });

  it('单元素数组应返回该元素', () => {
    expect(randomPick([42])).toBe(42);
  });

  it('空数组应抛出错误', () => {
    expect(() => randomPick([])).toThrow('Cannot pick from empty array');
  });
});

// ── randomSample ──

describe('randomSample', () => {
  it('应返回指定数量的不重复元素', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const sample = randomSample(arr, 3);
    expect(sample).toHaveLength(3);
    // 所有元素都来自原数组
    for (const item of sample) {
      expect(arr).toContain(item);
    }
    // 无重复
    expect(new Set(sample).size).toBe(3);
  });

  it('n 大于数组长度时应返回全部元素', () => {
    const arr = [1, 2, 3];
    const sample = randomSample(arr, 10);
    expect(sample).toHaveLength(3);
  });

  it('n 为 0 时应返回空数组', () => {
    expect(randomSample([1, 2, 3], 0)).toHaveLength(0);
  });

  it('不应修改原数组', () => {
    const arr = [1, 2, 3, 4, 5];
    const original = [...arr];
    randomSample(arr, 3);
    expect(arr).toEqual(original);
  });
});

// ── delay ──

describe('delay', () => {
  it('应在指定时间后 resolve', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // 允许些许误差
  });
});

// ── safeJsonParse ──

describe('safeJsonParse', () => {
  it('有效 JSON 应正确解析', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
    expect(safeJsonParse('"hello"')).toBe('hello');
  });

  it('无效 JSON 应返回 null', () => {
    expect(safeJsonParse('not json')).toBeNull();
    expect(safeJsonParse('{broken')).toBeNull();
    expect(safeJsonParse('')).toBeNull();
  });
});

// ── extractJson ──

describe('extractJson', () => {
  it('应提取 markdown code block 中的 JSON', () => {
    const text = '这是一些文字\n```json\n{"key":"value"}\n```\n后面的文字';
    expect(extractJson(text)).toEqual({ key: 'value' });
  });

  it('应提取没有 json 标记的 code block', () => {
    const text = '```\n{"a":1}\n```';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('应提取裸 JSON 对象', () => {
    const text = '前面的文字 {"opinion":"看多","action":"speak"} 后面的文字';
    expect(extractJson(text)).toEqual({ opinion: '看多', action: 'speak' });
  });

  it('应提取裸 JSON 数组', () => {
    const text = '结果是 [1, 2, 3] 这样';
    expect(extractJson(text)).toEqual([1, 2, 3]);
  });

  it('纯 JSON 文本应直接解析', () => {
    expect(extractJson('{"x":42}')).toEqual({ x: 42 });
  });

  it('无 JSON 内容应返回 null', () => {
    expect(extractJson('这里没有 JSON 内容')).toBeNull();
  });
});

// ── formatTimestamp ──

describe('formatTimestamp', () => {
  it('应格式化为可读时间戳', () => {
    const date = new Date('2026-03-12T10:30:00.000Z');
    const result = formatTimestamp(date);
    expect(result).toBe('2026-03-12 10:30:00');
  });

  it('不应包含毫秒和 Z', () => {
    const result = formatTimestamp(new Date('2026-01-01T00:00:00.123Z'));
    expect(result).not.toContain('.');
    expect(result).not.toContain('Z');
  });
});

// ── weightedAverage ──

describe('weightedAverage', () => {
  it('weight=0 时应返回旧值', () => {
    expect(weightedAverage(10, 20, 0)).toBe(10);
  });

  it('weight=1 时应返回新值', () => {
    expect(weightedAverage(10, 20, 1)).toBe(20);
  });

  it('weight=0.5 时应返回中间值', () => {
    expect(weightedAverage(10, 20, 0.5)).toBe(15);
  });

  it('非对称权重应正确计算', () => {
    // 0.3 * 20 + 0.7 * 10 = 6 + 7 = 13
    expect(weightedAverage(10, 20, 0.3)).toBeCloseTo(13);
  });
});

// ── truncate ──

describe('truncate', () => {
  it('短字符串不应被截断', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('恰好等于 maxLen 不应截断', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('超过 maxLen 应截断并加省略号', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('截断后长度不应超过 maxLen', () => {
    const result = truncate('a very long string that goes on and on', 15);
    expect(result.length).toBeLessThanOrEqual(15);
    expect(result).toContain('...');
  });
});

// ── batchProcess ──

describe('batchProcess', () => {
  it('应正确处理所有元素', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await batchProcess(items, 2, async (x) => x * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('空数组应返回空结果', async () => {
    const results = await batchProcess([], 5, async (x) => x);
    expect(results).toEqual([]);
  });

  it('batchSize 大于数组长度时应一次处理完', async () => {
    const items = [1, 2, 3];
    const results = await batchProcess(items, 100, async (x) => x + 1);
    expect(results).toEqual([2, 3, 4]);
  });

  it('部分失败时应忽略失败项并返回成功结果', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items = [1, 2, 3, 4];
    const results = await batchProcess(items, 2, async (x) => {
      if (x === 3) throw new Error('fail');
      return x;
    });
    expect(results).toEqual([1, 2, 4]);
    consoleSpy.mockRestore();
  });

  it('应按批次并发处理', async () => {
    const order: number[] = [];
    const items = [1, 2, 3, 4, 5];
    await batchProcess(items, 2, async (x) => {
      order.push(x);
      return x;
    });
    // 所有元素都被处理
    expect(order.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
