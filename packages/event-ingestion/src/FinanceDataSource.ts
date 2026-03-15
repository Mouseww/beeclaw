// ============================================================================
// FinanceDataSource — 金融数据源接入
// 支持 Yahoo Finance（股票/加密货币/外汇/商品），通过免费 API 获取行情
// ============================================================================

import type { EventBus } from '@beeclaw/event-bus';
import type {
  FinanceSourceConfig,
  FinanceSymbol,
  QuoteData,
  MarketSentimentResult,
} from './types.js';
import { MarketSentiment } from './MarketSentiment.js';

/** 默认配置 */
const DEFAULTS = {
  pollIntervalMs: 60_000, // 1 分钟
  priceChangeThreshold: 2, // 2%
  enableSentimentEvents: true,
} as const;

/** Yahoo Finance API v8 查询 URL（公开免费） */
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** 单个金融数据源的运行时状态 */
interface FinanceSourceState {
  config: FinanceSourceConfig;
  timer?: ReturnType<typeof setInterval>;
  lastPollTime?: Date;
  lastError?: string;
  lastQuotes: Map<string, QuoteData>;
  quotesPolled: number;
  eventsEmitted: number;
}

export class FinanceDataSource {
  private eventBus: EventBus;
  private state: FinanceSourceState;
  private running = false;
  private currentTick = 0;
  private sentiment: MarketSentiment;
  private _lastFetchError?: string;

  /** 允许注入自定义 fetch（用于测试） */
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;

  constructor(eventBus: EventBus, config: FinanceSourceConfig) {
    this.eventBus = eventBus;
    this.state = {
      config: {
        ...config,
        enabled: config.enabled ?? true,
        pollIntervalMs: config.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
        priceChangeThreshold: config.priceChangeThreshold ?? DEFAULTS.priceChangeThreshold,
        enableSentimentEvents: config.enableSentimentEvents ?? DEFAULTS.enableSentimentEvents,
      },
      lastQuotes: new Map(),
      quotesPolled: 0,
      eventsEmitted: 0,
    };
    this.sentiment = new MarketSentiment();
    this.fetchFn = globalThis.fetch.bind(globalThis);
  }

  // ── 公共 API ──

  /** 获取数据源 ID */
  getId(): string {
    return this.state.config.id;
  }

  /** 获取数据源名称 */
  getName(): string {
    return this.state.config.name;
  }

  /** 获取配置（深拷贝，修改副本不影响原始） */
  getConfig(): FinanceSourceConfig {
    return {
      ...this.state.config,
      symbols: this.state.config.symbols.map(s => ({ ...s })),
    };
  }

  /** 获取运行状态 */
  getStatus(): {
    id: string;
    name: string;
    enabled: boolean;
    running: boolean;
    lastPollTime?: Date;
    lastError?: string;
    symbolCount: number;
    quotesPolled: number;
    eventsEmitted: number;
  } {
    return {
      id: this.state.config.id,
      name: this.state.config.name,
      enabled: this.state.config.enabled!,
      running: this.running,
      lastPollTime: this.state.lastPollTime,
      lastError: this.state.lastError,
      symbolCount: this.state.config.symbols.length,
      quotesPolled: this.state.quotesPolled,
      eventsEmitted: this.state.eventsEmitted,
    };
  }

  /** 更新当前世界 tick */
  setCurrentTick(tick: number): void {
    this.currentTick = tick;
  }

  /** 启动自动轮询 */
  start(): void {
    if (this.running) return;
    if (!this.state.config.enabled) return;

    this.running = true;
    const intervalMs = this.state.config.pollIntervalMs!;
    console.log(
      `[FinanceDataSource] 启动金融数据轮询: "${this.state.config.name}" ` +
      `(${this.state.config.symbols.length} 个标的, 间隔 ${intervalMs}ms)`
    );

    // 立即执行一次
    this.poll().catch(err => {
      console.error(`[FinanceDataSource] 初始轮询失败 (${this.state.config.name}):`, err);
    });

    // 设置定时轮询
    this.state.timer = setInterval(() => {
      this.poll().catch(err => {
        console.error(`[FinanceDataSource] 轮询失败 (${this.state.config.name}):`, err);
      });
    }, intervalMs);
  }

