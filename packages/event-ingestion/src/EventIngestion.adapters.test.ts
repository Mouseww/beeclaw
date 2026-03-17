// ============================================================================
// @beeclaw/event-ingestion 补充测试
// 覆盖：适配器注册/轮询、内部方法分支、去重缓存管理
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventIngestion } from './EventIngestion.js';
import type { DataSourceAdapter, SourceHealthMetrics, IngestedEvent } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function createMockEventBus() {
  return {
    injectEvent: vi.fn(),
    consumeEvents: vi.fn().mockReturnValue([]),
    emitAgentEvent: vi.fn(),
    cleanup: vi.fn(),
    getActiveEvents: vi.fn().mockReturnValue([]),
  };
}

function createMockAdapter(id: string, name: string, overrides?: Partial<DataSourceAdapter>): DataSourceAdapter {
  return {
    id,
    name,
    type: 'rss' as any,
    start: vi.fn(),
    stop: vi.fn(),
    poll: vi.fn().mockResolvedValue([]),
    getHealthMetrics: vi.fn().mockReturnValue({
      sourceId: id,
      connected: true,
      consecutiveErrors: 0,
      totalErrors: 0,
      totalSuccesses: 1,
      errorRate: 0,
      lastLatencyMs: 10,
      averageLatencyMs: 10,
      lastSuccessTime: new Date(),
      lastErrorTime: null,
      lastErrorMessage: null,
      eventsEmitted: 0,
      uptimeMs: 1000,
    } satisfies SourceHealthMetrics),
    setCurrentTick: vi.fn(),
    ...overrides,
  };
}

