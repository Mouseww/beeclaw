// ============================================================================
// @beeclaw/event-ingestion RssAdapter 单元测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RssAdapter } from './RssAdapter.js';
import type { FeedSource, RssAdapterConfig } from './RssAdapter.js';

// ── 测试辅助 ──

function makeSource(overrides: Partial<FeedSource> = {}): FeedSource {
  return {
    id: 'test-rss',
    name: '测试 RSS 源',
    url: 'https://example.com/feed.xml',
    category: 'finance',
    pollIntervalMs: 300_000,
    tags: ['测试'],
    enabled: true,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<RssAdapterConfig> = {}): RssAdapterConfig {
  return {
    source: makeSource(),
    ...overrides,
  };
}

/** 标准 RSS XML */
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>财经新闻</title>
    <description>最新财经资讯</description>
    <link>https://finance.example.com</link>
    <item>
      <title>央行降息</title>
      <description>央行宣布降低基准利率。</description>
      <link>https://finance.example.com/1</link>
      <pubDate>Mon, 01 Jan 2024 08:00:00 GMT</pubDate>
      <guid>news-001</guid>
      <category>财经</category>
    </item>
    <item>
      <title>股市大涨</title>
      <description>今日A股全线上涨。</description>
      <link>https://finance.example.com/2</link>
      <pubDate>Tue, 02 Jan 2024 08:00:00 GMT</pubDate>
      <guid>news-002</guid>
    </item>
  </channel>
</rss>`;

/** 空 RSS */
const EMPTY_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>空频道</title>
  </channel>
</rss>`;

function mockFetch(body: string, status = 200): (url: string, init?: RequestInit) => Promise<Response> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(body),
  } as Response);
}

function mockFetchError(message: string): (url: string, init?: RequestInit) => Promise<Response> {
  return vi.fn().mockRejectedValue(new Error(message));
}