  /** 停止自动轮询 */
  stop(): void {
    if (this.state.timer) {
      clearInterval(this.state.timer);
      this.state.timer = undefined;
    }
    this.running = false;
    console.log(`[FinanceDataSource] 已停止: "${this.state.config.name}"`);
  }

  /** 是否运行中 */
  isRunning(): boolean {
    return this.running;
  }

  /** 手动触发一次轮询 */
  async poll(): Promise<number> {
    this._lastFetchError = undefined;
    try {
      const quotes = await this.fetchQuotes();
      this.state.lastPollTime = new Date();
      this.state.quotesPolled += quotes.length;

      // 如果有标的但全部获取失败，记录最后一个 fetch 错误
      if (quotes.length === 0 && this.state.config.symbols.length > 0 && this._lastFetchError) {
        this.state.lastError = this._lastFetchError;
      } else {
        this.state.lastError = undefined;
      }

      let eventsEmitted = 0;

      for (const quote of quotes) {
        const prevQuote = this.state.lastQuotes.get(quote.symbol);
        const emitted = this.processQuote(quote, prevQuote);
        eventsEmitted += emitted;
        this.state.lastQuotes.set(quote.symbol, quote);
      }

      this.state.eventsEmitted += eventsEmitted;

      if (eventsEmitted > 0) {
        console.log(
          `[FinanceDataSource] "${this.state.config.name}" — ` +
          `获取 ${quotes.length} 个行情, 注入 ${eventsEmitted} 个事件`
        );
      }

      return eventsEmitted;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.state.lastError = errorMsg;
      this.state.lastPollTime = new Date();
      console.error(`[FinanceDataSource] 获取行情失败 (${this.state.config.name}): ${errorMsg}`);
      return 0;
    }
  }

  /** 获取最新行情数据（不注入事件） */
  getLastQuotes(): QuoteData[] {
    return Array.from(this.state.lastQuotes.values());
  }

  /** 添加关注标的 */
  addSymbol(symbol: FinanceSymbol): void {
    const existing = this.state.config.symbols.find(s => s.symbol === symbol.symbol);
    if (!existing) {
      this.state.config.symbols.push(symbol);
    }
  }

  /** 移除关注标的 */
  removeSymbol(symbolId: string): void {
    this.state.config.symbols = this.state.config.symbols.filter(s => s.symbol !== symbolId);
    this.state.lastQuotes.delete(symbolId);
  }

  // ── 内部方法 ──

