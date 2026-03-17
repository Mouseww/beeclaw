// ============================================================================
// RedditAdapter 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedditAdapter } from './RedditAdapter.js';
import type {
  RedditAdapterConfig,
  RedditListingResponse,
  RedditPost,
  IngestedEvent,
} from './types.js';

// ── 测试工具 ──

function createConfig(overrides?: Partial<RedditAdapterConfig>): RedditAdapterConfig {
  return {
    id: 'reddit-test',
    name: 'Reddit Test',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    username: 'beeclaw-bot',
    subreddits: [
      { name: 'technology', sort: 'hot', category: 'tech', tags: ['tech'] },
      { name: 'worldnews', sort: 'new', category: 'politics', tags: ['news'] },
    ],
    pollIntervalMs: 120_000,
    postsPerSubreddit: 10,
    fetchComments: false,
    enabled: true,
    ...overrides,
  };
}

function createPost(index: number, subreddit: string = 'technology'): RedditPost {
  return {
    name: `t3_post${index}`,
    title: `这是一个关于 AI 技术的热门帖子 #${index}`,
    selftext: `帖子内容详情 #${index}，讨论了人工智能的最新进展和社会影响。`,
    author: `user_${index}`,
    subreddit,
    created_utc: Math.floor(Date.now() / 1000) - index * 3600,
    score: (10 - index) * 500,
    num_comments: (10 - index) * 50,
    url: `https://reddit.com/r/${subreddit}/comments/post${index}`,
    permalink: `/r/${subreddit}/comments/post${index}/title/`,
    link_flair_text: index % 2 === 0 ? 'Discussion' : undefined,
    upvote_ratio: 0.85 + index * 0.01,
  };
}

function createListingResponse(posts: RedditPost[]): RedditListingResponse {
  return {
    kind: 'Listing',
    data: {
      after: posts.length > 0 ? posts[posts.length - 1]!.name : undefined,
      children: posts.map(p => ({ kind: 't3', data: p })),
    },
  };
}

function createOAuthResponse() {
  return {
    access_token: 'test-access-token-xxx',
    token_type: 'bearer',
    expires_in: 3600,
  };
}

// ── fetch mock 工厂 ──

function createMockFetch(posts: RedditPost[]) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    // OAuth Token 请求
    if (url.includes('access_token')) {
      return {
        ok: true, status: 200, statusText: 'OK',
        json: async () => createOAuthResponse(),
        headers: new Headers(),
      } as Response;
    }

    // Subreddit 帖子请求
    return {
      ok: true, status: 200, statusText: 'OK',
      json: async () => createListingResponse(posts),
      headers: new Headers(),
    } as Response;
  };
}

// ── 测试 ──