describe('EventIngestion 适配器管理补充', () => {
  let bus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    bus = createMockEventBus();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('registerAdapter 应注册并设置 currentTick', () => {
    const ingestion = new EventIngestion(bus as any);
    ingestion.setCurrentTick(42);
    const adapter = createMockAdapter('a1', 'Adapter1');

    ingestion.registerAdapter(adapter);

    expect(adapter.setCurrentTick).toHaveBeenCalledWith(42);
    expect(ingestion.getAdapter('a1')).toBe(adapter);
  });

  it('registerAdapter 对已存在的 id 应覆盖（先移除旧的）', () => {
    const ingestion = new EventIngestion(bus as any);
    const old = createMockAdapter('a1', 'Old');
    const replacement = createMockAdapter('a1', 'New');

    ingestion.registerAdapter(old);
    ingestion.registerAdapter(replacement);

    expect(old.stop).toHaveBeenCalled();
    expect(ingestion.getAdapter('a1')).toBe(replacement);
  });

  it('registerAdapter 在 running 状态下应立即启动', () => {
    const ingestion = new EventIngestion(bus as any);
    ingestion.start();
    const adapter = createMockAdapter('a1', 'Late');

    ingestion.registerAdapter(adapter);

    expect(adapter.start).toHaveBeenCalled();
    ingestion.stop();
  });

  it('removeAdapter 应停止并移除适配器', () => {
    const ingestion = new EventIngestion(bus as any);
    const adapter = createMockAdapter('a1', 'ToRemove');
    ingestion.registerAdapter(adapter);

    ingestion.removeAdapter('a1');

    expect(adapter.stop).toHaveBeenCalled();
    expect(ingestion.getAdapter('a1')).toBeUndefined();
  });

  it('removeAdapter 对不存在的 id 不应报错', () => {
    const ingestion = new EventIngestion(bus as any);
    expect(() => ingestion.removeAdapter('nonexistent')).not.toThrow();
  });

  it('getAdapterHealthMetrics 应返回所有适配器的指标', () => {
    const ingestion = new EventIngestion(bus as any);
    ingestion.registerAdapter(createMockAdapter('a1', 'A1'));
    ingestion.registerAdapter(createMockAdapter('a2', 'A2'));

    const metrics = ingestion.getAdapterHealthMetrics();
    expect(metrics).toHaveLength(2);
  });

  it('pollAdapter 应调用适配器的 poll 并去重注入', async () => {
    const ingestion = new EventIngestion(bus as any);
    const adapter = createMockAdapter('a1', 'Poller', {
      poll: vi.fn().mockResolvedValue([
        {
          id: 'evt1', title: '事件1', content: '内容', source: 'test',
          category: 'general', importance: 0.5, propagationRadius: 0.3,
          tick: 1, tags: ['t1'], originalUrl: 'http://example.com',
          publishedAt: new Date(),
        },
      ] satisfies IngestedEvent[]),
    });
    ingestion.registerAdapter(adapter);

    const count = await ingestion.pollAdapter('a1');
    expect(count).toBe(1);
    expect(bus.injectEvent).toHaveBeenCalledTimes(1);
  });

  it('pollAdapter 对不存在的 id 应抛出', async () => {
    const ingestion = new EventIngestion(bus as any);
    await expect(ingestion.pollAdapter('nonexistent')).rejects.toThrow('不存在');
  });

  it('pollAllAdapters 应轮询所有适配器', async () => {
    const ingestion = new EventIngestion(bus as any);
    ingestion.registerAdapter(createMockAdapter('a1', 'A1', {
      poll: vi.fn().mockResolvedValue([]),
    }));
    ingestion.registerAdapter(createMockAdapter('a2', 'A2', {
      poll: vi.fn().mockResolvedValue([]),
    }));

    const count = await ingestion.pollAllAdapters();
    expect(count).toBe(0);
  });

  it('pollAdapter 结果中的重复事件应被去重', async () => {
    const ingestion = new EventIngestion(bus as any);
    const event: IngestedEvent = {
      id: 'dup-1', title: '重复事件', content: '内容', source: 'test',
      category: 'general', importance: 0.5, propagationRadius: 0.3,
      tick: 1, tags: [], originalUrl: 'http://example.com',
      publishedAt: new Date(),
    };
    const adapter = createMockAdapter('a1', 'DupTest', {
      poll: vi.fn().mockResolvedValue([event]),
    });
    ingestion.registerAdapter(adapter);

    // 第一次轮询，注入 1 个
    await ingestion.pollAdapter('a1');
    expect(bus.injectEvent).toHaveBeenCalledTimes(1);

    // 第二次轮询同一事件，去重后应为 0
    const count = await ingestion.pollAdapter('a1');
    expect(count).toBe(0);
    expect(bus.injectEvent).toHaveBeenCalledTimes(1);
  });

  it('pollAdapter 中适配器 poll 抛出异常应返回 0', async () => {
    const ingestion = new EventIngestion(bus as any);
    const adapter = createMockAdapter('a1', 'ErrorTest', {
      poll: vi.fn().mockRejectedValue(new Error('network failure')),
    });
    ingestion.registerAdapter(adapter);

    const count = await ingestion.pollAdapter('a1');
    expect(count).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('getSeenCount 和 clearSeenCache 应正常工作', () => {
    const ingestion = new EventIngestion(bus as any);
    expect(ingestion.getSeenCount()).toBe(0);

    // 手动添加一些 source 然后测试 seen cache
    ingestion.clearSeenCache();
    expect(ingestion.getSeenCount()).toBe(0);
  });

  it('getDeduplicator 应返回有效的去重器', () => {
    const ingestion = new EventIngestion(bus as any);
    const dedup = ingestion.getDeduplicator();
    expect(dedup).toBeDefined();
    expect(typeof dedup.checkAndRecord).toBe('function');
  });

  it('start/stop 应切换运行状态并启动/停止适配器', () => {
    const ingestion = new EventIngestion(bus as any);
    const adapter = createMockAdapter('a1', 'Lifecycle');
    ingestion.registerAdapter(adapter);

    // reset because registerAdapter calls start when not running: 0 times
    (adapter.start as any).mockClear();

    ingestion.start();
    expect(ingestion.isRunning()).toBe(true);
    expect(adapter.start).toHaveBeenCalled();

    ingestion.stop();
    expect(ingestion.isRunning()).toBe(false);
    expect(adapter.stop).toHaveBeenCalled();
  });

  it('setCurrentTick 应更新所有适配器和数据源的 tick', () => {
    const ingestion = new EventIngestion(bus as any);
    const adapter = createMockAdapter('a1', 'TickSync');
    ingestion.registerAdapter(adapter);

    ingestion.setCurrentTick(99);
    expect(adapter.setCurrentTick).toHaveBeenCalledWith(99);
  });

  it('getStatus 应返回完整的摄取状态', () => {
    const ingestion = new EventIngestion(bus as any);
    ingestion.registerAdapter(createMockAdapter('a1', 'StatCheck'));

    const status = ingestion.getStatus();
    expect(status).toBeDefined();
    expect(status.running).toBe(false);
    expect(status.adapterCount).toBe(1);
  });

  it('getSourceStatus 不存在的源应返回 undefined', () => {
    const ingestion = new EventIngestion(bus as any);
    expect(ingestion.getSourceStatus('nonexistent')).toBeUndefined();
  });
});

describe('EventIngestion index 导出完整性', () => {
  it('所有适配器类应可以导入', async () => {
    const mod = await import('./index.js');
    expect(mod.EventIngestion).toBeDefined();
    expect(mod.parseFeed).toBeDefined();
    expect(mod.ImportanceEvaluator).toBeDefined();
    expect(mod.FinanceDataSource).toBeDefined();
    expect(mod.MarketSentiment).toBeDefined();
    expect(mod.RssAdapter).toBeDefined();
    expect(mod.FinanceAdapter).toBeDefined();
    expect(mod.TwitterAdapter).toBeDefined();
    expect(mod.RedditAdapter).toBeDefined();
    expect(mod.NewsApiAdapter).toBeDefined();
    expect(mod.ContentDeduplicator).toBeDefined();
    expect(mod.POPULAR_STOCKS).toBeDefined();
    expect(mod.POPULAR_CRYPTO).toBeDefined();
    expect(mod.POPULAR_INDICES).toBeDefined();
  });
});
