// ============================================================================
// NewsApiAdapter 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewsApiAdapter } from './NewsApiAdapter.js';
import type {
  NewsApiAdapterConfig,
  NewsApiResponse,
  NewsApiArticle,
  IngestedEvent,
} from './types.js';

// ── 测试工具 ──

function createConfig(overrides?: Partial<NewsApiAdapterConfig>): NewsApiAdapterConfig {
  return {
    id: 'newsapi-test',
    name: 'NewsAPI Test',
    apiKey: 'test-api-key-xxx',
    queries: [
      { q: 'artificial intelligence', category: 'tech', tags: ['ai'] },
      { q: '经济 OR 央行', category: 'finance', tags: ['macro'] },
    ],
    pollIntervalMs: 900_000,
    pageSize: 10,
    language: 'en',
    sortBy: 'publishedAt',
    enabled: true,
    ...overrides,
  };
}

function createArticle(index: number): NewsApiArticle {
  return {
    source: {
      id: index % 2 === 0 ? 'bbc-news' : 'techcrunch',
      name: index % 2 === 0 ? 'BBC News' : 'TechCrunch',
    },
    author: `Author ${index}`,
    title: `重大 AI 突破：全新模型性能提升 ${index * 10}% 并且超越了之前所有的基准测试`,
    description: `这是关于 AI 突破的详细描述 #${index}，央行决策对科技行业产生深远影响。`,
    url: `https://example.com/article-${index}`,
    urlToImage: `https://example.com/image-${index}.jpg`,
    publishedAt: new Date(Date.now() - index * 3600_000).toISOString(),
    content: `文章完整内容 #${index}。这篇报道详细分析了 AI 技术的最新进展，以及这些突破性如何改变我们的生活方式。 [+1500 chars]`,
  };
}

function createApiResponse(articles: NewsApiArticle[]): NewsApiResponse {
  return {
    status: 'ok',
    totalResults: articles.length,
    articles,
  };
}

function mockFetchOk(response: NewsApiResponse): (url: string, init?: RequestInit) => Promise<Response> {
  return async (_url: string, _init?: RequestInit) => {
    return {
      ok: true, status: 200, statusText: 'OK',
      json: async () => response,
      headers: new Headers(),
    } as Response;
  };
}

// ── 测试 ──

