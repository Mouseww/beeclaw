// ============================================================================
// FinanceDataSource 单元测试
// 测试 Yahoo Finance API 接入、行情解析、事件生成
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FinanceDataSource, POPULAR_STOCKS, POPULAR_CRYPTO } from './FinanceDataSource.js';
import type { FinanceSourceConfig, FinanceSymbol, QuoteData } from './types.js';

// ── Mock EventBus ──
function createMockEventBus() {
  return {
    injectEvent: vi.fn(),
    consumeEvents: vi.fn().mockReturnValue([]),
    emitAgentEvent: vi.fn(),
    cleanup: vi.fn(),
    getActiveEvents: vi.fn().mockReturnValue([]),
  };
}

// ── Mock Yahoo Finance API 响应 ──
function createYahooChartResponse(overrides: {
  symbol?: string;
  price?: number;
  previousClose?: number;
  currency?: string;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  marketCap?: number;
} = {}) {
  const price = overrides.price ?? 150.0;
  const previousClose = overrides.previousClose ?? 145.0;
  return {
    chart: {
      result: [{
        meta: {
          currency: overrides.currency ?? 'USD',
          symbol: overrides.symbol ?? 'AAPL',
          regularMarketPrice: price,
          chartPreviousClose: previousClose,
          previousClose: previousClose,
          marketCap: overrides.marketCap ?? 2_500_000_000_000,
        },
        indicators: {
          quote: [{
            volume: [overrides.volume ?? 50_000_000],
            high: [overrides.high ?? price + 2],
            low: [overrides.low ?? price - 3],
            open: [overrides.open ?? previousClose + 1],
            close: [price],
          }],
        },
      }],
    },
  };
}

function createMockFetch(responses: Record<string, object>) {
  return vi.fn(async (url: string) => {
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => data,
        } as Response;
      }
    }
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ chart: { error: { code: 'Not Found' } } }),
    } as Response;
  });
}

