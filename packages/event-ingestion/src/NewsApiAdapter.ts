// ============================================================================
// NewsApiAdapter — NewsAPI.org 数据源适配器
// 基于 NewsAPI.org Everything endpoint，API Key 认证
// ============================================================================

import type {
  DataSourceAdapter,
  DataSourceType,
  NewsApiAdapterConfig,
  NewsApiQuery,
  NewsApiResponse,
  NewsApiArticle,
  IngestedEvent,
  SourceHealthMetrics,
} from './types.js';
import { ImportanceEvaluator } from './ImportanceEvaluator.js';

/** 默认配置 */
const DEFAULTS = {
  pollIntervalMs: 900_000, // 15 分钟
  pageSize: 10,
  sortBy: 'publishedAt' as const,
  enabled: true,
} as const;

/** NewsAPI Everything endpoint */
const NEWSAPI_BASE = 'https://newsapi.org/v2';

/** 限流配置：免费版每天 100 次，付费版每天最多 250,000 次 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 分钟窗口
const RATE_LIMIT_MAX_REQUESTS = 10;      // 保守限制

export class NewsApiAdapter implements DataSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: DataSourceType = 'newsapi';

  private config: NewsApiAdapterConfig;
  private evaluator: ImportanceEvaluator;
  private running = false;
  private currentTick = 0;
  private timer?: ReturnType<typeof setInterval>;
  private startTime?: Date;

  // 限流追踪
  private requestTimestamps: number[] = [];

  // 每个查询的 "from" 时间戳（用于增量获取）
  private lastQueryTimes: Map<string, string> = new Map();

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

  constructor(config: NewsApiAdapterConfig) {
    this.config = {
      ...config,
      enabled: config.enabled ?? DEFAULTS.enabled,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
      pageSize: config.pageSize ?? DEFAULTS.pageSize,
      sortBy: config.sortBy ?? DEFAULTS.sortBy,
    };
    this.id = this.config.id;
    this.name = this.config.name;
    this.evaluator = new ImportanceEvaluator();
    this.fetchFn = globalThis.fetch.bind(globalThis);
    this.delayFn = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  }

  /** 获取配置（隐藏 API Key） */
  getConfig(): Omit<NewsApiAdapterConfig, 'apiKey'> & { apiKey: string } {
    return {
      ...this.config,
      apiKey: '***REDACTED***',
    };
  }

  start(): void {
    if (this.running) return;
    if (!this.config.enabled) return;

    this.running = true;
    this.startTime = new Date();
    const intervalMs = this.config.pollIntervalMs!;
    console.log(
      `[NewsApiAdapter] 启动: "${this.name}" ` +
      `(${this.config.queries.length} 个查询, 间隔 ${intervalMs}ms)`,
    );

    this.poll().catch(err => {
      console.error(`[NewsApiAdapter] 初始轮询失败 (${this.name}):`, err);
    });

    this.timer = setInterval(() => {
      this.poll().catch(err => {
        console.error(`[NewsApiAdapter] 轮询失败 (${this.name}):`, err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
    console.log(`[NewsApiAdapter] 已停止: "${this.name}"`);
  }

  async poll(): Promise<IngestedEvent[]> {
    const startMs = Date.now();
    try {
      const events: IngestedEvent[] = [];

      for (const query of this.config.queries) {
        if (!this.checkRateLimit()) {
          console.warn(`[NewsApiAdapter] "${this.name}" 已达限流上限，跳过查询: ${query.q}`);
          continue;
        }

        const articles = await this.searchArticles(query);
        for (const article of articles) {
          events.push(this.toIngestedEvent(article, query));
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
        console.log(`[NewsApiAdapter] "${this.name}" — 产出 ${events.length} 个事件`);
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
      console.error(`[NewsApiAdapter] "${this.name}" 轮询失败: ${this.lastErrorMessage}`);
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
   * 调用 NewsAPI Everything endpoint 搜索文章
   */
  private async searchArticles(query: NewsApiQuery, retries = 3): Promise<NewsApiArticle[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const params = new URLSearchParams({
          q: query.q,
          pageSize: String(Math.min(this.config.pageSize!, 100)),
          sortBy: this.config.sortBy!,
          apiKey: this.config.apiKey,
        });

        if (this.config.language) {
          params.set('language', this.config.language);
        }

        if (query.sources) {
          params.set('sources', query.sources);
        }

        if (query.domains) {
          params.set('domains', query.domains);
        }

        // 增量获取：使用上次查询时间作为 from 参数
        const lastTime = this.lastQueryTimes.get(query.q);
        if (lastTime) {
          params.set('from', lastTime);
        }

        const url = `${NEWSAPI_BASE}/everything?${params.toString()}`;

        this.recordRequest();
        const response = await this.fetchFn(url, {
          headers: {
            'User-Agent': 'BeeClaw/1.0.0 NewsApiAdapter',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        // 处理 429 限流
        if (response.status === 429) {
          console.warn(`[NewsApiAdapter] 限流 429，等待重试`);
          await this.delayFn(60_000);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as NewsApiResponse;

        if (data.status === 'error') {
          throw new Error(`NewsAPI Error: ${data.message ?? data.code ?? 'unknown'}`);
        }

        // 更新查询时间
        this.lastQueryTimes.set(query.q, new Date().toISOString());

        return data.articles ?? [];
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
   * 将 NewsApiArticle 转为标准化 IngestedEvent
   */
  private toIngestedEvent(article: NewsApiArticle, query: NewsApiQuery): IngestedEvent {
    // 使用 ImportanceEvaluator 评估重要性
    const assessment = this.evaluator.evaluate({
      title: article.title,
      content: article.description ?? article.content ?? '',
      guid: article.url,
      link: article.url,
      author: article.author ?? undefined,
      pubDate: article.publishedAt ? new Date(article.publishedAt) : undefined,
    });

    // 来自已知大型新闻源的文章给予额外权重
    const sourceName = article.source?.name?.toLowerCase() ?? '';
    const majorSources = ['bbc', 'cnn', 'reuters', 'associated press', 'bloomberg', 'wsj', 'nyt'];
    const isMajorSource = majorSources.some(s => sourceName.includes(s));
    const importance = isMajorSource
      ? Math.min(1, assessment.importance + 0.1)
      : assessment.importance;

    const contentParts: string[] = [];

    if (article.description) {
      contentParts.push(article.description);
    }
    if (article.content) {
      // NewsAPI content 常被截断为 200 字符
      const cleanContent = article.content.replace(/\[\+\d+ chars\]$/, '').trim();
      if (cleanContent && cleanContent !== article.description) {
        contentParts.push(cleanContent);
      }
    }

    contentParts.push(`来源: ${article.source?.name ?? 'unknown'}`);
    if (article.author) contentParts.push(`作者: ${article.author}`);
    contentParts.push(`链接: ${article.url}`);
    if (article.publishedAt) contentParts.push(`发布时间: ${article.publishedAt}`);

    const tags = [
      'news',
      ...(query.tags ?? []),
    ];
    if (article.source?.name) tags.push(article.source.name);
    if (isMajorSource) tags.push('权威媒体');
    if (assessment.matchedKeywords.length > 0) {
      tags.push(...assessment.matchedKeywords.slice(0, 5));
    }

    // 使用 URL 作为去重 ID（全球唯一）
    const deduplicationId = `newsapi:${article.url}`;

    return {
      title: article.title,
      content: contentParts.join('\n'),
      category: query.category,
      source: `newsapi:${this.id}`,
      importance,
      propagationRadius: assessment.propagationRadius,
      tags: [...new Set(tags)],
      deduplicationId,
    };
  }
}