describe('NewsApiAdapter', () => {
  let adapter: NewsApiAdapter;
  const noDelay = async (_ms: number) => {};

  beforeEach(() => {
    adapter = new NewsApiAdapter(createConfig());
    adapter.delayFn = noDelay;
  });

  afterEach(() => {
    adapter.stop();
  });

  describe('构造与基本属性', () => {
    it('应正确设置 id/name/type', () => {
      expect(adapter.id).toBe('newsapi-test');
      expect(adapter.name).toBe('NewsAPI Test');
      expect(adapter.type).toBe('newsapi');
    });

    it('默认配置应生效', () => {
      const minimal = new NewsApiAdapter({
        id: 'min',
        name: 'Min',
        apiKey: 'key',
        queries: [{ q: 'test', category: 'general' }],
      });
      const config = minimal.getConfig();
      expect(config.pollIntervalMs).toBe(900_000);
      expect(config.pageSize).toBe(10);
      expect(config.sortBy).toBe('publishedAt');
      expect(config.enabled).toBe(true);
    });

    it('getConfig 应隐藏 apiKey', () => {
      const config = adapter.getConfig();
      expect(config.apiKey).toBe('***REDACTED***');
    });
  });

  describe('DataSourceAdapter 接口', () => {
    it('应实现 setCurrentTick', () => {
      adapter.setCurrentTick(77);
    });

    it('应实现 getHealthMetrics 并返回初始值', () => {
      const metrics = adapter.getHealthMetrics();
      expect(metrics.sourceId).toBe('newsapi-test');
      expect(metrics.connected).toBe(false);
      expect(metrics.consecutiveErrors).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.totalSuccesses).toBe(0);
      expect(metrics.eventsEmitted).toBe(0);
      expect(metrics.uptimeMs).toBe(0);
    });
  });

  describe('poll()', () => {
    it('应返回标准化的 IngestedEvent 列表', async () => {
      const articles = [createArticle(1), createArticle(2)];
      adapter.fetchFn = mockFetchOk(createApiResponse(articles));

      const events = await adapter.poll();
      // 2 个查询 × 2 篇文章 = 4 事件
      expect(events.length).toBe(4);

      const first = events[0]!;
      expect(first.title).toContain('AI');
      expect(first.content).toContain('来源:');
      expect(first.category).toBe('tech');
      expect(first.source).toBe('newsapi:newsapi-test');
      expect(first.importance).toBeGreaterThan(0);
      expect(first.propagationRadius).toBeGreaterThan(0);
      expect(first.tags).toContain('news');
      expect(first.deduplicationId).toMatch(/^newsapi:/);
    });

    it('成功轮询后应更新健康指标', async () => {
      adapter.fetchFn = mockFetchOk(createApiResponse([createArticle(1)]));
      await adapter.poll();

      const metrics = adapter.getHealthMetrics();
      expect(metrics.connected).toBe(true);
      expect(metrics.totalSuccesses).toBe(1);
      expect(metrics.consecutiveErrors).toBe(0);
      expect(metrics.lastSuccessTime).toBeInstanceOf(Date);
      expect(metrics.lastErrorMessage).toBeNull();
      expect(metrics.eventsEmitted).toBe(2); // 2 个查询 × 1 篇
    });

    it('失败轮询后应更新错误指标', async () => {
      adapter.fetchFn = async () => { throw new Error('DNS Lookup Failed'); };

      const events = await adapter.poll();
      expect(events).toEqual([]);

      const metrics = adapter.getHealthMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.consecutiveErrors).toBe(1);
      expect(metrics.lastErrorMessage).toBe('DNS Lookup Failed');
    });

    it('空结果不应抛出', async () => {
      adapter.fetchFn = mockFetchOk({ status: 'ok', totalResults: 0, articles: [] });
      const events = await adapter.poll();
      expect(events).toEqual([]);
    });

    it('API 错误响应应记录错误', async () => {
      adapter.fetchFn = mockFetchOk({
        status: 'error',
        totalResults: 0,
        articles: [],
        code: 'rateLimited',
        message: 'Rate limit exceeded',
      });

      const events = await adapter.poll();
      expect(events).toEqual([]);

      const metrics = adapter.getHealthMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.lastErrorMessage).toContain('Rate limit');
    });
  });

  describe('重试机制', () => {
    it('HTTP 失败应重试最多 3 次', async () => {
      let attempts = 0;
      adapter.fetchFn = async () => {
        attempts++;
        if (attempts < 3) {
          return { ok: false, status: 500, statusText: 'Server Error', headers: new Headers() } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createApiResponse([createArticle(1)]),
          headers: new Headers(),
        } as Response;
      };

      const events = await adapter.poll();
      expect(attempts).toBeGreaterThanOrEqual(3);
      expect(events.length).toBeGreaterThan(0);
    });

    it('429 限流响应应等待后重试', async () => {
      // 使用单查询适配器以精确计数
      const singleAdapter = new NewsApiAdapter(createConfig({
        queries: [{ q: 'AI', category: 'tech' }],
      }));
      singleAdapter.delayFn = noDelay;

      let attempts = 0;
      singleAdapter.fetchFn = async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false, status: 429, statusText: 'Too Many Requests',
            headers: new Headers(),
          } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createApiResponse([createArticle(1)]),
          headers: new Headers(),
        } as Response;
      };

      const events = await singleAdapter.poll();
      expect(attempts).toBe(2);
      expect(events.length).toBeGreaterThan(0);
      singleAdapter.stop();
    });
  });

  describe('限流控制', () => {
    it('超过限流上限应跳过查询', async () => {
      const manyQueries = new NewsApiAdapter(createConfig({
        queries: Array.from({ length: 20 }, (_, i) => ({
          q: `query-${i}`,
          category: 'general' as const,
        })),
      }));
      manyQueries.delayFn = noDelay;

      let fetchCount = 0;
      manyQueries.fetchFn = async () => {
        fetchCount++;
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createApiResponse([]),
          headers: new Headers(),
        } as Response;
      };

      await manyQueries.poll();
      // 限制为每分钟 10 次
      expect(fetchCount).toBeLessThanOrEqual(10);
      manyQueries.stop();
    });
  });

  describe('重要性评估', () => {
    it('来自权威媒体的文章应有更高重要性', async () => {
      const bbcArticle = createArticle(2); // BBC News (index 偶数)
      const techArticle = createArticle(1); // TechCrunch (index 奇数)

      // 分别测试两种来源
      adapter.fetchFn = mockFetchOk(createApiResponse([bbcArticle]));
      const bbcEvents = await adapter.poll();

      const adapter2 = new NewsApiAdapter(createConfig());
      adapter2.delayFn = noDelay;
      adapter2.fetchFn = mockFetchOk(createApiResponse([techArticle]));
      const techEvents = await adapter2.poll();

      const bbcEvent = bbcEvents[0]!;
      const techEvent = techEvents[0]!;

      // BBC 应该有权威媒体标签和更高分数
      expect(bbcEvent.tags).toContain('权威媒体');
      expect(bbcEvent.importance).toBeGreaterThanOrEqual(techEvent.importance);

      adapter2.stop();
    });

    it('包含高重要性关键词的文章应有更高重要性', async () => {
      const importantArticle: NewsApiArticle = {
        ...createArticle(1),
        title: '央行宣布紧急加息，市场暴跌',
        description: '全球央行联合行动，紧急加息应对通胀危机。',
      };

      const normalArticle: NewsApiArticle = {
        ...createArticle(2),
        title: '新手机发布评测',
        description: '最新款手机的性能测试结果。',
      };

      adapter.fetchFn = mockFetchOk(createApiResponse([importantArticle, normalArticle]));
      const events = await adapter.poll();

      // 找到重要文章事件
      const importantEvent = events.find(e => e.title.includes('央行'));
      const normalEvent = events.find(e => e.title.includes('手机'));

      expect(importantEvent).toBeTruthy();
      expect(normalEvent).toBeTruthy();
      expect(importantEvent!.importance).toBeGreaterThan(normalEvent!.importance);
    });
  });

  describe('URL 参数构建', () => {
    it('应正确传递 API Key、语言、排序参数', async () => {
      let capturedUrl = '';
      adapter.fetchFn = async (url: string) => {
        capturedUrl = url;
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createApiResponse([]),
          headers: new Headers(),
        } as Response;
      };

      await adapter.poll();

      expect(capturedUrl).toContain('apiKey=test-api-key-xxx');
      expect(capturedUrl).toContain('language=en');
      expect(capturedUrl).toContain('sortBy=publishedAt');
      expect(capturedUrl).toContain('pageSize=10');
    });

    it('应支持 sources 和 domains 参数', async () => {
      const adapterWithSources = new NewsApiAdapter(createConfig({
        queries: [{
          q: 'AI',
          category: 'tech',
          sources: 'bbc-news,cnn',
          domains: 'bbc.co.uk',
        }],
      }));
      adapterWithSources.delayFn = noDelay;

      let capturedUrl = '';
      adapterWithSources.fetchFn = async (url: string) => {
        capturedUrl = url;
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createApiResponse([]),
          headers: new Headers(),
        } as Response;
      };

      await adapterWithSources.poll();
      expect(capturedUrl).toContain('sources=bbc-news%2Ccnn');
      expect(capturedUrl).toContain('domains=bbc.co.uk');
      adapterWithSources.stop();
    });
  });

  describe('增量获取 (from 参数)', () => {
    it('第二次轮询应携带 from 参数', async () => {
      let capturedUrls: string[] = [];
      adapter.fetchFn = async (url: string) => {
        capturedUrls.push(url);
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createApiResponse([createArticle(1)]),
          headers: new Headers(),
        } as Response;
      };

      await adapter.poll();
      capturedUrls = [];
      await adapter.poll();

      // 第二次轮询应包含 from 参数
      for (const url of capturedUrls) {
        expect(url).toContain('from=');
      }
    });
  });

  describe('start/stop 生命周期', () => {
    it('start 后 stop 应正确清理', () => {
      adapter.fetchFn = mockFetchOk(createApiResponse([]));
      adapter.start();
      adapter.stop();
    });

    it('disabled 适配器不应启动', () => {
      const disabled = new NewsApiAdapter(createConfig({ enabled: false }));
      disabled.start();
      disabled.stop();
    });

    it('重复 start 应为幂等操作', () => {
      adapter.fetchFn = mockFetchOk(createApiResponse([]));
      adapter.start();
      adapter.start();
      adapter.stop();
    });
  });

  describe('事件输出格式', () => {
    it('应包含来源、作者、链接信息', async () => {
      adapter.fetchFn = mockFetchOk(createApiResponse([createArticle(1)]));
      const events = await adapter.poll();

      const event = events[0]!;
      expect(event.content).toContain('来源: TechCrunch');
      expect(event.content).toContain('作者: Author 1');
      expect(event.content).toContain('链接: https://example.com/article-1');
      expect(event.content).toContain('发布时间:');
    });

    it('应清理 [+N chars] 截断标记', async () => {
      adapter.fetchFn = mockFetchOk(createApiResponse([createArticle(1)]));
      const events = await adapter.poll();

      const event = events[0]!;
      expect(event.content).not.toContain('[+1500 chars]');
    });

    it('deduplicationId 应基于 URL', async () => {
      adapter.fetchFn = mockFetchOk(createApiResponse([createArticle(1)]));
      const events = await adapter.poll();

      const event = events[0]!;
      expect(event.deduplicationId).toBe('newsapi:https://example.com/article-1');
    });

    it('权威媒体应有标签标记', async () => {
      const bbcArticle = createArticle(2); // BBC News
      adapter.fetchFn = mockFetchOk(createApiResponse([bbcArticle]));
      const events = await adapter.poll();

      const event = events[0]!;
      expect(event.tags).toContain('权威媒体');
      expect(event.tags).toContain('BBC News');
    });
  });

  describe('连续错误追踪', () => {
    it('连续失败应累加 consecutiveErrors', async () => {
      adapter.fetchFn = async () => { throw new Error('fail'); };

      await adapter.poll();
      expect(adapter.getHealthMetrics().consecutiveErrors).toBe(1);

      await adapter.poll();
      expect(adapter.getHealthMetrics().consecutiveErrors).toBe(2);

      await adapter.poll();
      expect(adapter.getHealthMetrics().consecutiveErrors).toBe(3);
    });

    it('一次成功应重置 consecutiveErrors', async () => {
      adapter.fetchFn = async () => { throw new Error('fail'); };
      await adapter.poll();
      await adapter.poll();
      expect(adapter.getHealthMetrics().consecutiveErrors).toBe(2);

      adapter.fetchFn = mockFetchOk(createApiResponse([]));
      await adapter.poll();
      expect(adapter.getHealthMetrics().consecutiveErrors).toBe(0);
    });

    it('错误率计算应正确', async () => {
      // 1 次成功 + 1 次失败 = 50%
      adapter.fetchFn = mockFetchOk(createApiResponse([]));
      await adapter.poll();

      adapter.fetchFn = async () => { throw new Error('fail'); };
      await adapter.poll();

      const metrics = adapter.getHealthMetrics();
      expect(metrics.errorRate).toBe(0.5);
    });
  });
});
