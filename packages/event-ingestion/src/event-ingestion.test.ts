// ============================================================================
// @beeclaw/event-ingestion 单元测试
// 测试 FeedParser、ImportanceEvaluator、EventIngestion
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFeed } from './FeedParser.js';
import { ImportanceEvaluator } from './ImportanceEvaluator.js';
import { EventIngestion } from './EventIngestion.js';
import type { FeedItem } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── FeedParser 测试 ──

describe('parseFeed', () => {
  it('应解析 RSS 2.0 feed', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <description>A test RSS feed</description>
    <link>https://example.com</link>
    <item>
      <title>Test Article</title>
      <description>This is a test article content.</description>
      <link>https://example.com/article1</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>article-1</guid>
    </item>
    <item>
      <title>Second Article</title>
      <description>Another test article.</description>
      <link>https://example.com/article2</link>
      <guid>article-2</guid>
    </item>
  </channel>
</rss>`;

    const feed = parseFeed(rssXml);
    expect(feed.title).toBe('Test Feed');
    expect(feed.type).toBe('rss');
    expect(feed.items.length).toBe(2);
    expect(feed.items[0]!.title).toBe('Test Article');
    expect(feed.items[0]!.guid).toBe('article-1');
    expect(feed.items[1]!.title).toBe('Second Article');
  });

  it('应解析 Atom feed', () => {
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <subtitle>A test Atom feed</subtitle>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Atom Entry</title>
    <summary>An atom entry summary.</summary>
    <link href="https://example.com/entry1" rel="alternate"/>
    <id>entry-1</id>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`;

    const feed = parseFeed(atomXml);
    expect(feed.title).toBe('Atom Feed');
    expect(feed.type).toBe('atom');
    expect(feed.items.length).toBe(1);
    expect(feed.items[0]!.title).toBe('Atom Entry');
    expect(feed.items[0]!.guid).toBe('entry-1');
  });

  it('应处理包含 CDATA 的 RSS', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CDATA Feed</title>
    <item>
      <title><![CDATA[Title with <special> chars]]></title>
      <description><![CDATA[Content with <b>HTML</b> tags]]></description>
      <guid>cdata-1</guid>
    </item>
  </channel>
</rss>`;

    const feed = parseFeed(rssXml);
    expect(feed.items[0]!.title).toBe('Title with <special> chars');
  });

  it('应处理 HTML 实体', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Entity Feed</title>
    <item>
      <title>Test &amp; Article &lt;1&gt;</title>
      <description>Content with &quot;quotes&quot;</description>
      <guid>entity-1</guid>
    </item>
  </channel>
</rss>`;

    const feed = parseFeed(rssXml);
    expect(feed.items[0]!.title).toBe('Test & Article <1>');
  });

  it('无效 RSS 应抛错', () => {
    expect(() => parseFeed('<invalid>no channel</invalid>')).toThrow();
  });
});

// ── ImportanceEvaluator 测试 ──

