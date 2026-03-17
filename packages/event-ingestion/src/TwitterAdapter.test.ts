// ============================================================================
// TwitterAdapter 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwitterAdapter } from './TwitterAdapter.js';
import type {
  TwitterAdapterConfig,
  TwitterSearchResponse,
  IngestedEvent,
  SourceHealthMetrics,
} from './types.js';

// ── 测试工具 ──

function createConfig(overrides?: Partial<TwitterAdapterConfig>): TwitterAdapterConfig {
  return {
    id: 'twitter-test',
    name: 'Twitter Test',
    bearerToken: 'test-bearer-token-xxx',
    queries: [
      { query: 'AI OR 人工智能', category: 'tech', tags: ['ai'] },
      { query: '央行 OR 利率', category: 'finance', tags: ['macro'] },
    ],
    pollIntervalMs: 60_000,
    maxResultsPerQuery: 10,
    enabled: true,
    ...overrides,
  };
}

function createSearchResponse(tweets: number = 3): TwitterSearchResponse {
  const data = Array.from({ length: tweets }, (_, i) => ({
    id: `tweet-${i + 1}`,
    text: `这是一条关于 AI 人工智能的推文 #${i + 1}，讨论了很多有趣的话题`,
    created_at: new Date(Date.now() - i * 3600_000).toISOString(),
    author_id: `user-${i + 1}`,
    public_metrics: {
      retweet_count: (i + 1) * 100,
      reply_count: (i + 1) * 50,
      like_count: (i + 1) * 500,
      quote_count: (i + 1) * 20,
    },
    source: 'Twitter Web App',
  }));

  return {
    data,
    includes: {
      users: data.map((_, i) => ({
        id: `user-${i + 1}`,
        name: `Test User ${i + 1}`,
        username: `testuser${i + 1}`,
      })),
    },
    meta: {
      newest_id: data[0]?.id ?? '',
      oldest_id: data[data.length - 1]?.id ?? '',
      result_count: data.length,
    },
  };
}

function mockFetchOk(response: TwitterSearchResponse): (url: string, init?: RequestInit) => Promise<Response> {
  return async (_url: string, _init?: RequestInit) => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => response,
      headers: new Headers(),
    } as Response;
  };
}

function mockFetchError(status: number, statusText: string): (url: string, init?: RequestInit) => Promise<Response> {
  return async (_url: string, _init?: RequestInit) => {
    return {
      ok: false,
      status,
      statusText,
      headers: new Headers(),
    } as Response;
  };
}