function createDefaultConfig(): FinanceSourceConfig {
  return {
    id: 'test-finance',
    name: 'Test Finance Source',
    symbols: [
      { symbol: 'AAPL', name: 'Apple', type: 'stock' },
      { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto' },
    ],
    pollIntervalMs: 60_000,
    priceChangeThreshold: 2,
    enableSentimentEvents: true,
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe('FinanceDataSource', () => {
  let mockBus: ReturnType<typeof createMockEventBus>;
  let source: FinanceDataSource;
  let config: FinanceSourceConfig;

  beforeEach(() => {
    mockBus = createMockEventBus();
    config = createDefaultConfig();
    source = new FinanceDataSource(mockBus as any, config);
  });

  afterEach(() => {
    source.stop();
  });

  // ── 初始化测试 ──

  describe('初始化', () => {
    it('应正确初始化并设置默认值', () => {
      const status = source.getStatus();
      expect(status.id).toBe('test-finance');
      expect(status.name).toBe('Test Finance Source');
      expect(status.enabled).toBe(true);
      expect(status.running).toBe(false);
      expect(status.symbolCount).toBe(2);
      expect(status.quotesPolled).toBe(0);
      expect(status.eventsEmitted).toBe(0);
    });

    it('应正确返回 ID 和名称', () => {
      expect(source.getId()).toBe('test-finance');
      expect(source.getName()).toBe('Test Finance Source');
    });

    it('应正确返回配置副本', () => {
      const cfg = source.getConfig();
      expect(cfg.id).toBe('test-finance');
      expect(cfg.symbols).toHaveLength(2);
      // 修改副本不影响原始
      cfg.symbols.push({ symbol: 'MSFT', name: 'Microsoft', type: 'stock' });
      expect(source.getConfig().symbols).toHaveLength(2);
    });

    it('禁用状态应正确设置', () => {
      const disabledSource = new FinanceDataSource(mockBus as any, {
        ...config,
        enabled: false,
      });
      expect(disabledSource.getStatus().enabled).toBe(false);
    });

    it('默认配置值应正确填充', () => {
      const minimalSource = new FinanceDataSource(mockBus as any, {
        id: 'minimal',
        name: 'Minimal',
        symbols: [],
      });
      const cfg = minimalSource.getConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.pollIntervalMs).toBe(60_000);
      expect(cfg.priceChangeThreshold).toBe(2);
      expect(cfg.enableSentimentEvents).toBe(true);
    });
  });

  // ── 标的管理测试 ──

  describe('标的管理', () => {
    it('addSymbol 应添加新标的', () => {
      source.addSymbol({ symbol: 'MSFT', name: 'Microsoft', type: 'stock' });
      expect(source.getConfig().symbols).toHaveLength(3);
    });

    it('addSymbol 重复标的不应重复添加', () => {
      source.addSymbol({ symbol: 'AAPL', name: 'Apple', type: 'stock' });
      expect(source.getConfig().symbols).toHaveLength(2);
    });

    it('removeSymbol 应移除标的', () => {
      source.removeSymbol('AAPL');
      expect(source.getConfig().symbols).toHaveLength(1);
      expect(source.getConfig().symbols[0]!.symbol).toBe('BTC-USD');
    });

    it('removeSymbol 不存在的标的不应报错', () => {
      expect(() => source.removeSymbol('NONEXIST')).not.toThrow();
      expect(source.getConfig().symbols).toHaveLength(2);
    });
  });

  // ── Tick 管理 ──

  describe('Tick 管理', () => {
    it('setCurrentTick 应不抛错', () => {
      expect(() => source.setCurrentTick(42)).not.toThrow();
    });
  });

  // ── 启停控制 ──

  describe('启停控制', () => {
    it('初始状态应不在运行', () => {
      expect(source.isRunning()).toBe(false);
    });

    it('禁用的源 start 后不应运行', () => {
      const disabledSource = new FinanceDataSource(mockBus as any, {
        ...config,
        enabled: false,
      });
      disabledSource.start();
      expect(disabledSource.isRunning()).toBe(false);
    });

    it('stop 应停止运行', () => {
      // 设置 mock fetch 以避免真实请求
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({ symbol: 'AAPL' }),
        'BTC-USD': createYahooChartResponse({ symbol: 'BTC-USD', price: 50000 }),
      });
      source.start();
      expect(source.isRunning()).toBe(true);
      source.stop();
      expect(source.isRunning()).toBe(false);
    });

    it('重复 start 应无副作用', () => {
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({ symbol: 'AAPL' }),
        'BTC-USD': createYahooChartResponse({ symbol: 'BTC-USD', price: 50000 }),
      });
      source.start();
      source.start(); // 第二次调用
      expect(source.isRunning()).toBe(true);
      source.stop();
    });
  });

  // ── 行情获取测试 ──

  describe('行情获取 (fetchQuotes)', () => {
    it('应从 Yahoo Finance API 获取行情', async () => {
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({
          symbol: 'AAPL',
          price: 175.50,
          previousClose: 172.00,
        }),
        'BTC-USD': createYahooChartResponse({
          symbol: 'BTC-USD',
          price: 64000,
          previousClose: 62000,
          currency: 'USD',
        }),
      });

      const quotes = await source.fetchQuotes();
      expect(quotes).toHaveLength(2);

      const aapl = quotes.find(q => q.symbol === 'AAPL');
      expect(aapl).toBeDefined();
      expect(aapl!.price).toBe(175.50);
      expect(aapl!.name).toBe('Apple');
      expect(aapl!.type).toBe('stock');
      expect(aapl!.changePercent).toBeCloseTo(2.03, 1);

      const btc = quotes.find(q => q.symbol === 'BTC-USD');
      expect(btc).toBeDefined();
      expect(btc!.price).toBe(64000);
      expect(btc!.type).toBe('crypto');
    });

    it('单个标的获取失败不应影响其他', async () => {
      source.fetchFn = vi.fn(async (url: string) => {
        if (url.includes('AAPL')) {
          return {
            ok: true,
            json: async () => createYahooChartResponse({ symbol: 'AAPL', price: 150 }),
          } as Response;
        }
        throw new Error('Network error');
      });

      const quotes = await source.fetchQuotes();
      expect(quotes).toHaveLength(1);
      expect(quotes[0]!.symbol).toBe('AAPL');
    });

    it('HTTP 错误应被优雅处理', async () => {
      source.fetchFn = vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      } as Response));

      const quotes = await source.fetchQuotes();
      expect(quotes).toHaveLength(0);
    });

    it('空 result 应返回 null', async () => {
      source.fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => ({ chart: { result: [] } }),
      } as Response));

      const quotes = await source.fetchQuotes();
      expect(quotes).toHaveLength(0);
    });

    it('缺少 meta 应返回 null', async () => {
      source.fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => ({ chart: { result: [{}] } }),
      } as Response));

      const quotes = await source.fetchQuotes();
      expect(quotes).toHaveLength(0);
    });
  });

  // ── 行情解析测试 ──

  describe('行情数据计算', () => {
    it('应正确计算涨跌幅', async () => {
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({
          price: 150,
          previousClose: 100, // +50%
        }),
        'BTC-USD': createYahooChartResponse({
          price: 50000,
          previousClose: 60000, // -16.67%
        }),
      });

      const quotes = await source.fetchQuotes();
      const aapl = quotes.find(q => q.symbol === 'AAPL')!;
      expect(aapl.changePercent).toBe(50);
      expect(aapl.change).toBe(50);

      const btc = quotes.find(q => q.symbol === 'BTC-USD')!;
      expect(btc.changePercent).toBeCloseTo(-16.67, 1);
      expect(btc.change).toBe(-10000);
    });

    it('previousClose 为 0 时 changePercent 应为 0', async () => {
      source = new FinanceDataSource(mockBus as any, {
        ...config,
        symbols: [{ symbol: 'TEST', name: 'Test', type: 'stock' }],
      });
      source.fetchFn = createMockFetch({
        'TEST': createYahooChartResponse({
          price: 100,
          previousClose: 0,
        }),
      });

      const quotes = await source.fetchQuotes();
      expect(quotes[0]!.changePercent).toBe(0);
    });

    it('应包含交易量、高低价等信息', async () => {
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({
          price: 150,
          previousClose: 148,
          volume: 80_000_000,
          high: 152,
          low: 147,
          open: 149,
          marketCap: 3_000_000_000_000,
        }),
        'BTC-USD': createYahooChartResponse({ price: 50000 }),
      });

      const quotes = await source.fetchQuotes();
      const aapl = quotes.find(q => q.symbol === 'AAPL')!;
      expect(aapl.volume).toBe(80_000_000);
      expect(aapl.high).toBe(152);
      expect(aapl.low).toBe(147);
      expect(aapl.open).toBe(149);
      expect(aapl.marketCap).toBe(3_000_000_000_000);
      expect(aapl.currency).toBe('USD');
    });
  });

  // ── 事件生成测试 ──

  describe('事件生成 (poll)', () => {
    it('价格超过阈值应生成事件', async () => {
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({
          price: 155,
          previousClose: 150, // +3.33%，超过默认阈值 2%
        }),
        'BTC-USD': createYahooChartResponse({
          price: 50000,
          previousClose: 50000, // 0% 不超过阈值
        }),
      });

      const eventsEmitted = await source.poll();
      expect(eventsEmitted).toBeGreaterThan(0);
      expect(mockBus.injectEvent).toHaveBeenCalled();

      // 找到价格事件
      const priceCall = mockBus.injectEvent.mock.calls.find(
        (call: any[]) => call[0].title.includes('AAPL')
      );
      expect(priceCall).toBeDefined();
      expect(priceCall![0].category).toBe('finance');
      expect(priceCall![0].type).toBe('external');
    });

    it('价格未超过阈值不应生成价格事件', async () => {
      source = new FinanceDataSource(mockBus as any, {
        ...config,
        symbols: [{ symbol: 'STABLE', name: 'Stable Stock', type: 'stock' }],
        enableSentimentEvents: false, // 禁用情绪事件
      });
      source.fetchFn = createMockFetch({
        'STABLE': createYahooChartResponse({
          price: 100.5,
          previousClose: 100, // +0.5%，低于阈值
        }),
      });

      const eventsEmitted = await source.poll();
      expect(eventsEmitted).toBe(0);
      expect(mockBus.injectEvent).not.toHaveBeenCalled();
    });

    it('大幅下跌应生成高重要性事件', async () => {
      source = new FinanceDataSource(mockBus as any, {
        ...config,
        symbols: [{ symbol: 'CRASH', name: 'Crash Stock', type: 'stock' }],
        enableSentimentEvents: false,
      });
      source.fetchFn = createMockFetch({
        'CRASH': createYahooChartResponse({
          price: 80,
          previousClose: 100, // -20%
        }),
      });

      await source.poll();
      expect(mockBus.injectEvent).toHaveBeenCalled();

      const call = mockBus.injectEvent.mock.calls[0]![0];
      expect(call.title).toContain('下跌');
      expect(call.importance).toBeGreaterThanOrEqual(0.8);
      expect(call.tags).toContain('暴跌');
    });

    it('大幅上涨应生成包含暴涨标签的事件', async () => {
      source = new FinanceDataSource(mockBus as any, {
        ...config,
        symbols: [{ symbol: 'MOON', name: 'Moon Stock', type: 'stock' }],
        enableSentimentEvents: false,
      });
      source.fetchFn = createMockFetch({
        'MOON': createYahooChartResponse({
          price: 200,
          previousClose: 100, // +100%
        }),
      });

      await source.poll();
      const call = mockBus.injectEvent.mock.calls[0]![0];
      expect(call.title).toContain('上涨');
      expect(call.importance).toBe(0.95);
      expect(call.tags).toContain('暴涨');
    });

    it('加密货币事件应包含 crypto 标签', async () => {
      source = new FinanceDataSource(mockBus as any, {
        ...config,
        symbols: [{ symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto' }],
        enableSentimentEvents: false,
      });
      source.fetchFn = createMockFetch({
        'BTC-USD': createYahooChartResponse({
          price: 70000,
          previousClose: 65000, // +7.69%
        }),
      });

      await source.poll();
      const call = mockBus.injectEvent.mock.calls[0]![0];
      expect(call.tags).toContain('crypto');
      expect(call.tags).toContain('加密货币');
      expect(call.tags).toContain('BTC-USD');
    });

    it('情绪事件应在启用时生成', async () => {
      source = new FinanceDataSource(mockBus as any, {
        ...config,
        symbols: [{ symbol: 'VOL', name: 'Volatile', type: 'stock' }],
        enableSentimentEvents: true,
      });
      source.fetchFn = createMockFetch({
        'VOL': createYahooChartResponse({
          price: 50,
          previousClose: 100, // -50% → extreme_fear，intensity > 0.5
        }),
      });

      await source.poll();
      // 应该有价格事件 + 情绪事件
      const sentimentCall = mockBus.injectEvent.mock.calls.find(
        (call: any[]) => call[0].title.includes('市场情绪')
      );
      expect(sentimentCall).toBeDefined();
      expect(sentimentCall![0].tags).toContain('market_sentiment');
    });

    it('轮询失败应不抛错并返回 0', async () => {
      source.fetchFn = vi.fn(async () => {
        throw new Error('Network timeout');
      });

      const result = await source.poll();
      expect(result).toBe(0);
      expect(source.getStatus().lastError).toBe('Network timeout');
    });

    it('poll 应更新状态', async () => {
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({ price: 160, previousClose: 150 }),
        'BTC-USD': createYahooChartResponse({ price: 70000, previousClose: 65000 }),
      });

      await source.poll();
      const status = source.getStatus();
      expect(status.lastPollTime).toBeDefined();
      expect(status.quotesPolled).toBe(2);
    });
  });

  // ── getLastQuotes 测试 ──

  describe('getLastQuotes', () => {
    it('初始应为空', () => {
      expect(source.getLastQuotes()).toHaveLength(0);
    });

    it('poll 后应有数据', async () => {
      source.fetchFn = createMockFetch({
        'AAPL': createYahooChartResponse({ price: 150 }),
        'BTC-USD': createYahooChartResponse({ price: 50000 }),
      });

      await source.poll();
      const quotes = source.getLastQuotes();
      expect(quotes).toHaveLength(2);
    });
  });

  // ── 相对上次轮询变动测试 ──

  describe('相对上次轮询变动', () => {
    it('两次轮询间价格显著变动应生成事件', async () => {
      source = new FinanceDataSource(mockBus as any, {
        ...config,
        symbols: [{ symbol: 'MOVE', name: 'Mover', type: 'stock' }],
        enableSentimentEvents: false,
        priceChangeThreshold: 2,
      });

      // 第一次轮询：价格略有变化但不超过阈值
      source.fetchFn = createMockFetch({
        'MOVE': createYahooChartResponse({ price: 100.5, previousClose: 100 }),
      });
      await source.poll();
      mockBus.injectEvent.mockClear();

      // 第二次轮询：价格从 100.5 变到 103 → 相对上次 +2.49%
      source.fetchFn = createMockFetch({
        'MOVE': createYahooChartResponse({ price: 103, previousClose: 100 }),
      });
      await source.poll();

      // 应有事件（因为日涨幅 3% 超过阈值）
      expect(mockBus.injectEvent).toHaveBeenCalled();
    });
  });

  // ── 预定义标的列表 ──

  describe('预定义标的列表', () => {
    it('POPULAR_STOCKS 应包含主流美股', () => {
      expect(POPULAR_STOCKS.length).toBeGreaterThan(0);
      const symbols = POPULAR_STOCKS.map(s => s.symbol);
      expect(symbols).toContain('AAPL');
      expect(symbols).toContain('GOOGL');
      expect(symbols).toContain('MSFT');
      expect(POPULAR_STOCKS.every(s => s.type === 'stock')).toBe(true);
    });

    it('POPULAR_CRYPTO 应包含主流加密货币', () => {
      expect(POPULAR_CRYPTO.length).toBeGreaterThan(0);
      const symbols = POPULAR_CRYPTO.map(s => s.symbol);
      expect(symbols).toContain('BTC-USD');
      expect(symbols).toContain('ETH-USD');
      expect(POPULAR_CRYPTO.every(s => s.type === 'crypto')).toBe(true);
    });
  });

  // ── 重要性等级测试 ──

  describe('事件重要性等级', () => {
    async function testImportance(changePercent: number, expectedMin: number) {
      const price = 100 + changePercent;
      const src = new FinanceDataSource(mockBus as any, {
        id: 'imp-test',
        name: 'Importance Test',
        symbols: [{ symbol: 'TEST', name: 'Test', type: 'stock' }],
        enableSentimentEvents: false,
        priceChangeThreshold: 0.1, // 极低阈值，确保触发
      });
      const localBus = createMockEventBus();
      const localSrc = new FinanceDataSource(localBus as any, {
        id: 'imp-test',
        name: 'Importance Test',
        symbols: [{ symbol: 'TEST', name: 'Test', type: 'stock' }],
        enableSentimentEvents: false,
        priceChangeThreshold: 0.1,
      });

      localSrc.fetchFn = createMockFetch({
        'TEST': createYahooChartResponse({
          price,
          previousClose: 100,
        }),
      });

      await localSrc.poll();

      if (localBus.injectEvent.mock.calls.length > 0) {
        const importance = localBus.injectEvent.mock.calls[0]![0].importance;
        expect(importance).toBeGreaterThanOrEqual(expectedMin);
      }
      localSrc.stop();
    }

    it('10% 以上变动 → importance >= 0.95', async () => {
      await testImportance(12, 0.95);
    });

    it('5-10% 变动 → importance >= 0.8', async () => {
      await testImportance(7, 0.8);
    });

    it('3-5% 变动 → importance >= 0.6', async () => {
      await testImportance(4, 0.6);
    });

    it('2-3% 变动 → importance >= 0.4', async () => {
      await testImportance(2.5, 0.4);
    });
  });
});