describe('RedditAdapter', () => {
  let adapter: RedditAdapter;
  const noDelay = async (_ms: number) => {};

  beforeEach(() => {
    adapter = new RedditAdapter(createConfig());
    adapter.delayFn = noDelay;
  });

  afterEach(() => {
    adapter.stop();
  });

  describe('构造与基本属性', () => {
    it('应正确设置 id/name/type', () => {
      expect(adapter.id).toBe('reddit-test');
      expect(adapter.name).toBe('Reddit Test');
      expect(adapter.type).toBe('reddit');
    });

    it('默认配置应生效', () => {
      const minimal = new RedditAdapter({
        id: 'min',
        name: 'Min',
        clientId: 'id',
        clientSecret: 'secret',
        subreddits: [{ name: 'test', sort: 'hot', category: 'general' }],
      });
      const config = minimal.getConfig();
      expect(config.pollIntervalMs).toBe(120_000);
      expect(config.postsPerSubreddit).toBe(10);
      expect(config.fetchComments).toBe(false);
      expect(config.enabled).toBe(true);
    });

    it('getConfig 应隐藏 clientSecret', () => {
      const config = adapter.getConfig();
      expect(config.clientSecret).toBe('***REDACTED***');
      expect(config.clientId).toBe('test-client-id');
    });
  });

  describe('DataSourceAdapter 接口', () => {
    it('应实现 setCurrentTick', () => {
      adapter.setCurrentTick(100);
    });

    it('应实现 getHealthMetrics 并返回初始值', () => {
      const metrics = adapter.getHealthMetrics();
      expect(metrics.sourceId).toBe('reddit-test');
      expect(metrics.connected).toBe(false);
      expect(metrics.consecutiveErrors).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.totalSuccesses).toBe(0);
      expect(metrics.eventsEmitted).toBe(0);
      expect(metrics.uptimeMs).toBe(0);
    });
  });

  describe('OAuth2 认证', () => {
    it('应在 poll 前获取 OAuth token', async () => {
      let tokenRequested = false;

      adapter.fetchFn = async (url: string, init?: RequestInit) => {
        if (url.includes('access_token')) {
          tokenRequested = true;
          expect(init?.method).toBe('POST');
          expect(init?.body).toBe('grant_type=client_credentials');
          const authHeader = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
          expect(authHeader).toContain('Basic');
          return {
            ok: true, status: 200, statusText: 'OK',
            json: async () => createOAuthResponse(),
            headers: new Headers(),
          } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createListingResponse([]),
          headers: new Headers(),
        } as Response;
      };

      await adapter.poll();
      expect(tokenRequested).toBe(true);
    });

    it('OAuth 认证失败应返回空事件并记录错误', async () => {
      adapter.fetchFn = async (url: string) => {
        if (url.includes('access_token')) {
          return {
            ok: false, status: 401, statusText: 'Unauthorized',
            headers: new Headers(),
          } as Response;
        }
        throw new Error('Should not reach here');
      };

      const events = await adapter.poll();
      expect(events).toEqual([]);

      const metrics = adapter.getHealthMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.lastErrorMessage).toContain('OAuth2');
    });
  });

  describe('poll()', () => {
    it('应返回标准化的 IngestedEvent 列表', async () => {
      const posts = [createPost(1), createPost(2)];
      adapter.fetchFn = createMockFetch(posts);

      const events = await adapter.poll();
      // 2 个 subreddit × 2 帖子 = 4 事件
      expect(events.length).toBe(4);

      const first = events[0]!;
      expect(first.title).toContain('AI');
      expect(first.content).toContain('r/technology');
      expect(first.content).toContain('u/user_1');
      expect(first.source).toBe('reddit:reddit-test');
      expect(first.importance).toBeGreaterThan(0);
      expect(first.tags).toContain('reddit');
      expect(first.deduplicationId).toMatch(/^reddit:t3_/);
    });

    it('成功轮询后应更新健康指标', async () => {
      adapter.fetchFn = createMockFetch([createPost(1)]);
      await adapter.poll();

      const metrics = adapter.getHealthMetrics();
      expect(metrics.connected).toBe(true);
      expect(metrics.totalSuccesses).toBe(1);
      expect(metrics.consecutiveErrors).toBe(0);
      expect(metrics.lastSuccessTime).toBeInstanceOf(Date);
    });

    it('失败轮询后应更新错误指标', async () => {
      adapter.fetchFn = async () => { throw new Error('Connection refused'); };

      await adapter.poll();

      const metrics = adapter.getHealthMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.consecutiveErrors).toBe(1);
      expect(metrics.lastErrorMessage).toBe('Connection refused');
    });

    it('空 subreddit 帖子不应抛出', async () => {
      adapter.fetchFn = createMockFetch([]);
      const events = await adapter.poll();
      expect(events).toEqual([]);
    });
  });

  describe('重试机制', () => {
    it('HTTP 失败应重试最多 3 次', async () => {
      let tokenFetched = false;
      let attempts = 0;

      adapter.fetchFn = async (url: string) => {
        if (url.includes('access_token')) {
          tokenFetched = true;
          return {
            ok: true, status: 200, statusText: 'OK',
            json: async () => createOAuthResponse(),
            headers: new Headers(),
          } as Response;
        }

        attempts++;
        if (attempts < 3) {
          return { ok: false, status: 503, statusText: 'Service Unavailable', headers: new Headers() } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createListingResponse([createPost(1)]),
          headers: new Headers(),
        } as Response;
      };

      const events = await adapter.poll();
      expect(tokenFetched).toBe(true);
      expect(attempts).toBeGreaterThanOrEqual(3);
      expect(events.length).toBeGreaterThan(0);
    });

    it('429 限流响应应等待后重试', async () => {
      let attempts = 0;

      adapter.fetchFn = async (url: string) => {
        if (url.includes('access_token')) {
          return {
            ok: true, status: 200, statusText: 'OK',
            json: async () => createOAuthResponse(),
            headers: new Headers(),
          } as Response;
        }

        attempts++;
        if (attempts === 1) {
          return {
            ok: false, status: 429, statusText: 'Too Many Requests',
            headers: new Headers({ 'retry-after': '1' }),
          } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createListingResponse([createPost(1)]),
          headers: new Headers(),
        } as Response;
      };

      const events = await adapter.poll();
      expect(attempts).toBe(2);
      expect(events.length).toBeGreaterThan(0);
    });

    it('401 应刷新 token 后重试', async () => {
      let tokenFetchCount = 0;
      let subredditAttempts = 0;

      adapter.fetchFn = async (url: string) => {
        if (url.includes('access_token')) {
          tokenFetchCount++;
          return {
            ok: true, status: 200, statusText: 'OK',
            json: async () => createOAuthResponse(),
            headers: new Headers(),
          } as Response;
        }

        subredditAttempts++;
        if (subredditAttempts === 1) {
          return { ok: false, status: 401, statusText: 'Unauthorized', headers: new Headers() } as Response;
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => createListingResponse([createPost(1)]),
          headers: new Headers(),
        } as Response;
      };

      const events = await adapter.poll();
      expect(tokenFetchCount).toBeGreaterThanOrEqual(2); // 初始 + refresh
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('帖子分数到重要性映射', () => {
    it('高分帖子应产生高重要性', async () => {
      const hotPost = createPost(1);
      hotPost.score = 15000;
      hotPost.num_comments = 800;

      adapter.fetchFn = createMockFetch([hotPost]);
      const events = await adapter.poll();

      const event = events.find(e => e.deduplicationId === 'reddit:t3_post1');
      expect(event).toBeTruthy();
      // score 15000 >= 10000 → 0.95 + comments 800 >= 500 → +0.1 = capped at 1.0
      expect(event!.importance).toBeGreaterThanOrEqual(0.95);
      expect(event!.tags).toContain('热门');
      expect(event!.tags).toContain('高讨论');
    });

    it('低分帖子应产生低重要性', async () => {
      const lowPost = createPost(1);
      lowPost.score = 5;
      lowPost.num_comments = 2;

      adapter.fetchFn = createMockFetch([lowPost]);
      const events = await adapter.poll();

      const event = events.find(e => e.deduplicationId === 'reddit:t3_post1');
      expect(event!.importance).toBeLessThanOrEqual(0.4);
    });
  });

  describe('增量获取', () => {
    it('第二次轮询应过滤已见过的帖子', async () => {
      const posts = [createPost(1), createPost(2)];
      adapter.fetchFn = createMockFetch(posts);

      const first = await adapter.poll();
      const firstCount = first.length;

      // 第二次使用相同数据 — 应被过滤（lastSeenName 机制）
      const second = await adapter.poll();
      // 第一次看到 post1 标记为最新，第二次 posts 里第一个还是 post1
      // 所以 idx=0 → newPosts = posts.slice(0, 0) = []
      expect(second.length).toBe(0);
    });
  });

  describe('start/stop 生命周期', () => {
    it('start 后 stop 应正确清理', () => {
      adapter.fetchFn = createMockFetch([]);
      adapter.start();
      adapter.stop();
    });

    it('disabled 适配器不应启动', () => {
      const disabled = new RedditAdapter(createConfig({ enabled: false }));
      disabled.start();
      disabled.stop();
    });

    it('重复 start 应为幂等操作', () => {
      adapter.fetchFn = createMockFetch([]);
      adapter.start();
      adapter.start();
      adapter.stop();
    });

    it('stop 应清除 token', () => {
      adapter.fetchFn = createMockFetch([]);
      adapter.start();
      adapter.stop();
      // token 应被清除（内部状态）
    });
  });

  describe('事件输出格式', () => {
    it('应包含 subreddit、作者、分数、评论数信息', async () => {
      const post = createPost(1);
      adapter.fetchFn = createMockFetch([post]);

      const events = await adapter.poll();
      const event = events.find(e => e.deduplicationId === 'reddit:t3_post1')!;

      expect(event.content).toContain('r/technology');
      expect(event.content).toContain('u/user_1');
      expect(event.content).toContain('分数:');
      expect(event.content).toContain('评论:');
      expect(event.content).toContain('reddit.com');
    });

    it('有 flair 的帖子应包含 flair 标签', async () => {
      const post = createPost(2); // index 2, 有 flair
      adapter.fetchFn = createMockFetch([post]);

      const events = await adapter.poll();
      const event = events.find(e => e.deduplicationId === 'reddit:t3_post2')!;

      expect(event.content).toContain('Flair: Discussion');
      expect(event.tags).toContain('Discussion');
    });
  });
});
