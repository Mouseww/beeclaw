// ============================================================================
// EventIngestion 深度单元测试
// 覆盖：数据源管理、轮询、Feed 解析注入、去重缓存、金融数据源、边界情况
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventIngestion } from './EventIngestion.js';
import type { FeedSource, EventIngestionConfig } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock 工厂 ──

function createMockEventBus() {
  return {
    injectEvent: vi.fn(),
    consumeEvents: vi.fn().mockReturnValue([]),
    emitAgentEvent: vi.fn(),
    cleanup: vi.fn(),
    getActiveEvents: vi.fn().mockReturnValue([]),
  };
}

function createValidRssXml(items: Array<{ title: string; guid: string; content?: string }>) {
  const itemsXml = items
    .map(
      (item) => `
    <item>
      <title>${item.title}</title>
      <description>${item.content ?? 'Default content'}</description>
      <link>https://example.com/${item.guid}</link>
      <guid>${item.guid}</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <author>TestAuthor</author>
      <category>TestCategory</category>
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <description>A test feed</description>
    ${itemsXml}
  </channel>
</rss>`;
}

function createSource(overrides?: Partial<FeedSource>): FeedSource {
  return {
    id: 'test-src',
    name: 'Test Source',
    url: 'https://example.com/feed.xml',
    category: 'finance',
    enabled: true,
    tags: ['test-tag'],
    ...overrides,
  };
}

function mockFetchSuccess(xml: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(xml, { status: 200, statusText: 'OK' });
  });
}

function mockFetchFailure(message: string) {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(message));
}

// ── 测试套件 ──

