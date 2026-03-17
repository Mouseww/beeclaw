// ============================================================================
// ResponseCache 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseCache } from './ResponseCache.js';

describe('ResponseCache', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache();
  });

  // ── 构造 ──

  describe('构造函数', () => {
    it('应使用默认配置初始化', () => {
      expect(cache.size).toBe(0);
      expect(cache.enabled).toBe(true);
    });

    it('应接受自定义配置', () => {
      const custom = new ResponseCache({ ttlMs: 1000, maxEntries: 10, enabled: false });
      expect(custom.enabled).toBe(false);
    });
  });

  // ── computeHash ──

  describe('computeHash', () => {
    it('相同消息应生成相同 hash', () => {
      const msgs = [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '你好' },
      ];
      const hash1 = cache.computeHash(msgs);
      const hash2 = cache.computeHash(msgs);
      expect(hash1).toBe(hash2);
    });

    it('不同消息应生成不同 hash', () => {
      const hash1 = cache.computeHash([{ role: 'user', content: '你好' }]);
      const hash2 = cache.computeHash([{ role: 'user', content: '世界' }]);
      expect(hash1).not.toBe(hash2);
    });

    it('hash 应为 64 字符的十六进制字符串（SHA-256）', () => {
      const hash = cache.computeHash([{ role: 'user', content: 'test' }]);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('消息顺序不同应生成不同 hash', () => {
      const msgs1 = [
        { role: 'system', content: 'A' },
        { role: 'user', content: 'B' },
      ];
      const msgs2 = [
        { role: 'user', content: 'B' },
        { role: 'system', content: 'A' },
      ];
      expect(cache.computeHash(msgs1)).not.toBe(cache.computeHash(msgs2));
    });
  });

  // ── get / set ──

  describe('get / set', () => {
    it('set 后 get 应返回缓存值', () => {
      const hash = 'test-hash-1';
      cache.set(hash, '响应内容');
      expect(cache.get(hash)).toBe('响应内容');
      expect(cache.size).toBe(1);
    });

    it('get 不存在的 hash 应返回 null', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('禁用时 get 应始终返回 null', () => {
      cache.setEnabled(false);
      cache.set('hash1', 'value1');
      expect(cache.get('hash1')).toBeNull();
    });

    it('禁用时 set 不应添加条目', () => {
      cache.setEnabled(false);
      cache.set('hash1', 'value1');
      expect(cache.size).toBe(0);
    });

    it('get 命中后应增加 hitCount', () => {
      const hash = 'test-hash';
      cache.set(hash, '响应');
      cache.get(hash);
      cache.get(hash);
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });
  });

  // ── TTL 过期 ──

  describe('TTL 过期', () => {
    it('过期条目应返回 null', () => {
      const shortCache = new ResponseCache({ ttlMs: 50 });
      shortCache.set('hash1', 'value1');
      expect(shortCache.get('hash1')).toBe('value1');

      // 模拟时间流逝
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      expect(shortCache.get('hash1')).toBeNull();
      vi.useRealTimers();
    });

    it('evictExpired 应清理过期条目', () => {
      vi.useFakeTimers();
      const shortCache = new ResponseCache({ ttlMs: 100 });
      shortCache.set('hash1', 'value1');
      shortCache.set('hash2', 'value2');

      vi.advanceTimersByTime(150);
      const evicted = shortCache.evictExpired();
      expect(evicted).toBe(2);
      expect(shortCache.size).toBe(0);
      vi.useRealTimers();
    });

    it('未过期条目不应被 evictExpired 清理', () => {
      vi.useFakeTimers();
      const shortCache = new ResponseCache({ ttlMs: 1000 });
      shortCache.set('hash1', 'value1');

      vi.advanceTimersByTime(500);
      const evicted = shortCache.evictExpired();
      expect(evicted).toBe(0);
      expect(shortCache.size).toBe(1);
      vi.useRealTimers();
    });
  });

  // ── 容量限制与淘汰 ──

  describe('容量限制', () => {
    it('超过 maxEntries 时应淘汰旧条目', () => {
      const smallCache = new ResponseCache({ maxEntries: 3 });
      smallCache.set('hash1', 'v1');
      smallCache.set('hash2', 'v2');
      smallCache.set('hash3', 'v3');
      expect(smallCache.size).toBe(3);

      // 第四个条目应触发淘汰
      smallCache.set('hash4', 'v4');
      expect(smallCache.size).toBe(3);
      // 最旧的 hash1 应被淘汰
      expect(smallCache.get('hash1')).toBeNull();
      expect(smallCache.get('hash4')).not.toBeNull();
    });
  });

  // ── getOrFetch ──

  describe('getOrFetch', () => {
    it('首次调用应执行 fetcher 并缓存', async () => {
      const fetcher = vi.fn().mockResolvedValue('LLM 响应');
      const messages = [{ role: 'user', content: '你好' }];

      const result = await cache.getOrFetch(messages, fetcher);
      expect(result).toBe('LLM 响应');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.size).toBe(1);
    });

    it('第二次调用相同消息应返回缓存，不调用 fetcher', async () => {
      const fetcher = vi.fn().mockResolvedValue('LLM 响应');
      const messages = [{ role: 'user', content: '你好' }];

      await cache.getOrFetch(messages, fetcher);
      const result2 = await cache.getOrFetch(messages, fetcher);
      expect(result2).toBe('LLM 响应');
      expect(fetcher).toHaveBeenCalledTimes(1); // 只调用一次
    });

    it('不同消息应分别缓存', async () => {
      const fetcher1 = vi.fn().mockResolvedValue('响应1');
      const fetcher2 = vi.fn().mockResolvedValue('响应2');

      const r1 = await cache.getOrFetch([{ role: 'user', content: 'A' }], fetcher1);
      const r2 = await cache.getOrFetch([{ role: 'user', content: 'B' }], fetcher2);

      expect(r1).toBe('响应1');
      expect(r2).toBe('响应2');
      expect(cache.size).toBe(2);
    });

    it('fetcher 抛出异常应向上传播', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('API 错误'));
      const messages = [{ role: 'user', content: '你好' }];

      await expect(cache.getOrFetch(messages, fetcher)).rejects.toThrow('API 错误');
      expect(cache.size).toBe(0); // 不应缓存失败的响应
    });
  });

  // ── 统计 ──

  describe('统计', () => {
    it('初始统计应全部为零', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.evictions).toBe(0);
    });

    it('应正确统计命中率', () => {
      cache.set('h1', 'v1');
      cache.get('h1'); // hit
      cache.get('h1'); // hit
      cache.get('h2'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('resetStats 应重置统计但保留缓存', () => {
      cache.set('h1', 'v1');
      cache.get('h1');
      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(cache.size).toBe(1); // 缓存条目仍在
    });

    it('禁用时 get 也应计为 miss', () => {
      cache.setEnabled(false);
      cache.get('h1');
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });
  });

  // ── clear ──

  describe('clear', () => {
    it('应清空缓存和统计', () => {
      cache.set('h1', 'v1');
      cache.set('h2', 'v2');
      cache.get('h1');
      cache.clear();

      expect(cache.size).toBe(0);
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ── 配置更新 ──

  describe('配置更新', () => {
    it('setEnabled 应切换启用状态', () => {
      expect(cache.enabled).toBe(true);
      cache.setEnabled(false);
      expect(cache.enabled).toBe(false);
      cache.setEnabled(true);
      expect(cache.enabled).toBe(true);
    });

    it('setTTL 应更新 TTL', () => {
      vi.useFakeTimers();
      cache.setTTL(100);
      cache.set('h1', 'v1');
      vi.advanceTimersByTime(150);
      expect(cache.get('h1')).toBeNull();
      vi.useRealTimers();
    });
  });

  // ── 补充测试：覆盖 evictOldest 和边界场景 ──

  describe('evictOldest 淘汰策略', () => {
    it('缓存已满且无过期条目时应淘汰最旧条目', () => {
      vi.useFakeTimers();
      // TTL 很长，确保条目不会过期
      const smallCache = new ResponseCache({ maxEntries: 2, ttlMs: 60_000 });
      smallCache.set('hash-old', 'old-value');
      vi.advanceTimersByTime(100);
      smallCache.set('hash-new', 'new-value');
      vi.advanceTimersByTime(100);

      // 插入第三个条目，触发 evictOldest
      smallCache.set('hash-newest', 'newest-value');

      // 最旧的 hash-old 应被淘汰
      expect(smallCache.get('hash-old')).toBeNull();
      // 较新的应保留
      expect(smallCache.get('hash-new')).toBe('new-value');
      expect(smallCache.get('hash-newest')).toBe('newest-value');
      expect(smallCache.size).toBe(2);
      vi.useRealTimers();
    });

    it('淘汰最旧条目后统计的 evictions 应正确增加', () => {
      vi.useFakeTimers();
      const smallCache = new ResponseCache({ maxEntries: 1, ttlMs: 60_000 });
      smallCache.set('h1', 'v1');
      vi.advanceTimersByTime(50);
      smallCache.set('h2', 'v2');

      const stats = smallCache.getStats();
      // h1 被 evictOldest 清除，应计入 evictions
      expect(stats.evictions).toBeGreaterThanOrEqual(1);
      vi.useRealTimers();
    });
  });

  describe('set 时先尝试 evictExpired 再 evictOldest', () => {
    it('缓存满时优先清理过期条目', () => {
      vi.useFakeTimers();
      const smallCache = new ResponseCache({ maxEntries: 2, ttlMs: 100 });
      smallCache.set('h1', 'v1');
      smallCache.set('h2', 'v2');

      // 让所有条目过期
      vi.advanceTimersByTime(200);

      // 插入新条目，应触发 evictExpired 清理掉过期的 h1, h2
      smallCache.set('h3', 'v3');
      expect(smallCache.size).toBe(1);
      expect(smallCache.get('h3')).toBe('v3');
      vi.useRealTimers();
    });

    it('部分过期时应只清理过期的，保留未过期的', () => {
      vi.useFakeTimers();
      const smallCache = new ResponseCache({ maxEntries: 2, ttlMs: 200 });
      smallCache.set('h1', 'v1');
      vi.advanceTimersByTime(100);
      smallCache.set('h2', 'v2');
      vi.advanceTimersByTime(150); // h1 过期(250ms > 200ms), h2 未过期(150ms < 200ms)

      // 插入新条目
      smallCache.set('h3', 'v3');
      expect(smallCache.get('h1')).toBeNull(); // 过期被清理
      expect(smallCache.get('h2')).toBe('v2'); // 未过期保留
      expect(smallCache.get('h3')).toBe('v3'); // 新插入
      vi.useRealTimers();
    });
  });

  describe('computeHash 边界条件', () => {
    it('空消息数组应正常生成 hash', () => {
      const hash = cache.computeHash([]);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('包含空字符串 content 的消息应正常处理', () => {
      const hash = cache.computeHash([{ role: 'user', content: '' }]);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('getOrFetch 边界条件', () => {
    it('禁用缓存时 getOrFetch 应每次都调用 fetcher', async () => {
      cache.setEnabled(false);
      const fetcher = vi.fn().mockResolvedValue('result');
      const messages = [{ role: 'user', content: '测试' }];

      const r1 = await cache.getOrFetch(messages, fetcher);
      const r2 = await cache.getOrFetch(messages, fetcher);

      expect(r1).toBe('result');
      expect(r2).toBe('result');
      // 禁用缓存时 set 无效，每次都会调用 fetcher
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('过期条目 get 时自动清理', () => {
    it('get 过期条目时应增加 evictions 计数', () => {
      vi.useFakeTimers();
      const shortCache = new ResponseCache({ ttlMs: 50 });
      shortCache.set('h1', 'v1');
      vi.advanceTimersByTime(100);

      shortCache.get('h1'); // 触发过期清理
      const stats = shortCache.getStats();
      expect(stats.evictions).toBe(1);
      expect(stats.misses).toBe(1);
      vi.useRealTimers();
    });
  });
});
