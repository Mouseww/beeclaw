// ============================================================================
// RedditAdapter — Reddit 数据源适配器
// 基于 Reddit API，OAuth2 (client_credentials) 认证
// ============================================================================

import type {
  DataSourceAdapter,
  DataSourceType,
  RedditAdapterConfig,
  RedditSubredditConfig,
  RedditListingResponse,
  RedditPost,
  IngestedEvent,
  SourceHealthMetrics,
} from './types.js';

/** 默认配置 */
const DEFAULTS = {
  pollIntervalMs: 120_000,
  postsPerSubreddit: 10,
  fetchComments: false,
  enabled: true,
} as const;

/** Reddit OAuth2 Token endpoint */
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
/** Reddit OAuth API base */
const REDDIT_API_BASE = 'https://oauth.reddit.com';

/** 限流配置：每分钟最多 60 次请求 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

/** OAuth2 Token 缓存 */
interface OAuthToken {
  access_token: string;
  expires_at: number;
}

export class RedditAdapter implements DataSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: DataSourceType = 'reddit';

  private config: RedditAdapterConfig;
  private running = false;
  private currentTick = 0;
  private timer?: ReturnType<typeof setInterval>;
  private startTime?: Date;

  // OAuth2 Token
  private token: OAuthToken | null = null;

  // 限流追踪
  private requestTimestamps: number[] = [];

  // 每个 subreddit 的 "after" 指针（用于增量获取）
  private lastSeenNames: Map<string, string> = new Map();

  // 健康指标
  private consecutiveErrors = 0;
  private totalErrors = 0;
  private totalSuccesses = 0;
  private eventsEmitted = 0;
  private lastLatencyMs = 0;
  private latencySum = 0;
  private latencyCount = 0;
  private lastSuccessTime: Date | null = null;
  private lastErrorTime: Date | null = null;
  private lastErrorMessage: string | null = null;

  /** 允许注入自定义 fetch（用于测试） */
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;

  /** 允许注入自定义延迟函数（用于测试时跳过重试等待） */
  delayFn: (ms: number) => Promise<void>;

  constructor(config: RedditAdapterConfig) {
    this.config = {
      ...config,
      enabled: config.enabled ?? DEFAULTS.enabled,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
      postsPerSubreddit: config.postsPerSubreddit ?? DEFAULTS.postsPerSubreddit,
      fetchComments: config.fetchComments ?? DEFAULTS.fetchComments,
    };
    this.id = this.config.id;
    this.name = this.config.name;
    this.fetchFn = globalThis.fetch.bind(globalThis);
    this.delayFn = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  }

  /** 获取配置（隐藏密钥） */
  getConfig(): Omit<RedditAdapterConfig, 'clientSecret'> & { clientSecret: string } {
    return {
      ...this.config,
      clientSecret: '***REDACTED***',
    };
  }

  start(): void {
    if (this.running) return;
    if (!this.config.enabled) return;

    this.running = true;
    this.startTime = new Date();
    const intervalMs = this.config.pollIntervalMs!;
    console.log(
      `[RedditAdapter] 启动: "${this.name}" ` +
      `(${this.config.subreddits.length} 个 subreddit, 间隔 ${intervalMs}ms)`,
    );

    this.poll().catch(err => {
      console.error(`[RedditAdapter] 初始轮询失败 (${this.name}):`, err);
    });

    this.timer = setInterval(() => {
      this.poll().catch(err => {
        console.error(`[RedditAdapter] 轮询失败 (${this.name}):`, err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
    this.token = null;
    console.log(`[RedditAdapter] 已停止: "${this.name}"`);
  }

  async poll(): Promise<IngestedEvent[]> {
    const startMs = Date.now();
    try {
      // 确保有有效的 OAuth token
      await this.ensureToken();

      const events: IngestedEvent[] = [];

      for (const subreddit of this.config.subreddits) {
        if (!this.checkRateLimit()) {
          console.warn(`[RedditAdapter] "${this.name}" 已达限流上限，跳过 r/${subreddit.name}`);
          continue;
        }

        const posts = await this.fetchSubredditPosts(subreddit);
        for (const post of posts) {
          events.push(this.toIngestedEvent(post, subreddit));
        }
      }

      const latency = Date.now() - startMs;
      this.lastLatencyMs = latency;
      this.latencySum += latency;
      this.latencyCount++;
      this.consecutiveErrors = 0;
      this.totalSuccesses++;
      this.lastSuccessTime = new Date();
      this.lastErrorMessage = null;
      this.eventsEmitted += events.length;

      if (events.length > 0) {
        console.log(`[RedditAdapter] "${this.name}" — 产出 ${events.length} 个事件`);
      }

      return events;
    } catch (error) {
      const latency = Date.now() - startMs;
      this.lastLatencyMs = latency;
      this.latencySum += latency;
      this.latencyCount++;
      this.consecutiveErrors++;
      this.totalErrors++;
      this.lastErrorTime = new Date();
      this.lastErrorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RedditAdapter] "${this.name}" 轮询失败: ${this.lastErrorMessage}`);
      return [];
    }
  }

  getHealthMetrics(): SourceHealthMetrics {
    const total = this.totalSuccesses + this.totalErrors;
    return {
      sourceId: this.id,
      connected: this.consecutiveErrors === 0 && this.totalSuccesses > 0,
      consecutiveErrors: this.consecutiveErrors,
      totalErrors: this.totalErrors,
      totalSuccesses: this.totalSuccesses,
      errorRate: total > 0 ? this.totalErrors / total : 0,
      lastLatencyMs: this.lastLatencyMs,
      averageLatencyMs: this.latencyCount > 0 ? Math.round(this.latencySum / this.latencyCount) : 0,
      lastSuccessTime: this.lastSuccessTime,
      lastErrorTime: this.lastErrorTime,
      lastErrorMessage: this.lastErrorMessage,
      eventsEmitted: this.eventsEmitted,
      uptimeMs: this.startTime ? Date.now() - this.startTime.getTime() : 0,
    };
  }

  setCurrentTick(tick: number): void {
    this.currentTick = tick;
  }

  // ── 内部方法 ──

  /**
   * 限流检查：滑动窗口
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < RATE_LIMIT_WINDOW_MS,
    );
    return this.requestTimestamps.length < RATE_LIMIT_MAX_REQUESTS;
  }

  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * 获取或刷新 OAuth2 Token（client_credentials 模式）
   */
  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() < this.token.expires_at - 60_000) {
      return; // Token 仍有效（提前 1 分钟刷新）
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await this.fetchFn(REDDIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `BeeClaw/1.0.0 RedditAdapter (by ${this.config.username ?? 'beeclaw'})`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Reddit OAuth2 认证失败: HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    this.token = {
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };
  }

  /**
   * 获取指定 subreddit 的帖子
   */
  private async fetchSubredditPosts(
    subreddit: RedditSubredditConfig,
    retries = 3,
  ): Promise<RedditPost[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const limit = Math.min(this.config.postsPerSubreddit!, 100);
        const url = `${REDDIT_API_BASE}/r/${encodeURIComponent(subreddit.name)}/${subreddit.sort}?limit=${limit}&raw_json=1`;

        this.recordRequest();
        const response = await this.fetchFn(url, {
          headers: {
            'Authorization': `Bearer ${this.token!.access_token}`,
            'User-Agent': `BeeClaw/1.0.0 RedditAdapter (by ${this.config.username ?? 'beeclaw'})`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        // 处理 429 限流
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
          console.warn(`[RedditAdapter] 限流 429 (r/${subreddit.name})，等待 ${waitMs}ms`);
          await this.delayFn(Math.min(waitMs, 120_000));
          continue;
        }

        // 处理 401 (token 过期)
        if (response.status === 401) {
          this.token = null;
          await this.ensureToken();
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as RedditListingResponse;
        const posts = data.data.children
          .filter(child => child.kind === 't3')
          .map(child => child.data);

        // 过滤掉已见过的帖子
        const lastSeenName = this.lastSeenNames.get(subreddit.name);
        let newPosts = posts;
        if (lastSeenName) {
          const idx = posts.findIndex(p => p.name === lastSeenName);
          if (idx >= 0) {
            newPosts = posts.slice(0, idx);
          }
        }

        // 更新最新帖子标记
        if (posts.length > 0) {
          this.lastSeenNames.set(subreddit.name, posts[0]!.name);
        }

        return newPosts;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
          await this.delayFn(delayMs);
        }
      }
    }

    throw lastError!;
  }

  /**
   * 将 RedditPost 转为标准化 IngestedEvent
   */
  private toIngestedEvent(post: RedditPost, subreddit: RedditSubredditConfig): IngestedEvent {
    // 基于热度计算重要性
    const score = post.score;
    let importance: number;
    if (score >= 10000) importance = 0.95;
    else if (score >= 1000) importance = 0.8;
    else if (score >= 100) importance = 0.6;
    else if (score >= 10) importance = 0.4;
    else importance = 0.25;

    // 评论数也参考
    if (post.num_comments >= 500) importance = Math.min(1, importance + 0.1);
    else if (post.num_comments >= 100) importance = Math.min(1, importance + 0.05);

    const title = post.title;
    const contentParts: string[] = [];

    if (post.selftext) {
      contentParts.push(post.selftext.slice(0, 1000));
    }

    contentParts.push(`来源: r/${post.subreddit}`);
    contentParts.push(`作者: u/${post.author}`);
    contentParts.push(`分数: ${post.score} (${(post.upvote_ratio * 100).toFixed(0)}% upvoted)`);
    contentParts.push(`评论: ${post.num_comments}`);
    contentParts.push(`链接: https://reddit.com${post.permalink}`);

    if (post.link_flair_text) {
      contentParts.push(`Flair: ${post.link_flair_text}`);
    }

    const createdDate = new Date(post.created_utc * 1000);
    contentParts.push(`发布时间: ${createdDate.toISOString()}`);

    const tags = [
      'reddit',
      `r/${post.subreddit}`,
      ...(subreddit.tags ?? []),
    ];
    if (post.link_flair_text) tags.push(post.link_flair_text);
    if (score >= 1000) tags.push('热门');
    if (post.num_comments >= 100) tags.push('高讨论');

    return {
      title,
      content: contentParts.join('\n'),
      category: subreddit.category,
      source: `reddit:${this.id}`,
      importance,
      propagationRadius: Math.min(0.8, importance * 0.65),
      tags: [...new Set(tags)],
      deduplicationId: `reddit:${post.name}`,
    };
  }
}
