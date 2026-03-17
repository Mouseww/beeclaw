// ============================================================================
// @beeclaw/event-ingestion ContentDeduplicator 单元测试
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentDeduplicator } from './ContentDeduplicator.js';
import type { IngestedEvent } from './types.js';

/** 构造测试用 IngestedEvent */
function makeEvent(overrides: Partial<IngestedEvent> = {}): IngestedEvent {
  return {
    title: '测试标题',
    content: '测试内容',
    category: 'finance',
    source: 'test-source',
    importance: 0.5,
    propagationRadius: 0.3,
    tags: ['test'],
    ...overrides,
  };
}

describe('ContentDeduplicator', () => {
  let dedup: ContentDeduplicator;

  beforeEach(() => {
    dedup = new ContentDeduplicator();
  });

  // ── 基础功能 ──

  describe('基础功能', () => {
    it('新事件应判定为不重复', () => {
      const event = makeEvent({ deduplicationId: 'unique-1' });
      const result = dedup.check(event);
      expect(result.isDuplicate).toBe(false);
      expect(result.reason).toBeUndefined();
      expect(result.matchedId).toBeUndefined();
    });

    it('size() 应返回缓存大小', () => {
      expect(dedup.size()).toBe(0);
      dedup.record(makeEvent({ deduplicationId: 'a' }));
      expect(dedup.size()).toBe(1);
      dedup.record(makeEvent({ deduplicationId: 'b', title: '不同标题', content: '不同内容' }));
      expect(dedup.size()).toBe(2);
    });

    it('clear() 应清空所有缓存', () => {
      dedup.record(makeEvent({ deduplicationId: 'a' }));
      dedup.record(makeEvent({ deduplicationId: 'b', title: '不同', content: '不同' }));
      expect(dedup.size()).toBe(2);

      dedup.clear();
      expect(dedup.size()).toBe(0);

      // 清空后之前的事件不再被判定为重复
      const result = dedup.check(makeEvent({ deduplicationId: 'a' }));
      expect(result.isDuplicate).toBe(false);
    });
  });

  // ── 精确 ID 匹配 ──

  describe('精确 ID 匹配 (exact_id)', () => {
    it('相同 deduplicationId 应判定为重复', () => {
      const event = makeEvent({ deduplicationId: 'same-id' });
      dedup.record(event);

      const result = dedup.check(event);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('exact_id');
      expect(result.matchedId).toBe('same-id');
    });

    it('不同 deduplicationId 不应判定为 exact_id 重复', () => {
      dedup.record(makeEvent({ deduplicationId: 'id-1' }));
      const result = dedup.check(makeEvent({ deduplicationId: 'id-2', title: '不同标题', content: '不同内容' }));
      expect(result.isDuplicate).toBe(false);
    });

    it('无 deduplicationId 时应基于 source + title 自动生成 ID', () => {
      const event = makeEvent({ deduplicationId: undefined, source: 'src-x', title: '标题X' });
      dedup.record(event);

      // 相同 source + title 应被判定为重复
      const sameEvent = makeEvent({ deduplicationId: undefined, source: 'src-x', title: '标题X' });
      const result = dedup.check(sameEvent);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('exact_id');
    });
  });

  // ── 内容哈希匹配 ──

  describe('内容哈希匹配 (content_hash)', () => {
    it('相同标题+内容、不同 ID 应通过内容哈希判定为重复', () => {
      const event1 = makeEvent({
        deduplicationId: 'id-a',
        title: '央行加息',
        content: '央行宣布加息25个基点。',
      });
      dedup.record(event1);

      const event2 = makeEvent({
        deduplicationId: 'id-b',
        title: '央行加息',
        content: '央行宣布加息25个基点。',
      });
      const result = dedup.check(event2);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('content_hash');
      expect(result.matchedId).toBe('id-a');
    });

    it('不同内容不应通过内容哈希判定为重复', () => {
      dedup.record(makeEvent({ deduplicationId: 'id-a', title: '标题A', content: '内容A' }));

      const result = dedup.check(makeEvent({
        deduplicationId: 'id-b',
        title: '标题B',
        content: '完全不同的内容B',
      }));
      expect(result.isDuplicate).toBe(false);
    });

    it('内容哈希仅使用前 500 字', () => {
      const longContent = 'A'.repeat(500);
      const event1 = makeEvent({
        deduplicationId: 'id-long-1',
        title: '同一标题',
        content: longContent + '额外内容1',
      });
      const event2 = makeEvent({
        deduplicationId: 'id-long-2',
        title: '同一标题',
        content: longContent + '额外内容2',
      });

      dedup.record(event1);
      const result = dedup.check(event2);
      // 前 500 字相同，应判定为重复
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('content_hash');
    });
  });

  // ── 标题相似度匹配 ──

  describe('标题相似度匹配 (title_similarity)', () => {
    it('精确相同标题（归一化后）应判定为重复', () => {
      const event1 = makeEvent({
        deduplicationId: 'title-1',
        title: '央行宣布降息！',
        content: '内容A',
      });
      dedup.record(event1);

      // 相同标题但标点不同
      const event2 = makeEvent({
        deduplicationId: 'title-2',
        title: '央行宣布降息',
        content: '完全不同的内容BBBBBBBBBBBBBBBBB',
      });
      const result = dedup.check(event2);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('title_similarity');
    });

    it('高度相似的标题应判定为重复（模糊匹配）', () => {
      const event1 = makeEvent({
        deduplicationId: 'fuzzy-1',
        title: '美联储今日宣布加息25个基点',
        content: '内容AAAAAAAAAAAA独特AAA',
      });
      dedup.record(event1);

      const event2 = makeEvent({
        deduplicationId: 'fuzzy-2',
        title: '美联储今日宣布加息50个基点',
        content: '内容BBBBBBBBBBBBB独特BBBBB',
      });
      const result = dedup.check(event2);
      // 标题高度相似（仅数字不同），Dice 系数应 >= 0.85
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('title_similarity');
    });

    it('完全不同的标题不应判定为重复', () => {
      dedup.record(makeEvent({
        deduplicationId: 'diff-1',
        title: '苹果公司发布新产品',
        content: '独特内容AAAA',
      }));

      const result = dedup.check(makeEvent({
        deduplicationId: 'diff-2',
        title: '央行宣布降息政策调整',
        content: '独特内容BBBB',
      }));
      expect(result.isDuplicate).toBe(false);
    });
  });

  // ── normalizeTitle 方法 ──

  describe('normalizeTitle', () => {
    it('应转为小写', () => {
      expect(dedup.normalizeTitle('HELLO World')).toBe('hello world');
    });

    it('应去除中英文标点', () => {
      expect(dedup.normalizeTitle('你好，世界！')).toBe('你好世界');
      expect(dedup.normalizeTitle('hello, world!')).toBe('hello world');
    });

    it('应统一空白符', () => {
      expect(dedup.normalizeTitle('hello   world')).toBe('hello world');
      // 全角空格
      expect(dedup.normalizeTitle('hello\u3000world')).toBe('hello world');
    });

    it('应去除前后空白', () => {
      expect(dedup.normalizeTitle('  hello  ')).toBe('hello');
    });

    it('应处理空字符串', () => {
      expect(dedup.normalizeTitle('')).toBe('');
    });
  });

  // ── computeContentHash 方法 ──

  describe('computeContentHash', () => {
    it('相同 title+content 应产生相同哈希', () => {
      const e1 = makeEvent({ title: 'T', content: 'C' });
      const e2 = makeEvent({ title: 'T', content: 'C' });
      expect(dedup.computeContentHash(e1)).toBe(dedup.computeContentHash(e2));
    });

    it('不同 title 应产生不同哈希', () => {
      const e1 = makeEvent({ title: 'T1', content: 'C' });
      const e2 = makeEvent({ title: 'T2', content: 'C' });
      expect(dedup.computeContentHash(e1)).not.toBe(dedup.computeContentHash(e2));
    });

    it('哈希应为 64 位十六进制字符串 (SHA-256)', () => {
      const hash = dedup.computeContentHash(makeEvent());
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── computeTitleSimilarity 方法 ──

  describe('computeTitleSimilarity', () => {
    it('完全相同的字符串应返回 1', () => {
      expect(dedup.computeTitleSimilarity('abc', 'abc')).toBe(1);
    });

    it('完全不同的字符串应返回较低值', () => {
      const sim = dedup.computeTitleSimilarity('abcdef', 'xyz123');
      expect(sim).toBeLessThan(0.3);
    });

    it('单字符串应返回 0', () => {
      expect(dedup.computeTitleSimilarity('a', 'abc')).toBe(0);
      expect(dedup.computeTitleSimilarity('abc', 'b')).toBe(0);
    });

    it('空字符串应返回 0', () => {
      expect(dedup.computeTitleSimilarity('', 'abc')).toBe(0);
    });

    it('高度相似字符串应返回高值', () => {
      const sim = dedup.computeTitleSimilarity(
        '美联储今日宣布加息25个基点',
        '美联储今日宣布加息50个基点',
      );
      expect(sim).toBeGreaterThan(0.8);
    });
  });

  // ── checkAndRecord 原子操作 ──

  describe('checkAndRecord', () => {
    it('非重复事件应被记录到缓存', () => {
      const event = makeEvent({ deduplicationId: 'car-1' });
      const result = dedup.checkAndRecord(event);

      expect(result.isDuplicate).toBe(false);
      expect(dedup.size()).toBe(1);

      // 再次检查应为重复
      const result2 = dedup.checkAndRecord(event);
      expect(result2.isDuplicate).toBe(true);
      expect(result2.reason).toBe('exact_id');
    });

    it('重复事件不应被重复记录', () => {
      const event = makeEvent({ deduplicationId: 'car-2' });
      dedup.checkAndRecord(event);
      dedup.checkAndRecord(event);

      // 缓存大小仍然是 1
      expect(dedup.size()).toBe(1);
    });
  });

  // ── 缓存淘汰 ──

  describe('缓存淘汰 (trimCache)', () => {
    it('超过 maxSize 应淘汰最旧的条目', () => {
      const smallDedup = new ContentDeduplicator({ maxSize: 3 });

      smallDedup.record(makeEvent({ deduplicationId: 'old-1', title: '旧1', content: '旧内容1' }));
      smallDedup.record(makeEvent({ deduplicationId: 'old-2', title: '旧2', content: '旧内容2' }));
      smallDedup.record(makeEvent({ deduplicationId: 'old-3', title: '旧3', content: '旧内容3' }));
      expect(smallDedup.size()).toBe(3);

      // 新增一个，应淘汰最旧的 old-1
      smallDedup.record(makeEvent({ deduplicationId: 'new-4', title: '新4', content: '新内容4' }));
      expect(smallDedup.size()).toBe(3);

      // old-1 应已被淘汰
      const result = smallDedup.check(makeEvent({ deduplicationId: 'old-1' }));
      expect(result.isDuplicate).toBe(false);

      // new-4 应仍存在
      const result2 = smallDedup.check(makeEvent({ deduplicationId: 'new-4', title: '新4', content: '新内容4' }));
      expect(result2.isDuplicate).toBe(true);
    });

    it('未超过 maxSize 不应淘汰', () => {
      const smallDedup = new ContentDeduplicator({ maxSize: 5 });
      for (let i = 0; i < 5; i++) {
        smallDedup.record(makeEvent({
          deduplicationId: `item-${i}`,
          title: `标题${i}`,
          content: `内容${i}`,
        }));
      }
      expect(smallDedup.size()).toBe(5);
    });
  });

  // ── 构造配置 ──

  describe('构造配置', () => {
    it('默认 maxSize 应为 10000', () => {
      const bigDedup = new ContentDeduplicator();
      // 通过不会淘汰来间接验证
      for (let i = 0; i < 100; i++) {
        bigDedup.record(makeEvent({
          deduplicationId: `cfg-${i}`,
          title: `配置测试${i}`,
          content: `配置内容${i}`,
        }));
      }
      expect(bigDedup.size()).toBe(100);
    });

    it('自定义 titleSimilarityThreshold 应影响模糊匹配', () => {
      // 设置非常高的阈值，使模糊匹配几乎不生效
      const strictDedup = new ContentDeduplicator({ titleSimilarityThreshold: 0.99 });
      strictDedup.record(makeEvent({
        deduplicationId: 'strict-1',
        title: '美联储今日宣布加息25个基点',
        content: '独特严格内容AAAAAA',
      }));

      const result = strictDedup.check(makeEvent({
        deduplicationId: 'strict-2',
        title: '美联储今日宣布加息50个基点',
        content: '独特严格内容BBBBBB',
      }));
      // 阈值 0.99 太高，模糊匹配不会生效
      expect(result.isDuplicate).toBe(false);
    });
  });

  // ── 策略优先级 ──

  describe('策略优先级', () => {
    it('exact_id 优先于 content_hash', () => {
      const event = makeEvent({ deduplicationId: 'priority-1', title: '优先级', content: '优先级内容' });
      dedup.record(event);

      const result = dedup.check(event);
      // 虽然内容哈希也匹配，但应先命中 exact_id
      expect(result.reason).toBe('exact_id');
    });

    it('content_hash 优先于 title_similarity', () => {
      const event1 = makeEvent({
        deduplicationId: 'hash-priority-1',
        title: '相同标题测试',
        content: '相同内容测试',
      });
      dedup.record(event1);

      // 用不同 ID 但相同 title+content
      const event2 = makeEvent({
        deduplicationId: 'hash-priority-2',
        title: '相同标题测试',
        content: '相同内容测试',
      });
      const result = dedup.check(event2);
      expect(result.reason).toBe('content_hash');
    });
  });

  // ── 模糊匹配性能保护 ──

  describe('模糊匹配性能保护', () => {
    it('缓存超过 5000 条时不执行模糊标题匹配', () => {
      // 使用 maxSize 足够大的去重器
      const largeDedup = new ContentDeduplicator({ maxSize: 6000 });

      // 注入 5001 条不同记录
      for (let i = 0; i < 5001; i++) {
        largeDedup.record(makeEvent({
          deduplicationId: `perf-${i}`,
          title: `性能测试标题${i}`,
          content: `性能测试内容${i}`,
        }));
      }
      expect(largeDedup.size()).toBe(5001);

      // 用一个相似但不同 ID、不同内容哈希的标题
      const result = largeDedup.check(makeEvent({
        deduplicationId: 'perf-new',
        title: '性能测试标题0修改版',  // 与 性能测试标题0 相似
        content: '完全独特的新内容ZZZZZZZZZ',
      }));

      // 因为缓存>5000，模糊匹配不执行，只要精确标题和哈希不匹配就不会重复
      expect(result.isDuplicate).toBe(false);
    });
  });
});
