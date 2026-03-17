// ============================================================================
// FinanceAdapter — 金融数据源适配器
// 将现有 FinanceDataSource + MarketSentiment 逻辑包装为 DataSourceAdapter
// ============================================================================

import type {
  DataSourceAdapter,
  DataSourceType,
  FinanceSourceConfig,
  FinanceSymbol,
  QuoteData,
  IngestedEvent,
  SourceHealthMetrics,
  MarketSentimentResult,
} from './types.js';
import { MarketSentiment } from './MarketSentiment.js';

/** 默认配置 */
const DEFAULTS = {
  pollIntervalMs: 60_000,
  priceChangeThreshold: 2,
  enableSentimentEvents: true,
} as const;

/** Yahoo Finance API v8 查询 URL */
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

export class FinanceAdapter implements DataSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: DataSourceType = 'finance';

  private config: FinanceSourceConfig;
  private sentiment: MarketSentiment;
  private running = false;
  private currentTick = 0;
  private timer?: ReturnType<typeof setInterval>;
  private startTime?: Date;
  private lastQuotes: Map<string, QuoteData> = new Map();

  // 健康指标追踪
  private consecutiveErrors = 0;
  private totalErrors = 0;
  private totalSuccesses = 0;
  private eventsEmitted = 0;
  private lastLatencyMs = 0;
  private latencySum = 0;
  private latencyCount = 0;
  private lastSuccessTime: Date | null = null;
  private lastErrorTime: Date | null = null;
  private lastErrorMessage: string | null = null;

  /** 允许注入自定义 fetch（用于测试） */
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;

  /** 允许注入自定义延迟函数（用于测试时跳过重试等待） */
  delayFn: (ms: number) => Promise<void>;

  constructor(config: FinanceSourceConfig) {
    this.config = {
      ...config,
      enabled: config.enabled ?? true,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
      priceChangeThreshold: config.priceChangeThreshold ?? DEFAULTS.priceChangeThreshold,
      enableSentimentEvents: config.enableSentimentEvents ?? DEFAULTS.enableSentimentEvents,
    };
    this.id = this.config.id;
    this.name = this.config.name;
    this.sentiment = new MarketSentiment();
    this.fetchFn = globalThis.fetch.bind(globalThis);
    this.delayFn = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  }

  /** 获取配置（深拷贝） */
  getConfig(): FinanceSourceConfig {
    return {
      ...this.config,
      symbols: this.config.symbols.map(s => ({ ...s })),
    };
  }

  /** 获取最新行情数据 */
  getLastQuotes(): QuoteData[] {
    return Array.from(this.lastQuotes.values());
  }

  /** 添加关注标的 */
  addSymbol(symbol: FinanceSymbol): void {
    const existing = this.config.symbols.find(s => s.symbol === symbol.symbol);
    if (!existing) {
      this.config.symbols.push(symbol);
    }
  }

  /** 移除关注标的 */
  removeSymbol(symbolId: string): void {
    this.config.symbols = this.config.symbols.filter(s => s.symbol !== symbolId);
    this.lastQuotes.delete(symbolId);
  }

  start(): void {
    if (this.running) return;
    if (!this.config.enabled) return;

    this.running = true;
    this.startTime = new Date();
    const intervalMs = this.config.pollIntervalMs!;
    console.log(
      `[FinanceAdapter] 启动: "${this.name}" ` +
      `(${this.config.symbols.length} 个标的, 间隔 ${intervalMs}ms)`,
    );

    this.poll().catch(err => {
      console.error(`[FinanceAdapter] 初始轮询失败 (${this.name}):`, err);
    });

    this.timer = setInterval(() => {
      this.poll().catch(err => {
        console.error(`[FinanceAdapter] 轮询失败 (${this.name}):`, err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
    console.log(`[FinanceAdapter] 已停止: "${this.name}"`);
  }

  async poll(): Promise<IngestedEvent[]> {
    const startMs = Date.now();
    try {
      const quotes = await this.fetchQuotes();
      const latency = Date.now() - startMs;

      // 更新健康指标
      this.lastLatencyMs = latency;
      this.latencySum += latency;
      this.latencyCount++;
      this.consecutiveErrors = 0;
      this.totalSuccesses++;
      this.lastSuccessTime = new Date();
      this.lastErrorMessage = null;

      const events: IngestedEvent[] = [];

      for (const quote of quotes) {
        const prevQuote = this.lastQuotes.get(quote.symbol);
        const quoteEvents = this.processQuote(quote, prevQuote);
        events.push(...quoteEvents);
        this.lastQuotes.set(quote.symbol, quote);
      }

      this.eventsEmitted += events.length;

      if (events.length > 0) {
        console.log(
          `[FinanceAdapter] "${this.name}" — 获取 ${quotes.length} 个行情, 产出 ${events.length} 个事件`,
        );
      }

      return events;
    } catch (error) {
      const latency = Date.now() - startMs;
      this.lastLatencyMs = latency;
      this.latencySum += latency;
      this.latencyCount++;
      this.consecutiveErrors++;
      this.totalErrors++;
      this.lastErrorTime = new Date();
      this.lastErrorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[FinanceAdapter] "${this.name}" 轮询失败: ${this.lastErrorMessage}`);
      return [];
    }
  }

  getHealthMetrics(): SourceHealthMetrics {
    const total = this.totalSuccesses + this.totalErrors;
    return {
      sourceId: this.id,
      connected: this.consecutiveErrors === 0 && this.totalSuccesses > 0,
      consecutiveErrors: this.consecutiveErrors,
      totalErrors: this.totalErrors,
      totalSuccesses: this.totalSuccesses,
      errorRate: total > 0 ? this.totalErrors / total : 0,
      lastLatencyMs: this.lastLatencyMs,
      averageLatencyMs: this.latencyCount > 0 ? Math.round(this.latencySum / this.latencyCount) : 0,
      lastSuccessTime: this.lastSuccessTime,
      lastErrorTime: this.lastErrorTime,
      lastErrorMessage: this.lastErrorMessage,
      eventsEmitted: this.eventsEmitted,
      uptimeMs: this.startTime ? Date.now() - this.startTime.getTime() : 0,
    };
  }

  setCurrentTick(tick: number): void {
    this.currentTick = tick;
  }

  // ── 内部方法 ──

  /**
   * 从 Yahoo Finance API 获取行情数据
   */
  private async fetchQuotes(): Promise<QuoteData[]> {
    const quotes: QuoteData[] = [];
    const symbols = this.config.symbols;

    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchPromises = batch.map(sym => this.fetchSingleQuote(sym));
      const results = await Promise.allSettled(batchPromises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          quotes.push(result.value);
        }
      }
    }

    return quotes;
  }

  private async fetchSingleQuote(symbol: FinanceSymbol, retries = 3): Promise<QuoteData | null> {
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const url = `${YAHOO_FINANCE_API}/${encodeURIComponent(symbol.symbol)}?range=1d&interval=1d`;
        const response = await this.fetchFn(url, {
          headers: {
            'User-Agent': 'BeeClaw/1.0.0 FinanceAdapter',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as YahooChartResponse;
        return this.parseYahooChartResponse(data, symbol);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < retries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
          await this.delayFn(delayMs);
        }
      }
    }

    console.warn(`[FinanceAdapter] 获取 ${symbol.symbol} 行情最终失败: ${lastError}`);
    return null;
  }

  private parseYahooChartResponse(data: YahooChartResponse, symbol: FinanceSymbol): QuoteData | null {
    const result = data?.chart?.result?.[0];
    if (!result?.meta) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? 0;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    const indicators = result.indicators?.quote?.[0];
    const volume = indicators?.volume?.[indicators.volume.length - 1] ?? undefined;
    const high = indicators?.high?.[indicators.high.length - 1] ?? undefined;
    const low = indicators?.low?.[indicators.low.length - 1] ?? undefined;
    const open = indicators?.open?.[indicators.open.length - 1] ?? undefined;

    return {
      symbol: symbol.symbol,
      name: symbol.name,
      type: symbol.type,
      price,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      volume: volume ?? undefined,
      high: high ?? undefined,
      low: low ?? undefined,
      open: open ?? undefined,
      previousClose,
      marketCap: meta.marketCap ?? undefined,
      timestamp: new Date(),
      currency: meta.currency ?? 'USD',
    };
  }

  /**
   * 处理一条行情数据，生成事件列表
   */
  private processQuote(quote: QuoteData, prevQuote?: QuoteData): IngestedEvent[] {
    const events: IngestedEvent[] = [];
    const threshold = this.config.priceChangeThreshold!;

    // 条件1：价格变动超过阈值
    if (Math.abs(quote.changePercent) >= threshold) {
      events.push(this.buildPriceEvent(quote));
    }

    // 条件2：相对上次轮询有显著变动
    if (prevQuote && Math.abs(quote.changePercent) < threshold) {
      const deltaPercent = prevQuote.price !== 0
        ? ((quote.price - prevQuote.price) / prevQuote.price) * 100
        : 0;
      if (Math.abs(deltaPercent) >= threshold) {
        events.push(this.buildPriceEvent(quote));
      }
    }

    // 条件3：市场情绪事件
    if (this.config.enableSentimentEvents) {
      const sentimentResult = this.sentiment.evaluate(quote, prevQuote);
      if (sentimentResult.intensity >= 0.5) {
        events.push(this.buildSentimentEvent(quote, sentimentResult));
      }
    }

    return events;
  }

  private buildPriceEvent(quote: QuoteData): IngestedEvent {
    const direction = quote.changePercent >= 0 ? '上涨' : '下跌';
    const emoji = quote.changePercent >= 0 ? '📈' : '📉';
    const absChange = Math.abs(quote.changePercent);

    let importance: number;
    if (absChange >= 10) importance = 0.95;
    else if (absChange >= 5) importance = 0.8;
    else if (absChange >= 3) importance = 0.6;
    else importance = 0.4;

    const typeLabel = this.getAssetTypeLabel(quote.type);
    const title = `${emoji} ${quote.name}(${quote.symbol}) ${direction} ${absChange.toFixed(2)}%`;

    const contentParts = [
      `${typeLabel} ${quote.name}(${quote.symbol}) 今日${direction} ${absChange.toFixed(2)}%`,
      `当前价格: ${quote.currency ?? 'USD'} ${quote.price.toFixed(2)}`,
      `涨跌额: ${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}`,
    ];

    if (quote.volume !== undefined) contentParts.push(`成交量: ${this.formatVolume(quote.volume)}`);
    if (quote.high !== undefined && quote.low !== undefined) {
      contentParts.push(`今日区间: ${quote.low.toFixed(2)} - ${quote.high.toFixed(2)}`);
    }

    const tags = ['finance', 'market', quote.type, quote.symbol];
    if (quote.type === 'crypto') tags.push('crypto', '加密货币');
    else if (quote.type === 'stock') tags.push('stock', '股票');
    if (absChange >= 5) tags.push(direction === '上涨' ? '暴涨' : '暴跌');

    return {
      title,
      content: contentParts.join('\n'),
      category: 'finance',
      source: `finance:${this.id}`,
      importance,
      propagationRadius: Math.min(0.8, importance * 0.7),
      tags: [...new Set(tags)],
      deduplicationId: `finance:${quote.symbol}:${quote.timestamp.toISOString().slice(0, 13)}`,
    };
  }

  private buildSentimentEvent(quote: QuoteData, sentimentResult: MarketSentimentResult): IngestedEvent {
    const title = `市场情绪: ${quote.name}(${quote.symbol}) — ${this.getSentimentLabel(sentimentResult.sentiment)}`;

    const contentParts = [
      sentimentResult.description,
      `情绪强度: ${(sentimentResult.intensity * 100).toFixed(0)}%`,
      `波动率: ${(sentimentResult.volatility * 100).toFixed(0)}%`,
      `趋势: ${this.getTrendLabel(sentimentResult.trend)}`,
    ];

    const importance = Math.min(0.9, 0.3 + sentimentResult.intensity * 0.5);

    return {
      title,
      content: contentParts.join('\n'),
      category: 'finance',
      source: `finance:${this.id}:sentiment`,
      importance,
      propagationRadius: Math.min(0.7, importance * 0.6),
      tags: ['finance', 'market_sentiment', quote.symbol, sentimentResult.sentiment, sentimentResult.trend],
      deduplicationId: `sentiment:${quote.symbol}:${quote.timestamp.toISOString().slice(0, 13)}`,
    };
  }

  // ── 工具方法 ──

  private getAssetTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      stock: '股票', crypto: '加密货币', forex: '外汇', commodity: '大宗商品',
    };
    return labels[type] ?? '金融标的';
  }

  private getSentimentLabel(sentiment: string): string {
    const labels: Record<string, string> = {
      extreme_fear: '极度恐慌', fear: '恐慌', neutral: '中性',
      greed: '贪婪', extreme_greed: '极度贪婪',
    };
    return labels[sentiment] ?? sentiment;
  }

  private getTrendLabel(trend: string): string {
    const labels: Record<string, string> = {
      bullish: '看涨', bearish: '看跌', sideways: '横盘',
    };
    return labels[trend] ?? trend;
  }

  private formatVolume(volume: number): string {
    if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
    if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
    if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
    return volume.toString();
  }
}

// ── Yahoo Finance API 响应类型 ──

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        marketCap?: number;
      };
      indicators?: {
        quote?: Array<{
          volume?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          open?: (number | null)[];
          close?: (number | null)[];
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}
