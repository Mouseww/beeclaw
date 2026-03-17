// ============================================================================
// RssAdapter — RSS/Atom 数据源适配器
// 将现有 FeedParser + ImportanceEvaluator 逻辑包装为 DataSourceAdapter
// ============================================================================

import type {
  DataSourceAdapter,
  DataSourceType,
  FeedSource,
  FeedItem,
  IngestedEvent,
  SourceHealthMetrics,
} from './types.js';
import { parseFeed } from './FeedParser.js';
import { ImportanceEvaluator } from './ImportanceEvaluator.js';

/** RssAdapter 构造配置 */
export interface RssAdapterConfig {
  /** 数据源配置 */
  source: FeedSource;
  /** 高重要性关键词 */
  highImportanceKeywords?: string[];
  /** 中重要性关键词 */
  mediumImportanceKeywords?: string[];
  /** 每次轮询最多处理的新条目数 */
  maxItemsPerPoll?: number;
}

export class RssAdapter implements DataSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: DataSourceType = 'rss';

  private source: FeedSource;
  private evaluator: ImportanceEvaluator;
  private maxItemsPerPoll: number;
  private running = false;
  private currentTick = 0;
  private timer?: ReturnType<typeof setInterval>;
  private startTime?: Date;

  // 健康指标追踪
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

  constructor(config: RssAdapterConfig) {
    this.source = { ...config.source, enabled: config.source.enabled ?? true };
    this.id = this.source.id;
    this.name = this.source.name;
    this.evaluator = new ImportanceEvaluator(
      config.highImportanceKeywords,
      config.mediumImportanceKeywords,
    );
    this.maxItemsPerPoll = config.maxItemsPerPoll ?? 20;
    this.fetchFn = globalThis.fetch.bind(globalThis);
    this.delayFn = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  }

  /** 获取数据源配置 */
  getSource(): FeedSource {
    return { ...this.source };
  }

  start(): void {
    if (this.running) return;
    if (!this.source.enabled) return;

    this.running = true;
    this.startTime = new Date();
    const intervalMs = this.source.pollIntervalMs ?? 300_000;
    console.log(`[RssAdapter] 启动: "${this.name}" (${this.source.url}, 间隔 ${intervalMs}ms)`);

    // 立即执行一次
    this.poll().catch(err => {
      console.error(`[RssAdapter] 初始轮询失败 (${this.name}):`, err);
    });

    this.timer = setInterval(() => {
      this.poll().catch(err => {
        console.error(`[RssAdapter] 轮询失败 (${this.name}):`, err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
    console.log(`[RssAdapter] 已停止: "${this.name}"`);
  }

  async poll(): Promise<IngestedEvent[]> {
    const startMs = Date.now();
    try {
      const xml = await this.fetchFeed(this.source.url);
      const feed = parseFeed(xml);
      const latency = Date.now() - startMs;

      // 更新健康指标
      this.lastLatencyMs = latency;
      this.latencySum += latency;
      this.latencyCount++;
      this.consecutiveErrors = 0;
      this.totalSuccesses++;
      this.lastSuccessTime = new Date();
      this.lastErrorMessage = null;

      // 转换为标准化事件
      const events: IngestedEvent[] = [];
      const itemsToProcess = feed.items.slice(0, this.maxItemsPerPoll);

      for (const item of itemsToProcess) {
        events.push(this.toIngestedEvent(item));
      }

      this.eventsEmitted += events.length;

      if (events.length > 0) {
        console.log(`[RssAdapter] "${this.name}" — 产出 ${events.length} 个事件`);
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
      console.error(`[RssAdapter] "${this.name}" 轮询失败: ${this.lastErrorMessage}`);
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
   * 获取 Feed XML 内容（带指数退避重试）
   */
  private async fetchFeed(url: string, retries = 3): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.fetchFn(url, {
          headers: {
            'User-Agent': 'BeeClaw/1.0.0 RssAdapter',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          },
          signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        return response.text();
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
   * 将 FeedItem 转为标准化 IngestedEvent
   */
  private toIngestedEvent(item: FeedItem): IngestedEvent {
    const assessment = this.evaluator.evaluate(item);

    const contentParts: string[] = [item.content];
    if (item.author) contentParts.push(`来源作者: ${item.author}`);
    if (item.link) contentParts.push(`原文链接: ${item.link}`);
    if (item.pubDate) contentParts.push(`发布时间: ${item.pubDate.toISOString()}`);

    const tags = [...(this.source.tags ?? [])];
    if (item.categories) tags.push(...item.categories);
    if (assessment.matchedKeywords.length > 0) {
      tags.push(...assessment.matchedKeywords.slice(0, 5));
    }

    return {
      title: item.title,
      content: contentParts.join('\n'),
      category: this.source.category,
      source: `feed:${this.source.id}(${this.source.name})`,
      importance: assessment.importance,
      propagationRadius: assessment.propagationRadius,
      tags: [...new Set(tags)],
      deduplicationId: item.guid,
    };
  }
}
