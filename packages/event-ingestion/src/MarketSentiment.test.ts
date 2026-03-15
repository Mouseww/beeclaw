// ============================================================================
// MarketSentiment 单元测试
// 测试市场情绪推断、波动率计算、趋势判断
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketSentiment } from './MarketSentiment.js';
import type { QuoteData } from './types.js';

function createQuote(overrides: Partial<QuoteData> = {}): QuoteData {
  return {
    symbol: 'AAPL',
    name: 'Apple',
    type: 'stock',
    price: 150,
    change: 0,
    changePercent: 0,
    timestamp: new Date(),
    currency: 'USD',
    ...overrides,
  };
}

describe('MarketSentiment', () => {
  let sentiment: MarketSentiment;

  beforeEach(() => {
    sentiment = new MarketSentiment();
  });

  // ── 基础功能 ──

  describe('基础功能', () => {
    it('应返回完整的情绪评估结果', () => {
      const quote = createQuote({ changePercent: 0 });
      const result = sentiment.evaluate(quote);

      expect(result.symbol).toBe('AAPL');
      expect(typeof result.sentiment).toBe('string');
      expect(typeof result.intensity).toBe('number');
      expect(typeof result.volatility).toBe('number');
      expect(typeof result.trend).toBe('string');
      expect(typeof result.description).toBe('string');
    });

    it('intensity 应在 0-1 范围内', () => {
      const extremeQuote = createQuote({ changePercent: 50 });
      const result = sentiment.evaluate(extremeQuote);
      expect(result.intensity).toBeGreaterThanOrEqual(0);
      expect(result.intensity).toBeLessThanOrEqual(1);
    });

    it('volatility 应在 0-1 范围内', () => {
      // 添加一些历史价格来产生波动
      for (let i = 0; i < 10; i++) {
        sentiment.evaluate(createQuote({ price: 100 + (i % 2 === 0 ? 10 : -10) }));
      }
      const result = sentiment.evaluate(createQuote({ price: 110 }));
      expect(result.volatility).toBeGreaterThanOrEqual(0);
      expect(result.volatility).toBeLessThanOrEqual(1);
    });
  });

  // ── 情绪判定 ──

  describe('情绪判定', () => {
    it('大幅下跌 (-7%+) 应为 extreme_fear', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: -8 }));
      expect(result.sentiment).toBe('extreme_fear');
    });

    it('中幅下跌 (-3% ~ -7%) 应为 fear', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: -4 }));
      expect(result.sentiment).toBe('fear');
    });

    it('小幅波动 (-3% ~ +3%) 应为 neutral', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 1 }));
      expect(result.sentiment).toBe('neutral');
    });

    it('中幅上涨 (+3% ~ +7%) 应为 greed', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 5 }));
      expect(result.sentiment).toBe('greed');
    });

    it('大幅上涨 (+7%+) 应为 extreme_greed', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 10 }));
      expect(result.sentiment).toBe('extreme_greed');
    });

    it('下跌 -5% 且高波动应为 extreme_fear', () => {
      // 先制造高波动历史
      const prices = [100, 120, 80, 110, 70, 130, 60, 140, 50, 150];
      for (const price of prices) {
        sentiment.evaluate(createQuote({ symbol: 'VOL', price }));
      }

      const result = sentiment.evaluate(createQuote({
        symbol: 'VOL',
        price: 140,
        changePercent: -5,
      }));
      // 高波动 + -5% 下跌 → extreme_fear
      expect(result.sentiment).toBe('extreme_fear');
    });

    it('上涨 +5% 且高波动应为 extreme_greed', () => {
      const prices = [100, 120, 80, 110, 70, 130, 60, 140, 50, 150];
      for (const price of prices) {
        sentiment.evaluate(createQuote({ symbol: 'VOL2', price }));
      }

      const result = sentiment.evaluate(createQuote({
        symbol: 'VOL2',
        price: 160,
        changePercent: 5,
      }));
      expect(result.sentiment).toBe('extreme_greed');
    });
  });

  // ── 趋势判定 ──

  describe('趋势判定', () => {
    it('上涨 >= 1% 应为 bullish', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 2 }));
      expect(result.trend).toBe('bullish');
    });

    it('下跌 <= -1% 应为 bearish', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: -2 }));
      expect(result.trend).toBe('bearish');
    });

    it('-1% 到 +1% 应为 sideways', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 0.5 }));
      expect(result.trend).toBe('sideways');
    });

    it('changePercent 为 0 应为 sideways', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 0 }));
      expect(result.trend).toBe('sideways');
    });
  });

  // ── 波动率计算 ──

  describe('波动率计算', () => {
    it('单一价格记录波动率应为 0', () => {
      sentiment.evaluate(createQuote({ symbol: 'SINGLE', price: 100 }));
      expect(sentiment.calculateVolatility('SINGLE')).toBe(0);
    });

    it('恒定价格波动率应为 0', () => {
      for (let i = 0; i < 5; i++) {
        sentiment.evaluate(createQuote({ symbol: 'FLAT', price: 100 }));
      }
      expect(sentiment.calculateVolatility('FLAT')).toBe(0);
    });

    it('价格波动越大波动率越高', () => {
      // 低波动
      for (let i = 0; i < 10; i++) {
        sentiment.evaluate(createQuote({ symbol: 'LOW', price: 100 + (i % 2) }));
      }
      // 高波动
      for (let i = 0; i < 10; i++) {
        sentiment.evaluate(createQuote({ symbol: 'HIGH', price: 100 + (i % 2 === 0 ? 20 : -20) }));
      }

      const lowVol = sentiment.calculateVolatility('LOW');
      const highVol = sentiment.calculateVolatility('HIGH');
      expect(highVol).toBeGreaterThan(lowVol);
    });

    it('未记录的标的波动率应为 0', () => {
      expect(sentiment.calculateVolatility('UNKNOWN')).toBe(0);
    });
  });

  // ── 情绪强度 ──

  describe('情绪强度', () => {
    it('变动越大强度越高', () => {
      const small = sentiment.evaluate(createQuote({ changePercent: 1 }));
      const large = sentiment.evaluate(createQuote({
        symbol: 'BIG',
        changePercent: 8,
      }));
      expect(large.intensity).toBeGreaterThan(small.intensity);
    });

    it('加速变动应增加强度', () => {
      const prev = createQuote({ changePercent: 2 });
      const curr = createQuote({ changePercent: 8 }); // 加速上涨

      const result = sentiment.evaluate(curr, prev);
      // 8% 变动的基础强度 = 0.8，加上加速加成
      expect(result.intensity).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ── 描述文本 ──

  describe('描述文本', () => {
    it('上涨时描述应包含"上涨"', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 3 }));
      expect(result.description).toContain('上涨');
    });

    it('下跌时描述应包含"下跌"', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: -4 }));
      expect(result.description).toContain('下跌');
    });

    it('extreme_fear 描述应提及恐慌', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: -10 }));
      expect(result.description).toContain('极度恐慌');
    });

    it('extreme_greed 描述应提及贪婪', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 10 }));
      expect(result.description).toContain('极度贪婪');
    });

    it('高波动描述应提及波动率', () => {
      // 制造高波动
      const prices = [100, 150, 50, 130, 40, 160, 30, 170, 20, 180];
      for (const price of prices) {
        sentiment.evaluate(createQuote({ symbol: 'HVOL', price }));
      }
      const result = sentiment.evaluate(createQuote({
        symbol: 'HVOL',
        price: 200,
        changePercent: -8,
      }));
      expect(result.description).toContain('波动率');
    });

    it('加密货币应标注为"加密货币"', () => {
      const result = sentiment.evaluate(createQuote({
        symbol: 'BTC-USD',
        name: 'Bitcoin',
        type: 'crypto',
        changePercent: 5,
      }));
      expect(result.description).toContain('加密货币');
    });
  });

  // ── 价格历史管理 ──

  describe('价格历史管理', () => {
    it('clearHistory 应清空所有历史', () => {
      sentiment.evaluate(createQuote({ symbol: 'A', price: 100 }));
      sentiment.evaluate(createQuote({ symbol: 'B', price: 200 }));

      sentiment.clearHistory();

      expect(sentiment.getHistoryLength('A')).toBe(0);
      expect(sentiment.getHistoryLength('B')).toBe(0);
    });

    it('getHistoryLength 应正确返回长度', () => {
      for (let i = 0; i < 5; i++) {
        sentiment.evaluate(createQuote({ symbol: 'LEN', price: 100 + i }));
      }
      expect(sentiment.getHistoryLength('LEN')).toBe(5);
    });

    it('历史大小应受限', () => {
      const smallSentiment = new MarketSentiment(5);
      for (let i = 0; i < 10; i++) {
        smallSentiment.evaluate(createQuote({ symbol: 'LIM', price: 100 + i }));
      }
      expect(smallSentiment.getHistoryLength('LIM')).toBe(5);
    });

    it('不同标的应有独立的历史', () => {
      sentiment.evaluate(createQuote({ symbol: 'X', price: 100 }));
      sentiment.evaluate(createQuote({ symbol: 'Y', price: 200 }));
      sentiment.evaluate(createQuote({ symbol: 'X', price: 110 }));

      expect(sentiment.getHistoryLength('X')).toBe(2);
      expect(sentiment.getHistoryLength('Y')).toBe(1);
    });
  });

  // ── 边界情况 ──

  describe('边界情况', () => {
    it('changePercent 为 0 应返回 neutral + sideways', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 0 }));
      expect(result.sentiment).toBe('neutral');
      expect(result.trend).toBe('sideways');
    });

    it('price 为 0 时不应报错', () => {
      expect(() => {
        sentiment.evaluate(createQuote({ price: 0, changePercent: -100 }));
      }).not.toThrow();
    });

    it('结果数值应为两位小数', () => {
      const result = sentiment.evaluate(createQuote({ changePercent: 3.33333 }));
      const intensityDecimals = result.intensity.toString().split('.')[1];
      if (intensityDecimals) {
        expect(intensityDecimals.length).toBeLessThanOrEqual(2);
      }
    });
  });
});
