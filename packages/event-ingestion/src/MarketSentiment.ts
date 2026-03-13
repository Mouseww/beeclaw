// ============================================================================
// MarketSentiment — 市场情绪推断引擎
// 从价格变动中推断市场情绪，计算波动率指标
// ============================================================================

import type { QuoteData, MarketSentimentResult, MarketSentimentType } from './types.js';

/** 价格历史记录（用于计算波动率） */
interface PriceHistory {
  prices: number[];
  maxSize: number;
}

export class MarketSentiment {
  private priceHistories: Map<string, PriceHistory> = new Map();
  private historySize: number;

  constructor(historySize = 20) {
    this.historySize = historySize;
  }

  /**
   * 评估单个标的的市场情绪
   */
  evaluate(quote: QuoteData, prevQuote?: QuoteData): MarketSentimentResult {
    // 记录价格历史
    this.recordPrice(quote.symbol, quote.price);

    const changePercent = quote.changePercent;
    const volatility = this.calculateVolatility(quote.symbol);
    const trend = this.determineTrend(changePercent);
    const sentiment = this.determineSentiment(changePercent, volatility);
    const intensity = this.calculateIntensity(changePercent, volatility, prevQuote, quote);
    const description = this.generateDescription(quote, sentiment, trend, volatility);

    return {
      symbol: quote.symbol,
      sentiment,
      intensity: Math.round(intensity * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      trend,
      description,
    };
  }

  /**
   * 清空价格历史（用于测试或重置）
   */
  clearHistory(): void {
    this.priceHistories.clear();
  }

  /**
   * 获取指定标的的价格历史长度
   */
  getHistoryLength(symbol: string): number {
    return this.priceHistories.get(symbol)?.prices.length ?? 0;
  }

  // ── 内部方法 ──

  /**
   * 记录价格到历史中
   */
  private recordPrice(symbol: string, price: number): void {
    let history = this.priceHistories.get(symbol);
    if (!history) {
      history = { prices: [], maxSize: this.historySize };
      this.priceHistories.set(symbol, history);
    }

    history.prices.push(price);

    // 维护固定大小
    if (history.prices.length > history.maxSize) {
      history.prices.shift();
    }
  }

  /**
   * 计算波动率（基于价格历史的标准差 / 均值）
   * 返回 0-1 归一化值
   */
  calculateVolatility(symbol: string): number {
    const history = this.priceHistories.get(symbol);
    if (!history || history.prices.length < 2) return 0;

    const prices = history.prices;
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    if (mean === 0) return 0;

    // 计算收益率的标准差
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1]! !== 0) {
        returns.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
      }
    }

    if (returns.length === 0) return 0;

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // 归一化到 0-1（经验值：日波动率超过 5% 视为极高波动）
    return Math.min(1, stdDev / 0.05);
  }

  /**
   * 从价格变动推断趋势方向
   */
  private determineTrend(changePercent: number): 'bullish' | 'bearish' | 'sideways' {
    if (changePercent >= 1) return 'bullish';
    if (changePercent <= -1) return 'bearish';
    return 'sideways';
  }

  /**
   * 从价格变动和波动率推断市场情绪
   */
  private determineSentiment(changePercent: number, volatility: number): MarketSentimentType {
    // 大幅下跌 + 高波动 = 极度恐慌
    if (changePercent <= -7 || (changePercent <= -5 && volatility >= 0.6)) {
      return 'extreme_fear';
    }
    // 中幅下跌 = 恐慌
    if (changePercent <= -3) {
      return 'fear';
    }
    // 大幅上涨 + 高波动 = 极度贪婪
    if (changePercent >= 7 || (changePercent >= 5 && volatility >= 0.6)) {
      return 'extreme_greed';
    }
    // 中幅上涨 = 贪婪
    if (changePercent >= 3) {
      return 'greed';
    }
    // 其余 = 中性
    return 'neutral';
  }

  /**
   * 计算情绪强度 (0-1)
   * 综合考虑价格变动幅度、波动率和前后对比
   */
  private calculateIntensity(
    changePercent: number,
    volatility: number,
    prevQuote?: QuoteData,
    currentQuote?: QuoteData,
  ): number {
    // 基础强度：来自价格变动幅度
    const absChange = Math.abs(changePercent);
    let intensity = Math.min(1, absChange / 10); // 10% 对应强度 1.0

    // 波动率加成
    intensity = Math.min(1, intensity + volatility * 0.2);

    // 如果相比上次轮询有加速变化，增加强度
    if (prevQuote && currentQuote) {
      const prevChange = Math.abs(prevQuote.changePercent);
      const currChange = Math.abs(currentQuote.changePercent);
      if (currChange > prevChange * 1.5) {
        intensity = Math.min(1, intensity + 0.15);
      }
    }

    return intensity;
  }

  /**
   * 生成情绪描述文本
   */
  private generateDescription(
    quote: QuoteData,
    sentiment: MarketSentimentType,
    trend: string,
    volatility: number,
  ): string {
    const assetLabel = this.getAssetLabel(quote.type);
    const direction = quote.changePercent >= 0 ? '上涨' : '下跌';
    const absChange = Math.abs(quote.changePercent).toFixed(2);

    const parts: string[] = [];

    parts.push(`${assetLabel} ${quote.name}(${quote.symbol}) 今日${direction}${absChange}%`);

    switch (sentiment) {
      case 'extreme_fear':
        parts.push('市场处于极度恐慌状态，投资者大量抛售');
        break;
      case 'fear':
        parts.push('市场情绪偏向恐慌，投资者趋于保守');
        break;
      case 'neutral':
        parts.push('市场情绪相对平稳，观望气氛浓厚');
        break;
      case 'greed':
        parts.push('市场情绪偏向贪婪，投资者积极买入');
        break;
      case 'extreme_greed':
        parts.push('市场处于极度贪婪状态，可能存在过度乐观风险');
        break;
    }

    if (volatility >= 0.7) {
      parts.push('波动率极高，市场不确定性显著');
    } else if (volatility >= 0.4) {
      parts.push('波动率较高，需关注风险');
    }

    return parts.join('。') + '。';
  }

  private getAssetLabel(type: string): string {
    switch (type) {
      case 'stock': return '股票';
      case 'crypto': return '加密货币';
      case 'forex': return '外汇';
      case 'commodity': return '大宗商品';
      default: return '金融标的';
    }
  }
}