  /**
   * 从 Yahoo Finance API 获取行情数据
   * 使用免费的 v8 chart API
   */
  async fetchQuotes(): Promise<QuoteData[]> {
    const quotes: QuoteData[] = [];
    const symbols = this.state.config.symbols;

    // 按批次获取（每次最多 5 个，避免请求过快被限流）
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

  /**
   * 获取单个标的的行情（带指数退避重试）
   */
  private async fetchSingleQuote(symbol: FinanceSymbol, retries = 3): Promise<QuoteData | null> {
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const url = `${YAHOO_FINANCE_API}/${encodeURIComponent(symbol.symbol)}?range=1d&interval=1d`;
        const response = await this.fetchFn(url, {
          headers: {
            'User-Agent': 'BeeClaw/0.5.0 FinanceDataSource',
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
          console.warn(
            `[FinanceDataSource] 获取 ${symbol.symbol} 失败 (第 ${attempt}/${retries} 次), ` +
            `${delayMs}ms 后重试: ${lastError}`
          );
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    this._lastFetchError = lastError ?? undefined;
    console.warn(`[FinanceDataSource] 获取 ${symbol.symbol} 行情最终失败: ${lastError}`);
    return null;
  }

  /**
   * 解析 Yahoo Finance chart API 响应
   */
  private parseYahooChartResponse(data: YahooChartResponse, symbol: FinanceSymbol): QuoteData | null {
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? 0;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    // 从 indicators 中获取交易量和高低开数据
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
   * 处理一条行情数据，决定是否注入事件
   */
  private processQuote(quote: QuoteData, prevQuote?: QuoteData): number {
    let emitted = 0;
    const threshold = this.state.config.priceChangeThreshold!;

    // 条件1：价格变动超过阈值 → 生成价格变动事件
    if (Math.abs(quote.changePercent) >= threshold) {
      this.emitPriceEvent(quote);
      emitted++;
    }

    // 条件2：相对上次轮询有显著变动 → 生成价格变动事件
    if (prevQuote && Math.abs(quote.changePercent) < threshold) {
      const deltaPercent = prevQuote.price !== 0
        ? ((quote.price - prevQuote.price) / prevQuote.price) * 100
        : 0;
      if (Math.abs(deltaPercent) >= threshold) {
        this.emitPriceEvent(quote);
        emitted++;
      }
    }

    // 条件3：市场情绪事件
    if (this.state.config.enableSentimentEvents) {
      const sentimentResult = this.sentiment.evaluate(quote, prevQuote);
      // 只在情绪较强烈时生成事件
      if (sentimentResult.intensity >= 0.5) {
        this.emitSentimentEvent(quote, sentimentResult);
        emitted++;
      }
    }

    return emitted;
  }

  /**
   * 注入价格变动事件
   */
  private emitPriceEvent(quote: QuoteData): void {
    const direction = quote.changePercent >= 0 ? '上涨' : '下跌';
    const emoji = quote.changePercent >= 0 ? '📈' : '📉';
    const absChange = Math.abs(quote.changePercent);

    // 根据涨跌幅判定重要性
    let importance: number;
    if (absChange >= 10) {
      importance = 0.95;
    } else if (absChange >= 5) {
      importance = 0.8;
    } else if (absChange >= 3) {
      importance = 0.6;
    } else {
      importance = 0.4;
    }

    const typeLabel = this.getAssetTypeLabel(quote.type);
    const title = `${emoji} ${quote.name}(${quote.symbol}) ${direction} ${absChange.toFixed(2)}%`;

    const contentParts = [
      `${typeLabel} ${quote.name}(${quote.symbol}) 今日${direction} ${absChange.toFixed(2)}%`,
      `当前价格: ${quote.currency ?? 'USD'} ${quote.price.toFixed(2)}`,
      `涨跌额: ${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}`,
    ];

    if (quote.volume !== undefined) {
      contentParts.push(`成交量: ${this.formatVolume(quote.volume)}`);
    }
    if (quote.high !== undefined && quote.low !== undefined) {
      contentParts.push(`今日区间: ${quote.low.toFixed(2)} - ${quote.high.toFixed(2)}`);
    }
    if (quote.marketCap !== undefined) {
      contentParts.push(`市值: ${this.formatMarketCap(quote.marketCap)}`);
    }

    const tags = ['finance', 'market', quote.type, quote.symbol];
    if (quote.type === 'crypto') {
      tags.push('crypto', '加密货币');
    } else if (quote.type === 'stock') {
      tags.push('stock', '股票');
    }

    if (absChange >= 5) {
      tags.push(direction === '上涨' ? '暴涨' : '暴跌');
    }

    this.eventBus.injectEvent({
      title,
      content: contentParts.join('\n'),
      category: 'finance',
      source: `finance:${this.state.config.id}`,
      importance,
      propagationRadius: Math.min(0.8, importance * 0.7),
      tick: this.currentTick,
      tags: [...new Set(tags)],
      type: 'external',
    });
  }

  /**
   * 注入市场情绪事件
   */
  private emitSentimentEvent(
    quote: QuoteData,
    sentimentResult: MarketSentimentResult,
  ): void {
    const title = `市场情绪: ${quote.name}(${quote.symbol}) — ${this.getSentimentLabel(sentimentResult.sentiment)}`;

    const contentParts = [
      sentimentResult.description,
      `情绪强度: ${(sentimentResult.intensity * 100).toFixed(0)}%`,
      `波动率: ${(sentimentResult.volatility * 100).toFixed(0)}%`,
      `趋势: ${this.getTrendLabel(sentimentResult.trend)}`,
    ];

    const importance = Math.min(0.9, 0.3 + sentimentResult.intensity * 0.5);

    this.eventBus.injectEvent({
      title,
      content: contentParts.join('\n'),
      category: 'finance',
      source: `finance:${this.state.config.id}:sentiment`,
      importance,
      propagationRadius: Math.min(0.7, importance * 0.6),
      tick: this.currentTick,
      tags: ['finance', 'market_sentiment', quote.symbol, sentimentResult.sentiment, sentimentResult.trend],
      type: 'external',
    });
  }

  // ── 工具方法 ──

  private getAssetTypeLabel(type: string): string {
    switch (type) {
      case 'stock': return '股票';
      case 'crypto': return '加密货币';
      case 'forex': return '外汇';
      case 'commodity': return '大宗商品';
      default: return '金融标的';
    }
  }

  private getSentimentLabel(sentiment: string): string {
    switch (sentiment) {
      case 'extreme_fear': return '极度恐慌';
      case 'fear': return '恐慌';
      case 'neutral': return '中性';
      case 'greed': return '贪婪';
      case 'extreme_greed': return '极度贪婪';
      default: return sentiment;
    }
  }

  private getTrendLabel(trend: string): string {
    switch (trend) {
      case 'bullish': return '看涨';
      case 'bearish': return '看跌';
      case 'sideways': return '横盘';
      default: return trend;
    }
  }

  private formatVolume(volume: number): string {
    if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
    if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
    if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
    return volume.toString();
  }

  private formatMarketCap(marketCap: number): string {
    if (marketCap >= 1_000_000_000_000) return `$${(marketCap / 1_000_000_000_000).toFixed(2)}T`;
    if (marketCap >= 1_000_000_000) return `$${(marketCap / 1_000_000_000).toFixed(2)}B`;
    if (marketCap >= 1_000_000) return `$${(marketCap / 1_000_000).toFixed(2)}M`;
    return `$${marketCap.toLocaleString()}`;
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

// ── 预定义的常用标的列表 ──

/** 常用美股标的 */
export const POPULAR_STOCKS: FinanceSymbol[] = [
  { symbol: 'AAPL', name: 'Apple', type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock' },
  { symbol: 'META', name: 'Meta', type: 'stock' },
];

/** 常用加密货币标的 */
export const POPULAR_CRYPTO: FinanceSymbol[] = [
  { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', tags: ['crypto', 'BTC'] },
  { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto', tags: ['crypto', 'ETH'] },
  { symbol: 'BNB-USD', name: 'BNB', type: 'crypto', tags: ['crypto', 'BNB'] },
  { symbol: 'SOL-USD', name: 'Solana', type: 'crypto', tags: ['crypto', 'SOL'] },
  { symbol: 'XRP-USD', name: 'XRP', type: 'crypto', tags: ['crypto', 'XRP'] },
];

/** 常用指数 */
export const POPULAR_INDICES: FinanceSymbol[] = [
  { symbol: '^GSPC', name: 'S&P 500', type: 'stock', tags: ['index'] },
  { symbol: '^DJI', name: 'Dow Jones', type: 'stock', tags: ['index'] },
  { symbol: '^IXIC', name: 'NASDAQ', type: 'stock', tags: ['index'] },
];
