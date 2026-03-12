// ============================================================================
// @beeclaw/event-ingestion FeedParser 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { parseFeed } from './FeedParser.js';

// ── RSS 2.0 解析 ──

describe('FeedParser', () => {
  describe('RSS 2.0 解析', () => {
    it('应正确解析标准 RSS 2.0 feed', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.title).toBe('财经新闻');
      expect(feed.description).toBe('最新财经资讯');
      expect(feed.link).toBe('https://finance.example.com');
      expect(feed.type).toBe('rss');
      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]!.title).toBe('央行降息');
      expect(feed.items[0]!.link).toBe('https://finance.example.com/1');
      expect(feed.items[0]!.guid).toBe('news-001');
      expect(feed.items[0]!.pubDate).toBeInstanceOf(Date);
    });

    it('应解析多个 item', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item><title>文章一</title><guid>1</guid><description>内容1</description></item>
    <item><title>文章二</title><guid>2</guid><description>内容2</description></item>
    <item><title>文章三</title><guid>3</guid><description>内容3</description></item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items).toHaveLength(3);
      expect(feed.items[0]!.title).toBe('文章一');
      expect(feed.items[2]!.title).toBe('文章三');
    });

    it('应处理 CDATA 内容', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CDATA Test</title>
    <item>
      <title><![CDATA[包含 <b>HTML</b> 的标题]]></title>
      <description><![CDATA[<p>段落内容</p>]]></description>
      <guid>cdata-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.title).toBe('包含 <b>HTML</b> 的标题');
    });

    it('应处理 content:encoded 优先于 description', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>测试</title>
      <description>简短描述</description>
      <content:encoded><![CDATA[详细的完整内容]]></content:encoded>
      <guid>ce-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.content).toBe('详细的完整内容');
    });

    it('应解析 category 标签', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>分类测试</title>
      <description>内容</description>
      <category>财经</category>
      <category>股市</category>
      <guid>cat-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.categories).toEqual(['财经', '股市']);
    });

    it('应解析 dc:creator 作为 author', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>作者测试</title>
      <description>内容</description>
      <dc:creator>张三</dc:creator>
      <guid>author-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.author).toBe('张三');
    });

    it('缺少 title 时应使用默认值', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <description>没有标题的条目</description>
      <guid>no-title</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.title).toBe('Unknown Feed');
      expect(feed.items[0]!.title).toBe('无标题');
    });

    it('缺少 content/description 时应使用默认值', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>空内容</title>
      <guid>empty-content</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.content).toBe('无内容');
    });

    it('无效日期应跳过 pubDate', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>无效日期</title>
      <description>内容</description>
      <pubDate>not-a-date</pubDate>
      <guid>bad-date</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.pubDate).toBeUndefined();
    });

    it('无 guid 时应使用 link 作为 guid', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>无GUID</title>
      <description>内容</description>
      <link>https://example.com/fallback</link>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.guid).toBe('https://example.com/fallback');
    });

    it('缺少 <channel> 应抛出错误', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><invalid>no channel</invalid></rss>`;

      expect(() => parseFeed(xml)).toThrow('missing <channel>');
    });
  });

  // ── Atom 解析 ──

  describe('Atom 解析', () => {
    it('应正确解析标准 Atom feed', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>科技资讯</title>
  <subtitle>最新科技新闻</subtitle>
  <link href="https://tech.example.com" rel="alternate"/>
  <entry>
    <title>AI 突破</title>
    <summary>人工智能取得重大突破。</summary>
    <link href="https://tech.example.com/ai" rel="alternate"/>
    <id>entry-ai-001</id>
    <updated>2024-06-15T10:00:00Z</updated>
    <author><name>李四</name></author>
  </entry>
</feed>`;

      const feed = parseFeed(xml);
      expect(feed.title).toBe('科技资讯');
      expect(feed.description).toBe('最新科技新闻');
      expect(feed.type).toBe('atom');
      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]!.title).toBe('AI 突破');
      expect(feed.items[0]!.guid).toBe('entry-ai-001');
      expect(feed.items[0]!.author).toBe('李四');
      expect(feed.items[0]!.pubDate).toBeInstanceOf(Date);
    });

    it('应提取 alternate link', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link href="https://example.com/self" rel="self"/>
  <link href="https://example.com/alt" rel="alternate"/>
  <entry>
    <title>条目</title>
    <id>e1</id>
    <link href="https://example.com/entry-self" rel="self"/>
    <link href="https://example.com/entry-alt" rel="alternate"/>
  </entry>
</feed>`;

      const feed = parseFeed(xml);
      expect(feed.link).toBe('https://example.com/alt');
      expect(feed.items[0]!.link).toBe('https://example.com/entry-alt');
    });

    it('应解析 Atom category term 属性', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <title>分类测试</title>
    <id>cat-atom-1</id>
    <category term="科技"/>
    <category term="AI"/>
  </entry>
</feed>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.categories).toEqual(['科技', 'AI']);
    });

    it('应使用 content 标签优先于 summary', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <title>内容测试</title>
    <id>content-1</id>
    <summary>简短摘要</summary>
    <content>详细的完整内容</content>
  </entry>
</feed>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.content).toBe('详细的完整内容');
    });

    it('应优先使用 updated 时间，其次 published', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <title>时间测试</title>
    <id>time-1</id>
    <updated>2024-06-20T12:00:00Z</updated>
    <published>2024-06-15T08:00:00Z</published>
  </entry>
</feed>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.pubDate!.toISOString()).toContain('2024-06-20');
    });

    it('无 <feed> 根元素的 Atom 应以 namespace 检测', () => {
      const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
  <title>无 XML 声明</title>
  <entry>
    <title>条目</title>
    <id>no-xml-decl</id>
  </entry>
</feed>`;

      const feed = parseFeed(xml);
      expect(feed.type).toBe('atom');
      expect(feed.title).toBe('无 XML 声明');
    });
  });

  // ── HTML 实体处理 ──

  describe('HTML 实体解码', () => {
    it('应解码 &amp; &lt; &gt; &quot;', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Entity Test</title>
    <item>
      <title>A &amp; B &lt;C&gt; &quot;D&quot;</title>
      <description>内容</description>
      <guid>entity-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.title).toBe('A & B <C> "D"');
    });

    it('应解码 &#39; 和 &apos;', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>It&#39;s &apos;fine&apos;</title>
      <description>内容</description>
      <guid>apos-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.title).toBe("It's 'fine'");
    });

    it('应解码数字字符引用 &#NNN; 和 &#xHH;', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>&#65;&#66;&#x43;</title>
      <description>内容</description>
      <guid>num-ref-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.title).toBe('ABC');
    });
  });

  // ── HTML 标签剥离 ──

  describe('HTML 标签剥离', () => {
    it('应移除 HTML 标签并保留文本', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>测试</title>
      <description>&lt;p&gt;段落一&lt;/p&gt;&lt;p&gt;段落二&lt;/p&gt;</description>
      <guid>strip-1</guid>
    </item>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items[0]!.content).not.toContain('<p>');
      expect(feed.items[0]!.content).toContain('段落一');
      expect(feed.items[0]!.content).toContain('段落二');
    });
  });

  // ── 边界情况 ──

  describe('边界情况', () => {
    it('空 channel 应返回空 items', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>空频道</title>
  </channel>
</rss>`;

      const feed = parseFeed(xml);
      expect(feed.items).toEqual([]);
      expect(feed.title).toBe('空频道');
    });

    it('空 Atom feed 应返回空 items', () => {
      const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
  <title>空 Atom</title>
</feed>`;

      const feed = parseFeed(xml);
      expect(feed.items).toEqual([]);
    });

    it('带空白的 XML 应正确处理', () => {
      const xml = `
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Whitespace Test</title>
    <item>
      <title>条目</title>
      <description>内容</description>
      <guid>ws-1</guid>
    </item>
  </channel>
</rss>  `;

      const feed = parseFeed(xml);
      expect(feed.items).toHaveLength(1);
    });
  });
});
