// ============================================================================
// EventIngestion.getStatus / getSourceStatus 单元测试
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

function createValidRssXml(items: Array<{ title: string; guid: string }>) {
  const itemsXml = items
    .map(
      (item) => `
    <item>
      <title>${item.title}</title>
      <description>Content</description>
      <link>https://example.com/${item.guid}</link>
      <guid>${item.guid}</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
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

// ── 测试套件 ──

describe('EventIngestion — getStatus / getSourceStatus', () => {
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

  // ── getStatus ──

  describe('getStatus', () => {
    it('初始状态应返回完整结构', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      const status = ingestion.getStatus();

      expect(status).toEqual({
        running: false,
        sourceCount: 0,
        financeSourceCount: 0,
        deduplicationCacheSize: 0,
        sources: [],
        financeSources: [],
      });
    });

    it('添加数据源后应反映在 status 中', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addSource(createSource({ id: 's1', name: 'Source 1' }));
      ingestion.addSource(createSource({ id: 's2', name: 'Source 2', enabled: false }));

      const status = ingestion.getStatus();

      expect(status.sourceCount).toBe(2);
      expect(status.sources).toHaveLength(2);
      expect(status.sources[0]).toMatchObject({
        id: 's1',
        name: 'Source 1',
        enabled: true,
        lastPollTime: null,
        lastError: null,
        itemsFetched: 0,
        eventsEmitted: 0,
      });
      expect(status.sources[1]).toMatchObject({
        id: 's2',
        enabled: false,
      });
    });

    it('running 状态应正确反映', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      expect(ingestion.getStatus().running).toBe(false);

      ingestion.start();
      expect(ingestion.getStatus().running).toBe(true);

      ingestion.stop();
      expect(ingestion.getStatus().running).toBe(false);
    });

    it('轮询后 lastPollTime 和计数应更新', async () => {
      const xml = createValidRssXml([
        { title: 'Item A', guid: 'a-1' },
        { title: 'Item B', guid: 'b-1' },
      ]);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(xml, { status: 200 });
      });

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');

      const status = ingestion.getStatus();
      const srcStatus = status.sources[0]!;

      expect(srcStatus.lastPollTime).toBeTruthy();
      expect(srcStatus.lastError).toBeNull();
      expect(srcStatus.itemsFetched).toBe(2);
      expect(srcStatus.eventsEmitted).toBe(2);
      expect(status.deduplicationCacheSize).toBe(2);
    });

    it('fetch 失败后 lastError 应被填充', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network fail'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      const promise = ingestion.pollSource('test-src');
      await vi.advanceTimersByTimeAsync(30_000);
      await promise;

      const status = ingestion.getStatus();
      expect(status.sources[0]!.lastError).toContain('Network fail');
      expect(status.sources[0]!.lastPollTime).toBeTruthy();
    });

    it('lastPollTime 应为 ISO 字符串格式', async () => {
      const xml = createValidRssXml([{ title: 'Item', guid: 'iso-1' }]);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(xml, { status: 200 });
      });

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource());

      await ingestion.pollSource('test-src');

      const status = ingestion.getStatus();
      const pollTime = status.sources[0]!.lastPollTime;

      expect(typeof pollTime).toBe('string');
      // 应为有效的 ISO 日期字符串
      expect(new Date(pollTime!).toISOString()).toBe(pollTime);
    });

    it('金融数据源应反映在 status 中', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      ingestion.addFinanceSource({
        id: 'fin-1',
        name: 'Finance Source',
        symbols: [{ symbol: 'AAPL', name: 'Apple', type: 'stock' }],
        pollIntervalMs: 60_000,
        enabled: true,
      });

      const status = ingestion.getStatus();
      expect(status.financeSourceCount).toBe(1);
      expect(status.financeSources).toHaveLength(1);
      expect(status.financeSources[0]).toMatchObject({
        id: 'fin-1',
        name: 'Finance Source',
        enabled: true,
        running: false,
      });

      fetchSpy.mockRestore();
    });
  });

  // ── getSourceStatus ──

  describe('getSourceStatus', () => {
    it('不存在的数据源应返回 undefined', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);

      expect(ingestion.getSourceStatus('nonexistent')).toBeUndefined();
    });

    it('存在的数据源应返回正确状态', () => {
      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'my-src', name: 'My Source', url: 'https://s.com/feed' }));

      const status = ingestion.getSourceStatus('my-src');

      expect(status).toBeDefined();
      expect(status).toEqual({
        id: 'my-src',
        name: 'My Source',
        url: 'https://s.com/feed',
        enabled: true,
        lastPollTime: null,
        lastError: null,
        itemsFetched: 0,
        eventsEmitted: 0,
      });
    });

    it('轮询后状态应更新', async () => {
      const xml = createValidRssXml([{ title: 'X', guid: 'x-1' }]);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(xml, { status: 200 });
      });

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'poll-src' }));

      await ingestion.pollSource('poll-src');

      const status = ingestion.getSourceStatus('poll-src')!;
      expect(status.itemsFetched).toBe(1);
      expect(status.eventsEmitted).toBe(1);
      expect(status.lastPollTime).toBeTruthy();
      expect(status.lastError).toBeNull();
    });

    it('getSourceStatus 和 getStatus 中对应源应一致', async () => {
      const xml = createValidRssXml([{ title: 'Y', guid: 'y-1' }]);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(xml, { status: 200 });
      });

      const bus = createMockEventBus();
      const ingestion = new EventIngestion(bus as any);
      ingestion.addSource(createSource({ id: 'consistent' }));

      await ingestion.pollSource('consistent');

      const singleStatus = ingestion.getSourceStatus('consistent')!;
      const allStatus = ingestion.getStatus();
      const matchedSource = allStatus.sources.find(s => s.id === 'consistent')!;

      expect(singleStatus).toEqual(matchedSource);
    });
  });
});