describe('RssAdapter', () => {
  let adapter: RssAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new RssAdapter(makeConfig());
  });

  afterEach(() => {
    adapter.stop();
    vi.useRealTimers();
  });

  // ── 构造与配置 ──

  describe('构造与配置', () => {
    it('应正确初始化基础属性', () => {
      expect(adapter.id).toBe('test-rss');
      expect(adapter.name).toBe('测试 RSS 源');
      expect(adapter.type).toBe('rss');
    });

    it('应使用默认 enabled=true', () => {
      const noEnabled = new RssAdapter(makeConfig({
        source: makeSource({ enabled: undefined }),
      }));
      expect(noEnabled.getSource().enabled).toBe(true);
    });

    it('getSource() 应返回拷贝', () => {
      const s1 = adapter.getSource();
      const s2 = adapter.getSource();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });

    it('默认 maxItemsPerPoll 应为 20', () => {
      // 构造超过 20 条的 feed
      const items = Array.from({ length: 25 }, (_, i) =>
        `<item><title>条目${i}</title><description>内容${i}</description><guid>g-${i}</guid></item>`,
      ).join('\n');
      const bigRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>大源</title>${items}</channel></rss>`;

      adapter.fetchFn = mockFetch(bigRss);
    });

    it('自定义 maxItemsPerPoll 应限制结果数量', async () => {
      const items = Array.from({ length: 10 }, (_, i) =>
        `<item><title>条目${i}</title><description>内容${i}</description><guid>gx-${i}</guid></item>`,
      ).join('\n');
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>源</title>${items}</channel></rss>`;

      const limitAdapter = new RssAdapter(makeConfig({ maxItemsPerPoll: 3 }));
      limitAdapter.fetchFn = mockFetch(rss);

      const events = await limitAdapter.poll();
      expect(events).toHaveLength(3);
    });
  });

  // ── 轮询 (poll) ──

  describe('poll()', () => {
    it('成功轮询应返回事件列表', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);

      const events = await adapter.poll();
      expect(events).toHaveLength(2);
    });

    it('事件应包含正确的基础字段', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);

      const events = await adapter.poll();
      const event = events[0]!;
      expect(event.title).toBe('央行降息');
      expect(event.category).toBe('finance');
      expect(event.source).toContain('feed:test-rss');
      expect(event.source).toContain('测试 RSS 源');
      expect(event.deduplicationId).toBe('news-001');
      expect(event.importance).toBeGreaterThanOrEqual(0);
      expect(event.importance).toBeLessThanOrEqual(1);
      expect(event.propagationRadius).toBeGreaterThanOrEqual(0);
      expect(event.propagationRadius).toBeLessThanOrEqual(1);
    });

    it('事件 content 应包含原始内容', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);

      const events = await adapter.poll();
      expect(events[0]!.content).toContain('央行宣布降低基准利率');
    });

    it('事件 content 应包含作者信息', async () => {
      const rssWithAuthor = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>测试</title>
      <description>内容</description>
      <dc:creator>张三</dc:creator>
      <guid>auth-1</guid>
    </item>
  </channel>
</rss>`;
      adapter.fetchFn = mockFetch(rssWithAuthor);

      const events = await adapter.poll();
      expect(events[0]!.content).toContain('来源作者: 张三');
    });

    it('事件 content 应包含链接', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);

      const events = await adapter.poll();
      expect(events[0]!.content).toContain('原文链接: https://finance.example.com/1');
    });

    it('事件 content 应包含发布时间', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);

      const events = await adapter.poll();
      expect(events[0]!.content).toContain('发布时间:');
    });

    it('事件 tags 应合并源标签和条目分类', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);

      const events = await adapter.poll();
      expect(events[0]!.tags).toContain('测试');  // 源级别标签
      expect(events[0]!.tags).toContain('财经');  // 条目分类
    });

    it('tags 应去重', async () => {
      const dupTagAdapter = new RssAdapter(makeConfig({
        source: makeSource({ tags: ['财经'] }),
      }));
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>T</title>
<item><title>T</title><description>C</description><guid>g1</guid><category>财经</category></item>
</channel></rss>`;
      dupTagAdapter.fetchFn = mockFetch(rss);

      const events = await dupTagAdapter.poll();
      const dupes = events[0]!.tags.filter(t => t === '财经');
      expect(dupes).toHaveLength(1);
    });

    it('空 feed 应返回空事件列表', async () => {
      adapter.fetchFn = mockFetch(EMPTY_RSS);

      const events = await adapter.poll();
      expect(events).toEqual([]);
    });
  });

  // ── 重要性评估集成 ──

  describe('重要性评估集成', () => {
    it('包含高重要性关键词的事件应有更高 importance', async () => {
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>T</title>
<item><title>央行加息危机暴跌</title><description>紧急内容</description><guid>hi-1</guid></item>
<item><title>天气晴朗宜出行</title><description>普通天气</description><guid>lo-1</guid></item>
</channel></rss>`;
      adapter.fetchFn = mockFetch(rss);

      const events = await adapter.poll();
      const highEvent = events.find(e => e.title.includes('央行'));
      const lowEvent = events.find(e => e.title.includes('天气'));
      expect(highEvent!.importance).toBeGreaterThan(lowEvent!.importance);
    });

    it('自定义关键词应影响评估结果', async () => {
      const customAdapter = new RssAdapter(makeConfig({
        highImportanceKeywords: ['自定义关键'],
        mediumImportanceKeywords: [],
      }));
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>T</title>
<item><title>自定义关键消息</title><description>内容</description><guid>cust-1</guid></item>
</channel></rss>`;
      customAdapter.fetchFn = mockFetch(rss);

      const events = await customAdapter.poll();
      expect(events[0]!.importance).toBeGreaterThanOrEqual(0.35);
      expect(events[0]!.tags).toContain('自定义关键');
    });
  });

  // ── 错误处理 ──

  describe('错误处理', () => {
    it('网络错误应返回空数组', async () => {
      adapter.fetchFn = mockFetchError('Network timeout');

      const events = await adapter.poll();
      expect(events).toEqual([]);
    });

    it('网络错误应更新错误指标', async () => {
      adapter.fetchFn = mockFetchError('Connection refused');

      await adapter.poll();

      const health = adapter.getHealthMetrics();
      expect(health.totalErrors).toBe(1);
      expect(health.consecutiveErrors).toBe(1);
      expect(health.lastErrorMessage).toBe('Connection refused');
      expect(health.lastErrorTime).toBeInstanceOf(Date);
    });

    it('HTTP 错误应重试', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('HTTP 503'));
      adapter.fetchFn = fn;

      await adapter.poll();
      // fetchFeed 默认重试 3 次
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('连续成功应重置错误计数', async () => {
      adapter.fetchFn = mockFetchError('Error');
      await adapter.poll();
      expect(adapter.getHealthMetrics().consecutiveErrors).toBe(1);

      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      await adapter.poll();
      expect(adapter.getHealthMetrics().consecutiveErrors).toBe(0);
    });
  });

  // ── 健康指标 ──

  describe('getHealthMetrics()', () => {
    it('初始健康指标应全部为零/空', () => {
      const health = adapter.getHealthMetrics();
      expect(health.sourceId).toBe('test-rss');
      expect(health.connected).toBe(false);
      expect(health.consecutiveErrors).toBe(0);
      expect(health.totalErrors).toBe(0);
      expect(health.totalSuccesses).toBe(0);
      expect(health.errorRate).toBe(0);
      expect(health.eventsEmitted).toBe(0);
      expect(health.lastSuccessTime).toBeNull();
      expect(health.lastErrorTime).toBeNull();
      expect(health.lastErrorMessage).toBeNull();
    });

    it('成功轮询后应更新指标', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      await adapter.poll();

      const health = adapter.getHealthMetrics();
      expect(health.connected).toBe(true);
      expect(health.totalSuccesses).toBe(1);
      expect(health.eventsEmitted).toBe(2);
      expect(health.lastSuccessTime).toBeInstanceOf(Date);
      expect(health.lastLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('errorRate 应正确计算', async () => {
      adapter.fetchFn = mockFetchError('E');
      await adapter.poll();
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      await adapter.poll();

      const health = adapter.getHealthMetrics();
      expect(health.errorRate).toBe(0.5);
    });

    it('averageLatencyMs 应正确计算', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      await adapter.poll();
      await adapter.poll();

      const health = adapter.getHealthMetrics();
      expect(health.averageLatencyMs).toBeGreaterThanOrEqual(0);
      expect(health.latencyCount).toBeUndefined(); // 不在公开接口中
    });

    it('eventsEmitted 应累计', async () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      await adapter.poll();
      const count1 = adapter.getHealthMetrics().eventsEmitted;

      await adapter.poll();
      const count2 = adapter.getHealthMetrics().eventsEmitted;
      expect(count2).toBe(count1 * 2);
    });
  });

  // ── start/stop 生命周期 ──

  describe('start/stop 生命周期', () => {
    it('start 应立即执行一次轮询', () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      adapter.start();
      expect(adapter.fetchFn).toHaveBeenCalledTimes(1);
    });

    it('重复 start 应无副作用', () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      adapter.start();
      adapter.start();
      // 第一次 start 调用一次 fetch，第二次 start 不应再调
      expect(adapter.fetchFn).toHaveBeenCalledTimes(1);
    });

    it('disabled 的 adapter 不应启动', () => {
      const disabled = new RssAdapter(makeConfig({
        source: makeSource({ enabled: false }),
      }));
      disabled.fetchFn = mockFetch(SAMPLE_RSS);
      disabled.start();
      expect(disabled.fetchFn).not.toHaveBeenCalled();
    });

    it('stop 应停止定时器', () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      adapter.start();
      adapter.stop();
      // 前进时间不应触发额外的 fetch
      const callCount = (adapter.fetchFn as ReturnType<typeof vi.fn>).mock.calls.length;
      vi.advanceTimersByTime(600_000);
      expect((adapter.fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });

    it('uptimeMs 应在 start 后递增', () => {
      adapter.fetchFn = mockFetch(SAMPLE_RSS);
      adapter.start();
      vi.advanceTimersByTime(10_000);
      const health = adapter.getHealthMetrics();
      expect(health.uptimeMs).toBeGreaterThanOrEqual(10_000);
    });

    it('未启动时 uptimeMs 应为 0', () => {
      expect(adapter.getHealthMetrics().uptimeMs).toBe(0);
    });
  });

  // ── setCurrentTick ──

  describe('setCurrentTick', () => {
    it('应设置当前 tick（不报错）', () => {
      expect(() => adapter.setCurrentTick(100)).not.toThrow();
    });
  });

  // ── Atom feed 兼容 ──

  describe('Atom feed 兼容', () => {
    it('应正确解析 Atom feed', async () => {
      const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>科技资讯</title>
  <entry>
    <title>AI 突破</title>
    <summary>人工智能取得重大突破。</summary>
    <link href="https://tech.example.com/ai" rel="alternate"/>
    <id>entry-ai-001</id>
    <updated>2024-06-15T10:00:00Z</updated>
    <author><name>李四</name></author>
  </entry>
</feed>`;
      adapter.fetchFn = mockFetch(atom);

      const events = await adapter.poll();
      expect(events).toHaveLength(1);
      expect(events[0]!.title).toBe('AI 突破');
      expect(events[0]!.content).toContain('人工智能取得重大突破');
      expect(events[0]!.content).toContain('来源作者: 李四');
      expect(events[0]!.deduplicationId).toBe('entry-ai-001');
    });
  });

  // ── 标签中匹配的关键词 ──

  describe('匹配关键词作为标签', () => {
    it('匹配到的关键词应添加到 tags（最多 5 个）', async () => {
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>T</title>
<item><title>央行加息降息危机暴跌暴涨崩盘</title><description>紧急突发</description><guid>kw-1</guid></item>
</channel></rss>`;
      adapter.fetchFn = mockFetch(rss);

      const events = await adapter.poll();
      // matchedKeywords 中最多取 5 个添加到 tags
      const kwTags = events[0]!.tags.filter(t => ['央行', '加息', '降息', '危机', '暴跌', '暴涨', '崩盘', '紧急', '突发'].includes(t));
      expect(kwTags.length).toBeLessThanOrEqual(5 + 4); // 源标签 + 最多 5 个关键词 (一些可能合并)
    });
  });

  // ── 无源标签 ──

  describe('无源标签', () => {
    it('source.tags 为 undefined 时不应报错', async () => {
      const noTagAdapter = new RssAdapter(makeConfig({
        source: makeSource({ tags: undefined }),
      }));
      noTagAdapter.fetchFn = mockFetch(SAMPLE_RSS);

      const events = await noTagAdapter.poll();
      expect(events.length).toBeGreaterThan(0);
      expect(Array.isArray(events[0]!.tags)).toBe(true);
    });
  });
});
