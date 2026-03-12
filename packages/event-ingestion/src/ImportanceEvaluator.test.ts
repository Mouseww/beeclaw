// ============================================================================
// @beeclaw/event-ingestion ImportanceEvaluator 单元测试
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ImportanceEvaluator } from './ImportanceEvaluator.js';
import type { FeedItem } from './types.js';

describe('ImportanceEvaluator', () => {
  let evaluator: ImportanceEvaluator;

  beforeEach(() => {
    evaluator = new ImportanceEvaluator();
  });

  // ── 基础评估 ──

  describe('基础评估', () => {
    it('无匹配关键词应返回基础重要性 0.2', () => {
      const item: FeedItem = {
        title: '天气',
        content: '晴。',
        guid: 'base-1',
      };

      const result = evaluator.evaluate(item);
      expect(result.importance).toBeGreaterThanOrEqual(0.2);
      expect(result.matchedKeywords).toHaveLength(0);
    });

    it('importance 应限制在 0-1 范围内', () => {
      // 用大量关键词堆叠来测试上限
      const item: FeedItem = {
        title: '央行加息降息美联储利率危机崩盘暴跌暴涨破产违约爆雷',
        content: 'GDP通胀CPI重大紧急突发退市熔断跌停涨停IPO收购合并上市战争冲突制裁',
        guid: 'max-1',
      };

      const result = evaluator.evaluate(item);
      expect(result.importance).toBeLessThanOrEqual(1);
      expect(result.importance).toBeGreaterThanOrEqual(0);
    });

    it('返回结果应包含 importance、propagationRadius、matchedKeywords', () => {
      const item: FeedItem = {
        title: '测试',
        content: '测试内容',
        guid: 'struct-1',
      };

      const result = evaluator.evaluate(item);
      expect(result).toHaveProperty('importance');
      expect(result).toHaveProperty('propagationRadius');
      expect(result).toHaveProperty('matchedKeywords');
      expect(Array.isArray(result.matchedKeywords)).toBe(true);
    });
  });

  // ── 高重要性关键词 ──

  describe('高重要性关键词匹配', () => {
    it('单个高关键词应增加 0.15 分', () => {
      const item: FeedItem = {
        title: '央行发布公告',
        content: '普通内容。',
        guid: 'high-single',
      };

      const result = evaluator.evaluate(item);
      // 基础 0.2 + 0.15(央行) + 可能的启发式加分
      expect(result.importance).toBeGreaterThanOrEqual(0.35);
      expect(result.matchedKeywords).toContain('央行');
    });

    it('多个高关键词应累加', () => {
      const item: FeedItem = {
        title: '央行加息引发危机',
        content: '市场暴跌。',
        guid: 'high-multi',
      };

      const result = evaluator.evaluate(item);
      expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(3);
      expect(result.importance).toBeGreaterThan(0.5);
    });

    it('关键词匹配应不区分大小写', () => {
      const item: FeedItem = {
        title: 'fed raises rates',
        content: 'The FED announced rate hike.',
        guid: 'case-1',
      };

      const result = evaluator.evaluate(item);
      expect(result.matchedKeywords).toContain('Fed');
    });

    it('关键词应在 title 和 content 中都匹配', () => {
      const titleItem: FeedItem = {
        title: '央行公告',
        content: '普通内容。',
        guid: 'title-match',
      };
      const contentItem: FeedItem = {
        title: '普通标题',
        content: '央行发布了重要公告。',
        guid: 'content-match',
      };

      const titleResult = evaluator.evaluate(titleItem);
      const contentResult = evaluator.evaluate(contentItem);

      expect(titleResult.matchedKeywords).toContain('央行');
      expect(contentResult.matchedKeywords).toContain('央行');
    });
  });

  // ── 中重要性关键词 ──

  describe('中重要性关键词匹配', () => {
    it('中关键词应增加 0.08 分', () => {
      const item: FeedItem = {
        title: '科技公司',
        content: '普通内容。',
        guid: 'med-1',
      };

      const result = evaluator.evaluate(item);
      expect(result.matchedKeywords).toContain('科技');
      expect(result.importance).toBeGreaterThanOrEqual(0.28);
    });

    it('中关键词的分数应低于高关键词', () => {
      const highItem: FeedItem = {
        title: '央行',
        content: '内容。',
        guid: 'compare-high',
      };
      const medItem: FeedItem = {
        title: '科技',
        content: '内容。',
        guid: 'compare-med',
      };

      const highResult = evaluator.evaluate(highItem);
      const medResult = evaluator.evaluate(medItem);

      expect(highResult.importance).toBeGreaterThan(medResult.importance);
    });
  });

  // ── 启发式规则 ──

  describe('启发式调整', () => {
    it('标题超过 20 字应加 0.05 分', () => {
      const shortTitle: FeedItem = {
        title: '短标题',
        content: '内容。',
        guid: 'heur-short',
      };
      const longTitle: FeedItem = {
        title: '这是一个非常长的标题用来测试启发式加分规则是否生效',
        content: '内容。',
        guid: 'heur-long',
      };

      const shortResult = evaluator.evaluate(shortTitle);
      const longResult = evaluator.evaluate(longTitle);

      expect(longResult.importance).toBeGreaterThan(shortResult.importance);
    });

    it('有分类的条目应加 0.03 分', () => {
      const noCat: FeedItem = {
        title: '测试',
        content: '内容。',
        guid: 'heur-nocat',
      };
      const withCat: FeedItem = {
        title: '测试',
        content: '内容。',
        categories: ['财经'],
        guid: 'heur-cat',
      };

      const noCatResult = evaluator.evaluate(noCat);
      const withCatResult = evaluator.evaluate(withCat);

      expect(withCatResult.importance).toBeGreaterThan(noCatResult.importance);
    });

    it('内容超过 500 字应加 0.05 分', () => {
      const shortContent: FeedItem = {
        title: '测试',
        content: '短内容。',
        guid: 'heur-short-c',
      };
      const longContent: FeedItem = {
        title: '测试',
        content: 'x'.repeat(600),
        guid: 'heur-long-c',
      };

      const shortResult = evaluator.evaluate(shortContent);
      const longResult = evaluator.evaluate(longContent);

      expect(longResult.importance).toBeGreaterThan(shortResult.importance);
    });

    it('内容 200-500 字应加 0.03 分', () => {
      const shortContent: FeedItem = {
        title: '测试',
        content: '短。',
        guid: 'heur-med-c-short',
      };
      const medContent: FeedItem = {
        title: '测试',
        content: 'x'.repeat(300),
        guid: 'heur-med-c',
      };

      const shortResult = evaluator.evaluate(shortContent);
      const medResult = evaluator.evaluate(medContent);

      expect(medResult.importance).toBeGreaterThan(shortResult.importance);
    });
  });

  // ── 传播半径 ──

  describe('传播半径', () => {
    it('propagationRadius 应与 importance 正相关', () => {
      const lowItem: FeedItem = {
        title: '天气',
        content: '晴。',
        guid: 'pr-low',
      };
      const highItem: FeedItem = {
        title: '央行加息暴跌危机',
        content: '美联储紧急加息引发崩盘。',
        guid: 'pr-high',
      };

      const lowResult = evaluator.evaluate(lowItem);
      const highResult = evaluator.evaluate(highItem);

      expect(highResult.propagationRadius).toBeGreaterThan(lowResult.propagationRadius);
    });

    it('propagationRadius 不应超过 0.8', () => {
      const item: FeedItem = {
        title: '央行加息降息美联储利率危机崩盘暴跌暴涨破产违约爆雷',
        content: 'GDP通胀CPI重大紧急突发退市熔断跌停涨停IPO收购合并上市',
        guid: 'pr-max',
      };

      const result = evaluator.evaluate(item);
      expect(result.propagationRadius).toBeLessThanOrEqual(0.8);
    });

    it('propagationRadius 应为 importance * 0.6（封顶 0.8）', () => {
      const item: FeedItem = {
        title: '天气',
        content: '晴。',
        guid: 'pr-formula',
      };

      const result = evaluator.evaluate(item);
      const expected = Math.min(0.8, result.importance * 0.6);
      expect(result.propagationRadius).toBeCloseTo(expected, 2);
    });
  });

  // ── 自定义关键词 ──

  describe('自定义关键词', () => {
    it('应支持自定义高重要性关键词', () => {
      const custom = new ImportanceEvaluator(['自定义A', '自定义B'], []);

      const item: FeedItem = {
        title: '自定义A 新闻',
        content: '内容。',
        guid: 'custom-high',
      };

      const result = custom.evaluate(item);
      expect(result.matchedKeywords).toContain('自定义A');
      expect(result.importance).toBeGreaterThanOrEqual(0.35);
    });

    it('应支持自定义中重要性关键词', () => {
      const custom = new ImportanceEvaluator([], ['中级词']);

      const item: FeedItem = {
        title: '中级词出现',
        content: '内容。',
        guid: 'custom-med',
      };

      const result = custom.evaluate(item);
      expect(result.matchedKeywords).toContain('中级词');
    });

    it('自定义关键词应完全替换默认关键词', () => {
      const custom = new ImportanceEvaluator(['唯一关键词'], []);

      const item: FeedItem = {
        title: '央行加息',
        content: '美联储降息。',
        guid: 'custom-replace',
      };

      const result = custom.evaluate(item);
      // 默认高关键词不应被匹配
      expect(result.matchedKeywords).not.toContain('央行');
      expect(result.matchedKeywords).not.toContain('加息');
    });
  });

  // ── 结果精度 ──

  describe('结果精度', () => {
    it('importance 应保留两位小数', () => {
      const item: FeedItem = {
        title: '央行',
        content: '内容。',
        guid: 'precision-1',
      };

      const result = evaluator.evaluate(item);
      const decimalPlaces = result.importance.toString().split('.')[1]?.length ?? 0;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('propagationRadius 应保留两位小数', () => {
      const item: FeedItem = {
        title: '央行',
        content: '内容。',
        guid: 'precision-2',
      };

      const result = evaluator.evaluate(item);
      const decimalPlaces = result.propagationRadius.toString().split('.')[1]?.length ?? 0;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });
});