describe('ImportanceEvaluator', () => {
  let evaluator: ImportanceEvaluator;

  beforeEach(() => {
    evaluator = new ImportanceEvaluator();
  });

  it('高重要性关键词应提升重要性', () => {
    const item: FeedItem = {
      title: '央行宣布降息',
      content: '美联储决定降低利率50个基点',
      guid: 'high-1',
    };

    const result = evaluator.evaluate(item);
    expect(result.importance).toBeGreaterThan(0.5);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
    expect(result.matchedKeywords).toContain('央行');
  });

  it('中重要性关键词应中等提升重要性', () => {
    const item: FeedItem = {
      title: '科技公司发布AI产品',
      content: '某科技公司发布了新的人工智能产品。',
      guid: 'medium-1',
    };

    const result = evaluator.evaluate(item);
    expect(result.importance).toBeGreaterThan(0.2);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('无匹配关键词应返回基础重要性', () => {
    const item: FeedItem = {
      title: '天气预报',
      content: '今天天气晴。',
      guid: 'low-1',
    };

    const result = evaluator.evaluate(item);
    // 基础分 0.2 + 可能少量启发式加分
    expect(result.importance).toBeLessThanOrEqual(0.5);
    expect(result.matchedKeywords.length).toBe(0);
  });

  it('propagationRadius 应与重要性正相关', () => {
    const highItem: FeedItem = {
      title: '央行加息 危机 暴跌',
      content: '美联储紧急加息引发全球市场崩盘危机，股市暴跌。',
      guid: 'pr-1',
    };
    const lowItem: FeedItem = {
      title: '天气',
      content: '晴。',
      guid: 'pr-2',
    };

    const highResult = evaluator.evaluate(highItem);
    const lowResult = evaluator.evaluate(lowItem);

    expect(highResult.propagationRadius).toBeGreaterThan(lowResult.propagationRadius);
  });

  it('自定义关键词应生效', () => {
    const customEvaluator = new ImportanceEvaluator(['自定义高'], ['自定义中']);

    const item: FeedItem = {
      title: '自定义高',
      content: '包含自定义高重要性关键词。',
      guid: 'custom-1',
    };

    const result = customEvaluator.evaluate(item);
    expect(result.matchedKeywords).toContain('自定义高');
    expect(result.importance).toBeGreaterThan(0.3);
  });

  it('较长内容应获得启发式加分', () => {
    const shortItem: FeedItem = {
      title: '短标题',
      content: '短内容。',
      guid: 'short-1',
    };
    const longItem: FeedItem = {
      title: '一个比较长的标题用来测试启发式规则',
      content: 'x'.repeat(600),
      guid: 'long-1',
    };

    const shortResult = evaluator.evaluate(shortItem);
    const longResult = evaluator.evaluate(longItem);

    expect(longResult.importance).toBeGreaterThan(shortResult.importance);
  });
});

// ── EventIngestion 测试 ──

describe('EventIngestion', () => {
  // 我们需要 mock EventBus
  function createMockEventBus() {
    return {
      injectEvent: vi.fn(),
      consumeEvents: vi.fn().mockReturnValue([]),
      emitAgentEvent: vi.fn(),
      cleanup: vi.fn(),
      getActiveEvents: vi.fn().mockReturnValue([]),
    };
  }

  it('应初始化并添加数据源', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);

    ingestion.addSource({
      id: 'test-source',
      name: 'Test Source',
      url: 'https://example.com/feed.xml',
      category: 'finance',
    });

    const states = ingestion.getSourceStates();
    expect(states.length).toBe(1);
    expect(states[0]!.id).toBe('test-source');
    expect(states[0]!.name).toBe('Test Source');
    expect(states[0]!.enabled).toBe(true);
  });

  it('应移除数据源', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);

    ingestion.addSource({
      id: 'src1',
      name: 'Source 1',
      url: 'https://example.com/feed1.xml',
      category: 'tech',
    });

    expect(ingestion.getSourceStates().length).toBe(1);
    ingestion.removeSource('src1');
    expect(ingestion.getSourceStates().length).toBe(0);
  });

  it('添加重复 id 数据源应覆盖', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);

    ingestion.addSource({
      id: 'dup',
      name: 'First',
      url: 'https://example.com/1.xml',
      category: 'finance',
    });
    ingestion.addSource({
      id: 'dup',
      name: 'Second',
      url: 'https://example.com/2.xml',
      category: 'tech',
    });

    const states = ingestion.getSourceStates();
    expect(states.length).toBe(1);
    expect(states[0]!.name).toBe('Second');
  });

  it('setCurrentTick 应更新内部 tick', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);

    // 不应抛错
    expect(() => ingestion.setCurrentTick(10)).not.toThrow();
  });

  it('isRunning 初始为 false', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);
    expect(ingestion.isRunning()).toBe(false);
  });

  it('start / stop 应切换运行状态', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);

    // 不添加数据源，start 不应报错
    ingestion.start();
    expect(ingestion.isRunning()).toBe(true);

    ingestion.stop();
    expect(ingestion.isRunning()).toBe(false);
  });

  it('getSeenCount / clearSeenCache 应正确工作', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);

    expect(ingestion.getSeenCount()).toBe(0);
    ingestion.clearSeenCache();
    expect(ingestion.getSeenCount()).toBe(0);
  });

  it('pollSource 不存在的 source 应抛错', async () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any);

    await expect(ingestion.pollSource('nonexist')).rejects.toThrow('不存在');
  });

  it('通过 config 初始化数据源', () => {
    const mockBus = createMockEventBus();
    const ingestion = new EventIngestion(mockBus as any, {
      sources: [
        {
          id: 'cfg-src',
          name: 'Config Source',
          url: 'https://example.com/feed.xml',
          category: 'general',
        },
      ],
    });

    const states = ingestion.getSourceStates();
    expect(states.length).toBe(1);
    expect(states[0]!.id).toBe('cfg-src');
  });
});