// ── 测试 ──

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;
  const noDelay = async (_ms: number) => {};

  beforeEach(() => {
    adapter = new TwitterAdapter(createConfig());
    adapter.delayFn = noDelay;
  });

  afterEach(() => {
    adapter.stop();
  });

  describe('构造与基本属性', () => {
    it('应正确设置 id/name/type', () => {
      expect(adapter.id).toBe('twitter-test');
      expect(adapter.name).toBe('Twitter Test');
      expect(adapter.type).toBe('twitter');
    });

    it('默认配置应生效', () => {
      const minimal = new TwitterAdapter({
        id: 'min',
        name: 'Min',
        bearerToken: 'token',
        queries: [{ query: 'test', category: 'general' }],
      });
      const config = minimal.getConfig();
      expect(config.pollIntervalMs).toBe(60_000);
      expect(config.maxResultsPerQuery).toBe(10);
      expect(config.enabled).toBe(true);
    });

    it('getConfig 应隐藏 bearerToken', () => {
      const config = adapter.getConfig();
      expect(config.bearerToken).toBe('***REDACTED***');
    });
  });

  describe('DataSourceAdapter 接口', () => {
    it('应实现 setCurrentTick', () => {
      adapter.setCurrentTick(42);
      // 不应抛出
    });

    it('应实现 getHealthMetrics 并返回初始值', () => {
      const metrics = adapter.getHealthMetrics();
      expect(metrics.sourceId).toBe('twitter-test');
      expect(metrics.connected).toBe(false);
      expect(metrics.consecutiveErrors).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.totalSuccesses).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.eventsEmitted).toBe(0);
    });
  });

  describe('poll()', () => {
    it('应返回标准化的 IngestedEvent 列表', async () => {
      const response = createSearchResponse(2);
      adapter.fetchFn = mockFetchOk(response);

      const events = await adapter.poll();
      // 2 个查询 × 2 条推文 = 4 个事件
      expect(events.length).toBe(4);

      const first = events[0]!;
      expect(first.title).toBeTruthy();
      expect(first.content).toContain('AI');
      expect(first.category).toBe('tech');
      expect(first.source).toBe('twitter:twitter-test');
      expect(first.importance).toBeGreaterThan(0);
      expect(first.propagationRadius).toBeGreaterThan(0);
      expect(first.tags).toContain('twitter');
      expect(first.deduplicationId).toMatch(/^twitter:tweet-/);
    });

    it('成功轮询后应更新健康指标', async () => {
      adapter.fetchFn = mockFetchOk(createSearchResponse(1));
      await adapter.poll();

      const metrics = adapter.getHealthMetrics();
      expect(metrics.connected).toBe(true);
      expect(metrics.totalSuccesses).toBe(1);
      expect(metrics.consecutiveErrors).toBe(0);
      expect(metrics.lastSuccessTime).toBeInstanceOf(Date);
      expect(metrics.lastErrorMessage).toBeNull();
      expect(metrics.eventsEmitted).toBe(2); // 2 个查询 × 1 条推文
    });

    it('失败轮询后应更新错误指标', async () => {
      adapter.fetchFn = async () => { throw new Error('Network Error'); };

      const events = await adapter.poll();
      expect(events).toEqual([]);

      const metrics = adapter.getHealthMetrics();
      expect(metrics.connected).toBe(false);
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.consecutiveErrors).toBe(1);
      expect(metrics.lastErrorMessage).toBe('Network Error');
    });

    it('空结果不应抛出', async () => {
      adapter.fetchFn = mockFetchOk({ meta: { result_count: 0 } });

      const events = await adapter.poll();
      expect(events).toEqual([]);
    });

    it('API 错误响应应记录错误', async () => {
      adapter.fetchFn = mockFetchOk({
        errors: [{ title: 'Unauthorized', detail: 'Invalid token', type: 'auth' }],
      });

      const events = await adapter.poll();
      expect(events).toEqual([]);

      const metrics = adapter.getHealthMetrics();
      expect(metrics.totalErrors).toBe(1);
    });
  });

  describe('重试机制', () => {
    it('HTTP 失败应重试最多 3 次', async () => {
      // 使用单查询适配器以精确计数
      const singleAdapter = new TwitterAdapter(createConfig({
        queries: [{ query: 'test', category: 'tech' }],
      }));
      singleAdapter.delayFn = noDelay;

      let attempts = 0;
      singleAdapter.fetchFn = async () => {
        attempts++;
        if (attempts < 3) {
          return { ok: false, status: 500, statusText: 'Server Error', headers: new Headers() } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createSearchResponse(1),
          headers: new Headers(),
        } as Response;
      };

      const events = await singleAdapter.poll();
      expect(attempts).toBe(3);
      expect(events.length).toBe(1); // 1 个查询 × 1 条推文
      singleAdapter.stop();
    });

    it('429 限流响应应等待后重试', async () => {
      const singleAdapter = new TwitterAdapter(createConfig({
        queries: [{ query: 'test', category: 'tech' }],
      }));
      singleAdapter.delayFn = noDelay;

      let attempts = 0;
      singleAdapter.fetchFn = async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false, status: 429, statusText: 'Too Many Requests',
            headers: new Headers({ 'retry-after': '1' }),
          } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createSearchResponse(1),
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
      // 模拟大量请求填满限流窗口
      const manyQueriesAdapter = new TwitterAdapter(createConfig({
        queries: Array.from({ length: 200 }, (_, i) => ({
          query: `query-${i}`,
          category: 'general' as const,
        })),
      }));
      manyQueriesAdapter.delayFn = noDelay;

      let fetchCount = 0;
      manyQueriesAdapter.fetchFn = async () => {
        fetchCount++;
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createSearchResponse(0),
          headers: new Headers(),
        } as Response;
      };

      await manyQueriesAdapter.poll();
      // 应被限流，不会全部执行
      expect(fetchCount).toBeLessThanOrEqual(180);
      manyQueriesAdapter.stop();
    });
  });

  describe('互动量到重要性映射', () => {
    it('高互动量应产生高重要性', async () => {
      const response: TwitterSearchResponse = {
        data: [{
          id: 'viral-tweet',
          text: '重大 AI 突破消息',
          author_id: 'user-1',
          public_metrics: {
            retweet_count: 5000,
            reply_count: 3000,
            like_count: 20000,
            quote_count: 1000,
          },
        }],
        includes: {
          users: [{ id: 'user-1', name: 'Expert', username: 'expert' }],
        },
        meta: { newest_id: 'viral-tweet', result_count: 1 },
      };
      adapter.fetchFn = mockFetchOk(response);

      const events = await adapter.poll();
      // 总互动 29000 >= 10000 → importance = 0.95
      const viralEvent = events.find(e => e.deduplicationId === 'twitter:viral-tweet');
      expect(viralEvent).toBeTruthy();
      expect(viralEvent!.importance).toBe(0.95);
      expect(viralEvent!.tags).toContain('热门');
    });

    it('低互动量应产生低重要性', async () => {
      const response: TwitterSearchResponse = {
        data: [{
          id: 'quiet-tweet',
          text: '普通消息',
          public_metrics: {
            retweet_count: 1,
            reply_count: 0,
            like_count: 3,
            quote_count: 0,
          },
        }],
        meta: { newest_id: 'quiet-tweet', result_count: 1 },
      };
      adapter.fetchFn = mockFetchOk(response);

      const events = await adapter.poll();
      const quietEvent = events.find(e => e.deduplicationId === 'twitter:quiet-tweet');
      expect(quietEvent).toBeTruthy();
      expect(quietEvent!.importance).toBeLessThanOrEqual(0.4);
    });
  });

  describe('增量获取 (since_id)', () => {
    it('第二次轮询应携带 since_id 参数', async () => {
      let capturedUrls: string[] = [];
      adapter.fetchFn = async (url: string) => {
        capturedUrls.push(url);
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createSearchResponse(1),
          headers: new Headers(),
        } as Response;
      };

      await adapter.poll();
      capturedUrls = [];
      await adapter.poll();

      // 第二次轮询的 URL 应包含 since_id
      for (const url of capturedUrls) {
        expect(url).toContain('since_id=tweet-1');
      }
    });
  });

  describe('start/stop 生命周期', () => {
    it('start 后 stop 应正确清理', () => {
      adapter.fetchFn = mockFetchOk(createSearchResponse(0));
      adapter.start();
      adapter.stop();
      // 不应抛出
    });

    it('disabled 适配器不应启动', () => {
      const disabled = new TwitterAdapter(createConfig({ enabled: false }));
      disabled.start();
      // 不应启动轮询
      disabled.stop();
    });

    it('重复 start 应为幂等操作', () => {
      adapter.fetchFn = mockFetchOk(createSearchResponse(0));
      adapter.start();
      adapter.start(); // 不应创建多个定时器
      adapter.stop();
    });
  });

  describe('事件输出格式', () => {
    it('应包含作者信息和互动数据', async () => {
      adapter.fetchFn = mockFetchOk(createSearchResponse(1));
      const events = await adapter.poll();

      const event = events[0]!;
      expect(event.content).toContain('@testuser1');
      expect(event.content).toContain('赞');
      expect(event.content).toContain('转发');
      expect(event.content).toContain('回复');
    });

    it('长推文标题应被截断', async () => {
      const response: TwitterSearchResponse = {
        data: [{
          id: 'long-tweet',
          text: '这是一条非常非常非常长的推文'.repeat(10),
          public_metrics: { retweet_count: 0, reply_count: 0, like_count: 0, quote_count: 0 },
        }],
        meta: { newest_id: 'long-tweet', result_count: 1 },
      };
      adapter.fetchFn = mockFetchOk(response);

      const events = await adapter.poll();
      const event = events.find(e => e.deduplicationId === 'twitter:long-tweet');
      expect(event!.title.length).toBeLessThanOrEqual(80);
      expect(event!.title).toContain('...');
    });
  });
});
