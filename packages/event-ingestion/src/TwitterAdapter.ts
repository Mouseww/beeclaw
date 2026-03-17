// ============================================================================
// TwitterAdapter — Twitter/X 数据源适配器
// 基于 Twitter API v2 (Recent Search)，Bearer Token 认证
// ============================================================================

import type {
  DataSourceAdapter,
  DataSourceType,
  TwitterAdapterConfig,
  TwitterSearchQuery,
  TwitterSearchResponse,
  TwitterTweet,
  IngestedEvent,
  SourceHealthMetrics,
} from './types.js';

/** 默认配置 */
const DEFAULTS = {
  pollIntervalMs: 60_000,
  maxResultsPerQuery: 10,
  enabled: true,
} as const;

/** Twitter API v2 Recent Search endpoint */
const TWITTER_API_BASE = 'https://api.twitter.com/2';

/** 限流配置：每 15 分钟窗口最多请求数 */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 180;

export class TwitterAdapter implements DataSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: DataSourceType = 'twitter';

  private config: TwitterAdapterConfig;
  private running = false;
  private currentTick = 0;
  private timer?: ReturnType<typeof setInterval>;
  private startTime?: Date;

  // 限流追踪
  private requestTimestamps: number[] = [];

  // 每个查询的 since_id（用于只获取新推文）
  private sinceIds: Map<string, string> = new Map();

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

  constructor(config: TwitterAdapterConfig) {
    this.config = {
      ...config,
      enabled: config.enabled ?? DEFAULTS.enabled,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
      maxResultsPerQuery: config.maxResultsPerQuery ?? DEFAULTS.maxResultsPerQuery,
    };
    this.id = this.config.id;
    this.name = this.config.name;
    this.fetchFn = globalThis.fetch.bind(globalThis);
    this.delayFn = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  }

  /** 获取配置（隐藏 bearerToken） */
  getConfig(): Omit<TwitterAdapterConfig, 'bearerToken'> & { bearerToken: string } {
    return {
      ...this.config,
      bearerToken: '***REDACTED***',
    };
  }

  start(): void {
    if (this.running) return;
    if (!this.config.enabled) return;

    this.running = true;
    this.startTime = new Date();
    const intervalMs = this.config.pollIntervalMs!;
    console.log(
      `[TwitterAdapter] 启动: "${this.name}" ` +
      `(${this.config.queries.length} 个查询, 间隔 ${intervalMs}ms)`,
    );

    this.poll().catch(err => {
      console.error(`[TwitterAdapter] 初始轮询失败 (${this.name}):`, err);
    });

    this.timer = setInterval(() => {
      this.poll().catch(err => {
        console.error(`[TwitterAdapter] 轮询失败 (${this.name}):`, err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
    console.log(`[TwitterAdapter] 已停止: "${this.name}"`);
  }

  async poll(): Promise<IngestedEvent[]> {
    const startMs = Date.now();
    try {
      const events: IngestedEvent[] = [];

      for (const query of this.config.queries) {
        // 限流检查
        if (!this.checkRateLimit()) {
          console.warn(`[TwitterAdapter] "${this.name}" 已达限流上限，跳过查询: ${query.query}`);
          continue;
        }

        const tweets = await this.searchTweets(query);
        for (const tweet of tweets) {
          events.push(this.toIngestedEvent(tweet, query));
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
        console.log(`[TwitterAdapter] "${this.name}" — 产出 ${events.length} 个事件`);
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
      console.error(`[TwitterAdapter] "${this.name}" 轮询失败: ${this.lastErrorMessage}`);
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
   * 限流检查：滑动窗口，15分钟内最多 180 次请求
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    // 清理窗口外的时间戳
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < RATE_LIMIT_WINDOW_MS,
    );
    return this.requestTimestamps.length < RATE_LIMIT_MAX_REQUESTS;
  }

  /**
   * 记录一次请求时间戳
   */
  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * 调用 Twitter API v2 Recent Search
   */
  private async searchTweets(query: TwitterSearchQuery, retries = 3): Promise<TwitterTweet[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const params = new URLSearchParams({
          query: query.query,
          max_results: String(Math.min(this.config.maxResultsPerQuery!, 100)),
          'tweet.fields': 'created_at,author_id,public_metrics,source',
          expansions: 'author_id',
          'user.fields': 'name,username',
        });

        const sinceId = this.sinceIds.get(query.query);
        if (sinceId) {
          params.set('since_id', sinceId);
        }

        const url = `${TWITTER_API_BASE}/tweets/search/recent?${params.toString()}`;

        this.recordRequest();
        const response = await this.fetchFn(url, {
          headers: {
            'Authorization': `Bearer ${this.config.bearerToken}`,
            'User-Agent': 'BeeClaw/1.0.0 TwitterAdapter',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        // 处理 429 限流响应
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
          console.warn(`[TwitterAdapter] 限流 429，等待 ${waitMs}ms`);
          await this.delayFn(Math.min(waitMs, 120_000));
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as TwitterSearchResponse;

        // 处理 API 错误
        if (data.errors && data.errors.length > 0 && !data.data) {
          throw new Error(`Twitter API Error: ${data.errors[0]!.detail}`);
        }

        const tweets = data.data ?? [];

        // 更新 since_id（取最新推文的 ID）
        if (data.meta?.newest_id) {
          this.sinceIds.set(query.query, data.meta.newest_id);
        }

        // 附加用户信息
        const usersMap = new Map<string, { name: string; username: string }>();
        if (data.includes?.users) {
          for (const user of data.includes.users) {
            usersMap.set(user.id, { name: user.name, username: user.username });
          }
        }

        // 为每条推文附加用户名
        for (const tweet of tweets) {
          if (tweet.author_id && usersMap.has(tweet.author_id)) {
            const user = usersMap.get(tweet.author_id)!;
            (tweet as TwitterTweet & { _authorName?: string; _authorUsername?: string })._authorName = user.name;
            (tweet as TwitterTweet & { _authorUsername?: string })._authorUsername = user.username;
          }
        }

        return tweets;
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
   * 将 TwitterTweet 转为标准化 IngestedEvent
   */
  private toIngestedEvent(
    tweet: TwitterTweet & { _authorName?: string; _authorUsername?: string },
    query: TwitterSearchQuery,
  ): IngestedEvent {
    const metrics = tweet.public_metrics;
    const engagement = metrics
      ? metrics.retweet_count + metrics.like_count + metrics.reply_count + metrics.quote_count
      : 0;

    // 基于互动量计算重要性
    let importance: number;
    if (engagement >= 10000) importance = 0.95;
    else if (engagement >= 1000) importance = 0.8;
    else if (engagement >= 100) importance = 0.6;
    else if (engagement >= 10) importance = 0.4;
    else importance = 0.25;

    const authorInfo = tweet._authorUsername
      ? `@${tweet._authorUsername}${tweet._authorName ? ` (${tweet._authorName})` : ''}`
      : (tweet.author_id ?? 'unknown');

    const title = tweet.text.length > 80
      ? tweet.text.slice(0, 77) + '...'
      : tweet.text;

    const contentParts: string[] = [tweet.text];
    contentParts.push(`作者: ${authorInfo}`);
    if (tweet.created_at) contentParts.push(`发布时间: ${tweet.created_at}`);
    if (metrics) {
      contentParts.push(
        `互动: ${metrics.like_count} 赞 | ${metrics.retweet_count} 转发 | ` +
        `${metrics.reply_count} 回复 | ${metrics.quote_count} 引用`,
      );
    }

    const tags = ['twitter', ...(query.tags ?? [])];
    if (tweet._authorUsername) tags.push(`@${tweet._authorUsername}`);
    if (engagement >= 1000) tags.push('热门');
    if (metrics && metrics.retweet_count >= 100) tags.push('高转发');

    return {
      title,
      content: contentParts.join('\n'),
      category: query.category,
      source: `twitter:${this.id}`,
      importance,
      propagationRadius: Math.min(0.8, importance * 0.65),
      tags: [...new Set(tags)],
      deduplicationId: `twitter:${tweet.id}`,
    };
  }
}