describe('EventIngestion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── 构造函数 / 初始化 ──

  describe('构造函数', () => {
    it('应使用默认配置初始化', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      expect(ingestion.isRunning()).toBe(false);
      expect(ingestion.getSeenCount()).toBe(0);
      expect(ingestion.getSourceStates()).toEqual([]);
    });

    it('应通过 config 注册初始数据源', () => {
      const bus = createMockEventBus();
      const config: Partial<EventIngestionConfig> = {
        sources: [
          createSource({ id: 'src-1', name: 'Source 1' }),
          createSource({ id: 'src-2', name: 'Source 2' }),
        ],
      };

      const ingestion = new EventIngestion(bus as any, config);
      const states = ingestion.getSourceStates();
      expect(states).toHaveLength(2);
      expect(states[0]!.id).toBe('src-1');
      expect(states[1]!.id).toBe('src-2');
    });

    it('应使用自定义配置参数', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any, {
        maxItemsPerPoll: 5,
        deduplicationCacheSize: 100,
        defaultPollIntervalMs: 60_000,
        highImportanceKeywords: ['自定义高'],
        mediumImportanceKeywords: ['自定义中'],
      });

      // 实例正常创建
      expect(ingestion).toBeDefined();
    });
  });

  // ── 数据源管理 ──

  describe('addSource', () => {
    it('应添加数据源并记录默认 enabled=true', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addSource(createSource());
      const states = ingestion.getSourceStates();
      expect(states).toHaveLength(1);
      expect(states[0]!.enabled).toBe(true);
      expect(states[0]!.itemsFetched).toBe(0);
      expect(states[0]!.eventsEmitted).toBe(0);
    });

    it('应支持 enabled=false 的数据源', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addSource(createSource({ enabled: false }));
      const states = ingestion.getSourceStates();
      expect(states[0]!.enabled).toBe(false);
    });

    it('重复 id 应覆盖旧数据源', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addSource(createSource({ id: 'dup', name: 'First' }));
      ingestion.addSource(createSource({ id: 'dup', name: 'Second' }));

      const states = ingestion.getSourceStates();
      expect(states).toHaveLength(1);
      expect(states[0]!.name).toBe('Second');
    });

    it('运行中添加启用的数据源应立即启动轮询', () => {
      const xml = createValidRssXml([{ title: 'Hot', guid: 'hot-1' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.start();

      ingestion.addSource(createSource({ id: 'live-src' }));

      // 立即轮询应触发 fetch
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('removeSource', () => {
    it('应移除存在的数据源', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      ingestion.removeSource('test-src');
      expect(ingestion.getSourceStates()).toHaveLength(0);
    });

    it('移除不存在的数据源不应报错', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      expect(() => ingestion.removeSource('nonexistent')).not.toThrow();
    });

    it('移除数据源应清除其定时器', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      // 不 mock fetch，因为 start 会触发轮询
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('mocked'));

      ingestion.addSource(createSource({ id: 'timed-src' }));
      ingestion.start();

      ingestion.removeSource('timed-src');

      // 推进时间，不应再有 fetch 调用（仅初始那次）
      const callCount = (globalThis.fetch as any).mock.calls.length;
      vi.advanceTimersByTime(600_000);

      // 不应产生新的调用
      expect((globalThis.fetch as any).mock.calls.length).toBe(callCount);
      vi.mocked(globalThis.fetch).mockRestore();
      ingestion.stop();
    });
  });

  // ── start / stop ──

  describe('start / stop', () => {
    it('start 应切换为运行状态', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.start();
      expect(ingestion.isRunning()).toBe(true);
      ingestion.stop();
    });

    it('重复 start 不应重复启动', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.start();
      ingestion.start(); // 第二次无效
      expect(ingestion.isRunning()).toBe(true);
      ingestion.stop();
    });

    it('stop 应停止运行', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.start();
      ingestion.stop();
      expect(ingestion.isRunning()).toBe(false);
    });

    it('start 应启动所有启用数据源的轮询', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('mocked'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'e1', enabled: true }));
      ingestion.addSource(createSource({ id: 'e2', enabled: true }));
      ingestion.addSource(createSource({ id: 'd1', enabled: false }));

      ingestion.start();

      // 只有 2 个启用的源应触发 fetch (各立即一次)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      ingestion.stop();
      fetchSpy.mockRestore();
    });
  });

  // ── pollSource ──

  describe('pollSource', () => {
    it('不存在的数据源应抛错', async () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      await expect(ingestion.pollSource('ghost')).rejects.toThrow('不存在');
    });

    it('成功轮询应注入事件到 EventBus', async () => {
      const xml = createValidRssXml([
        { title: '文章A', guid: 'a-1' },
        { title: '文章B', guid: 'b-1' },
      ]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'poll-src' }));

      const count = await ingestion.pollSource('poll-src');

      expect(count).toBe(2);
      expect(bus.injectEvent).toHaveBeenCalledTimes(2);

      // 验证注入的事件结构
      const firstCall = bus.injectEvent.mock.calls[0][0];
      expect(firstCall.title).toBe('文章A');
      expect(firstCall.category).toBe('finance');
      expect(firstCall.source).toContain('feed:poll-src');
      expect(firstCall.type).toBe('external');
      expect(firstCall.tick).toBe(0);
      expect(firstCall.tags).toContain('test-tag');

      fetchSpy.mockRestore();
    });

    it('fetch 失败应返回 0 并记录错误', async () => {
      const fetchSpy = mockFetchFailure('Network error');

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'fail-src' }));

      // fetchFeed 内部有重试延迟（setTimeout），需要异步推进 fake timer
      const promise = ingestion.pollSource('fail-src');
      await vi.advanceTimersByTimeAsync(30_000);

      const count = await promise;
      expect(count).toBe(0);
      expect(bus.injectEvent).not.toHaveBeenCalled();

      // lastError 应被记录
      const states = ingestion.getSourceStates();
      expect(states[0]!.lastError).toContain('Network error');

      fetchSpy.mockRestore();
    });

    it('HTTP 错误应重试并最终失败', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 500, statusText: 'Internal Server Error' }),
      );

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      const promise = ingestion.pollSource('test-src');
      await vi.advanceTimersByTimeAsync(30_000);

      const count = await promise;
      expect(count).toBe(0);

      // 应重试 3 次（默认）
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      fetchSpy.mockRestore();
    });
  });

  // ── pollAll ──

  describe('pollAll', () => {
    it('应轮询所有启用的数据源', async () => {
      const xml = createValidRssXml([{ title: 'Item', guid: 'item-1' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 's1' }));
      ingestion.addSource(createSource({ id: 's2' }));
      ingestion.addSource(createSource({ id: 's3', enabled: false }));

      const total = await ingestion.pollAll();

      // item-1 只对第一个源算新条目，第二个源同 guid 会被去重
      // 但两个源的 URL 不同，fetch 被调用 2 次
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // 总注入数量 = 第一个源 1 + 第二个源 0（guid 去重）= 1
      expect(total).toBe(1);

      fetchSpy.mockRestore();
    });

    it('部分失败不应影响其他数据源', async () => {
      let callCount = 0;
      const xml = createValidRssXml([{ title: 'OK', guid: 'ok-1' }]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) {
          // 前 3 次调用（第一个源的 3 次重试）全部失败
          throw new Error('fail');
        }
        return new Response(xml, { status: 200 });
      });

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'fail-src', url: 'https://fail.com/feed' }));
      ingestion.addSource(createSource({ id: 'ok-src', url: 'https://ok.com/feed' }));

      const promise = ingestion.pollAll();
      // 推进 fake timer 让重试延迟通过
      await vi.advanceTimersByTimeAsync(30_000);

      const total = await promise;

      // ok-src 应成功注入 1 个事件
      expect(total).toBe(1);

      fetchSpy.mockRestore();
    });

    it('所有数据源禁用应返回 0', async () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'd1', enabled: false }));
      ingestion.addSource(createSource({ id: 'd2', enabled: false }));

      const total = await ingestion.pollAll();
      expect(total).toBe(0);
    });
  });

  // ── 去重逻辑 ──

  describe('去重', () => {
    it('同一 guid 不应重复注入', async () => {
      const xml = createValidRssXml([
        { title: 'Article', guid: 'dup-guid' },
      ]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      // 第一次轮询
      await ingestion.pollSource('test-src');
      expect(bus.injectEvent).toHaveBeenCalledTimes(1);

      // 第二次轮询，同 guid 应被过滤
      await ingestion.pollSource('test-src');
      expect(bus.injectEvent).toHaveBeenCalledTimes(1); // 不增加

      fetchSpy.mockRestore();
    });

    it('clearSeenCache 后应重新接受旧 guid', async () => {
      const xml = createValidRssXml([{ title: 'Art', guid: 'cached-1' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');
      expect(bus.injectEvent).toHaveBeenCalledTimes(1);

      ingestion.clearSeenCache();
      expect(ingestion.getSeenCount()).toBe(0);

      await ingestion.pollSource('test-src');
      expect(bus.injectEvent).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });

    it('缓存超限应淘汰旧条目', async () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any, {
        deduplicationCacheSize: 3,
      });
      ingestion.addSource(createSource());

      // 第一次轮询 4 个条目
      const xml = createValidRssXml(
        Array.from({ length: 4 }, (_, i) => ({
          title: `Item ${i}`,
          guid: `guid-${i}`,
        })),
      );
      const fetchSpy = mockFetchSuccess(xml);

      await ingestion.pollSource('test-src');

      // 缓存大小应被维护在 maxCacheSize (3)
      expect(ingestion.getSeenCount()).toBe(3);

      fetchSpy.mockRestore();
    });
  });

  // ── maxItemsPerPoll ──

  describe('maxItemsPerPoll 限制', () => {
    it('应限制每次轮询处理的条目数', async () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any, {
        maxItemsPerPoll: 2,
      });
      ingestion.addSource(createSource());

      const xml = createValidRssXml(
        Array.from({ length: 5 }, (_, i) => ({
          title: `Item ${i}`,
          guid: `max-guid-${i}`,
        })),
      );
      const fetchSpy = mockFetchSuccess(xml);

      const count = await ingestion.pollSource('test-src');
      expect(count).toBe(2);
      expect(bus.injectEvent).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });
  });

  // ── setCurrentTick ──

  describe('setCurrentTick', () => {
    it('应更新内部 tick 并反映在注入事件中', async () => {
      const xml = createValidRssXml([{ title: 'Ticked', guid: 'tick-1' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      ingestion.setCurrentTick(42);
      await ingestion.pollSource('test-src');

      expect(bus.injectEvent).toHaveBeenCalledWith(
        expect.objectContaining({ tick: 42 }),
      );

      fetchSpy.mockRestore();
    });
  });

  // ── emitEvent 内部逻辑 ──

  describe('事件注入字段', () => {
    it('应包含作者、链接、发布时间', async () => {
      const xml = createValidRssXml([
        { title: '有作者的文章', guid: 'author-1', content: '正文内容' },
      ]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ tags: ['finance'] }));

      await ingestion.pollSource('test-src');

      const event = bus.injectEvent.mock.calls[0][0];
      expect(event.content).toContain('来源作者:');
      expect(event.content).toContain('原文链接:');
      expect(event.content).toContain('发布时间:');
      expect(event.tags).toContain('finance');
      expect(event.tags).toContain('TestCategory'); // RSS category

      fetchSpy.mockRestore();
    });

    it('事件 source 字段应包含数据源信息', async () => {
      const xml = createValidRssXml([{ title: 'Src', guid: 'src-1' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'my-feed', name: 'My Feed' }));

      await ingestion.pollSource('my-feed');

      const event = bus.injectEvent.mock.calls[0][0];
      expect(event.source).toBe('feed:my-feed(My Feed)');

      fetchSpy.mockRestore();
    });

    it('tags 应去重', async () => {
      const xml = createValidRssXml([{ title: '科技新闻', guid: 'dedup-tag-1' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      // 设置关键词使匹配到 "科技"
      const ingestion = new EventIngestion(bus as any, {
        mediumImportanceKeywords: ['科技'],
      });
      ingestion.addSource(createSource({ tags: ['科技'] }));

      await ingestion.pollSource('test-src');

      const event = bus.injectEvent.mock.calls[0][0];
      // 去重后 '科技' 应只出现一次
      const techCount = event.tags.filter((t: string) => t === '科技').length;
      expect(techCount).toBe(1);

      fetchSpy.mockRestore();
    });
  });

  // ── 金融数据源管理 ──

  describe('金融数据源', () => {
    function createMockFinanceConfig() {
      return {
        id: 'fin-1',
        name: 'Test Finance',
        symbols: [
          { symbol: 'AAPL', name: 'Apple', type: 'stock' as const },
        ],
        pollIntervalMs: 60_000,
        enabled: true,
      };
    }

    it('addFinanceSource 应添加金融数据源', () => {
      // Mock fetch 以避免实际网络请求
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      const source = ingestion.addFinanceSource(createMockFinanceConfig());
      expect(source).toBeDefined();
      expect(source.getId()).toBe('fin-1');

      const states = ingestion.getFinanceSourceStates();
      expect(states).toHaveLength(1);
      expect(states[0]!.id).toBe('fin-1');

      fetchSpy.mockRestore();
    });

    it('addFinanceSource 重复 id 应覆盖', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addFinanceSource(createMockFinanceConfig());
      ingestion.addFinanceSource({ ...createMockFinanceConfig(), name: 'Updated' });

      const states = ingestion.getFinanceSourceStates();
      expect(states).toHaveLength(1);
      expect(states[0]!.name).toBe('Updated');

      fetchSpy.mockRestore();
    });

    it('removeFinanceSource 应移除金融数据源', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addFinanceSource(createMockFinanceConfig());
      ingestion.removeFinanceSource('fin-1');

      expect(ingestion.getFinanceSourceStates()).toHaveLength(0);

      fetchSpy.mockRestore();
    });

    it('removeFinanceSource 不存在的 id 不应报错', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      expect(() => ingestion.removeFinanceSource('ghost')).not.toThrow();
    });

    it('getFinanceSource 应返回正确实例', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addFinanceSource(createMockFinanceConfig());

      const source = ingestion.getFinanceSource('fin-1');
      expect(source).toBeDefined();
      expect(source!.getName()).toBe('Test Finance');

      expect(ingestion.getFinanceSource('nonexist')).toBeUndefined();

      fetchSpy.mockRestore();
    });

    it('setCurrentTick 应同步更新金融数据源 tick', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      const source = ingestion.addFinanceSource(createMockFinanceConfig());
      const setTickSpy = vi.spyOn(source, 'setCurrentTick');

      ingestion.setCurrentTick(100);
      expect(setTickSpy).toHaveBeenCalledWith(100);

      fetchSpy.mockRestore();
    });

    it('start 应启动金融数据源', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      const source = ingestion.addFinanceSource(createMockFinanceConfig());
      const startSpy = vi.spyOn(source, 'start');

      ingestion.start();
      expect(startSpy).toHaveBeenCalled();

      ingestion.stop();
      fetchSpy.mockRestore();
    });

    it('stop 应停止金融数据源', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      const source = ingestion.addFinanceSource(createMockFinanceConfig());
      const stopSpy = vi.spyOn(source, 'stop');

      ingestion.start();
      ingestion.stop();
      expect(stopSpy).toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('运行中添加启用的金融源应立即启动', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.start();

      const config = createMockFinanceConfig();
      const source = ingestion.addFinanceSource(config);
      expect(source.isRunning()).toBe(true);

      ingestion.stop();
      fetchSpy.mockRestore();
    });
  });

  // ── getSourceStates ──

  describe('getSourceStates', () => {
    it('应返回所有数据源的完整状态', async () => {
      const xml = createValidRssXml([{ title: 'S', guid: 'state-1' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'st1', name: 'State1', url: 'https://s1.com/feed' }));

      await ingestion.pollSource('st1');

      const states = ingestion.getSourceStates();
      expect(states).toHaveLength(1);
      expect(states[0]).toMatchObject({
        id: 'st1',
        name: 'State1',
        url: 'https://s1.com/feed',
        enabled: true,
        itemsFetched: 1,
        eventsEmitted: 1,
      });
      expect(states[0]!.lastPollTime).toBeInstanceOf(Date);
      expect(states[0]!.lastError).toBeUndefined();

      fetchSpy.mockRestore();
    });

    it('fetch 失败应在 state 中记录 lastError', async () => {
      const fetchSpy = mockFetchFailure('timeout');

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');

      const states = ingestion.getSourceStates();
      expect(states[0]!.lastError).toContain('timeout');
      expect(states[0]!.lastPollTime).toBeInstanceOf(Date);

      fetchSpy.mockRestore();
    });
  });

  // ── fetchFeed 重试逻辑 ──

  describe('fetchFeed 重试', () => {
    it('第一次失败第二次成功应正常返回', async () => {
      const xml = createValidRssXml([{ title: 'Retry', guid: 'retry-1' }]);
      let callCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('temporary failure');
        }
        return new Response(xml, { status: 200 });
      });

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      // 需要推进 fake timer 让 retry delay 通过
      const promise = ingestion.pollSource('test-src');
      // 推进重试延迟（1000ms）
      await vi.advanceTimersByTimeAsync(2000);

      const count = await promise;
      expect(count).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });

    it('所有重试都失败应返回 0', async () => {
      const fetchSpy = mockFetchFailure('persistent error');

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      const promise = ingestion.pollSource('test-src');
      // 推进所有重试延迟
      await vi.advanceTimersByTimeAsync(20_000);

      const count = await promise;
      expect(count).toBe(0);
      // 3 次尝试
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      fetchSpy.mockRestore();
    });
  });

  // ── 定时轮询 ──

  describe('定时轮询', () => {
    it('start 后应按间隔自动轮询', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('mocked'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any, {
        defaultPollIntervalMs: 60_000,
      });
      ingestion.addSource(createSource());

      ingestion.start();

      // 初始立即调用 1 次
      const initialCalls = fetchSpy.mock.calls.length;
      expect(initialCalls).toBeGreaterThanOrEqual(1);

      // 推进 60s，应触发第 2 次
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);

      ingestion.stop();
      fetchSpy.mockRestore();
    });

    it('自定义数据源轮询间隔应优先于全局默认', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('mocked'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any, {
        defaultPollIntervalMs: 300_000, // 全局 5 分钟
      });
      // 数据源自定义 10 秒
      ingestion.addSource(createSource({ pollIntervalMs: 10_000 }));

      ingestion.start();

      const initialCalls = fetchSpy.mock.calls.length;

      // 推进 10s，应触发自定义间隔的轮询
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);

      ingestion.stop();
      fetchSpy.mockRestore();
    });
  });

  // ── getSeenCount / clearSeenCache ──

  describe('getSeenCount / clearSeenCache', () => {
    it('初始应为 0', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      expect(ingestion.getSeenCount()).toBe(0);
    });

    it('轮询后应增加', async () => {
      const xml = createValidRssXml([
        { title: 'A', guid: 'seen-a' },
        { title: 'B', guid: 'seen-b' },
      ]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');
      expect(ingestion.getSeenCount()).toBe(2);

      fetchSpy.mockRestore();
    });

    it('clearSeenCache 应重置为 0', async () => {
      const xml = createValidRssXml([{ title: 'C', guid: 'seen-c' }]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');
      ingestion.clearSeenCache();
      expect(ingestion.getSeenCount()).toBe(0);

      fetchSpy.mockRestore();
    });
  });

  // ── 重要性评估集成 ──

  describe('重要性评估集成', () => {
    it('高重要性关键词文章应以更高 importance 注入', async () => {
      const xml = createValidRssXml([
        { title: '央行宣布加息', guid: 'high-imp-1', content: '美联储紧急加息' },
      ]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');

      const event = bus.injectEvent.mock.calls[0][0];
      expect(event.importance).toBeGreaterThan(0.5);

      fetchSpy.mockRestore();
    });

    it('无关键词文章应以基础 importance 注入', async () => {
      const xml = createValidRssXml([
        { title: '天气预报', guid: 'low-imp-1', content: '今天晴。' },
      ]);
      const fetchSpy = mockFetchSuccess(xml);

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');

      const event = bus.injectEvent.mock.calls[0][0];
      expect(event.importance).toBeLessThanOrEqual(0.5);

      fetchSpy.mockRestore();
    });
  });
});
