// ============================================================================
// EventIngestion — 外部事件自动接入模块
// 管理多个数据源，自动轮询 RSS/Atom Feed，将文章转为 WorldEvent 注入 EventBus
// ============================================================================

import type { EventCategory } from '@beeclaw/shared';
import type { EventBus } from '@beeclaw/event-bus';
import type { FeedSource, FeedItem, EventIngestionConfig, ParsedFeed } from './types.js';
import { parseFeed } from './FeedParser.js';
import { ImportanceEvaluator } from './ImportanceEvaluator.js';

/** 默认配置 */
const DEFAULTS = {
  pollIntervalMs: 300_000, // 5 分钟
  maxItemsPerPoll: 20,
  deduplicationCacheSize: 5000,
} as const;

/** 单个数据源的运行时状态 */
interface SourceState {
  source: FeedSource;
  timer?: ReturnType<typeof setInterval>;
  lastPollTime?: Date;
  lastError?: string;
  itemsFetched: number;
  eventsEmitted: number;
}

export class EventIngestion {
  private eventBus: EventBus;
  private sources: Map<string, SourceState> = new Map();
  private seenGuids: Set<string> = new Set();
  private maxCacheSize: number;
  private maxItemsPerPoll: number;
  private defaultPollIntervalMs: number;
  private evaluator: ImportanceEvaluator;
  private running = false;
  private currentTick = 0;

  constructor(eventBus: EventBus, config?: Partial<EventIngestionConfig>) {
    this.eventBus = eventBus;
    this.maxCacheSize = config?.deduplicationCacheSize ?? DEFAULTS.deduplicationCacheSize;
    this.maxItemsPerPoll = config?.maxItemsPerPoll ?? DEFAULTS.maxItemsPerPoll;
    this.defaultPollIntervalMs = config?.defaultPollIntervalMs ?? DEFAULTS.pollIntervalMs;
    this.evaluator = new ImportanceEvaluator(
      config?.highImportanceKeywords,
      config?.mediumImportanceKeywords,
    );

    // 注册初始数据源
    if (config?.sources) {
      for (const source of config.sources) {
        this.addSource(source);
      }
    }
  }

  /**
   * 添加一个数据源
   */
  addSource(source: FeedSource): void {
    if (this.sources.has(source.id)) {
      console.warn(`[EventIngestion] 数据源 "${source.id}" 已存在，将被覆盖`);
      this.removeSource(source.id);
    }

    const state: SourceState = {
      source: { ...source, enabled: source.enabled ?? true },
      itemsFetched: 0,
      eventsEmitted: 0,
    };

    this.sources.set(source.id, state);
    console.log(`[EventIngestion] 添加数据源: "${source.name}" (${source.url})`);

    // 如果已在运行中且该源启用，立即启动轮询
    if (this.running && state.source.enabled) {
      this.startSourcePolling(state);
    }
  }

  /**
   * 移除一个数据源
   */
  removeSource(sourceId: string): void {
    const state = this.sources.get(sourceId);
    if (!state) return;

    if (state.timer) {
      clearInterval(state.timer);
    }
    this.sources.delete(sourceId);
    console.log(`[EventIngestion] 移除数据源: "${sourceId}"`);
  }

  /**
   * 获取所有数据源状态
   */
  getSourceStates(): Array<{
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    lastPollTime?: Date;
    lastError?: string;
    itemsFetched: number;
    eventsEmitted: number;
  }> {
    return Array.from(this.sources.values()).map(s => ({
      id: s.source.id,
      name: s.source.name,
      url: s.source.url,
      enabled: s.source.enabled ?? true,
      lastPollTime: s.lastPollTime,
      lastError: s.lastError,
      itemsFetched: s.itemsFetched,
      eventsEmitted: s.eventsEmitted,
    }));
  }

  /**
   * 更新当前世界 tick（由 WorldEngine 调用）
   */
  setCurrentTick(tick: number): void {
    this.currentTick = tick;
  }

  /**
   * 启动所有数据源的自动轮询
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[EventIngestion] 启动自动轮询，数据源数量: ${this.sources.size}`);

    for (const state of this.sources.values()) {
      if (state.source.enabled) {
        this.startSourcePolling(state);
      }
    }
  }

  /**
   * 停止所有轮询
   */
  stop(): void {
    this.running = false;
    for (const state of this.sources.values()) {
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = undefined;
      }
    }
    console.log('[EventIngestion] 已停止所有轮询');
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 手动触发一次指定数据源的轮询
   */
  async pollSource(sourceId: string): Promise<number> {
    const state = this.sources.get(sourceId);
    if (!state) {
      throw new Error(`数据源 "${sourceId}" 不存在`);
    }
    return this.fetchAndProcess(state);
  }

  /**
   * 手动触发所有数据源的一次轮询
   */
  async pollAll(): Promise<number> {
    let totalEvents = 0;
    const promises = Array.from(this.sources.values())
      .filter(s => s.source.enabled)
      .map(async (state) => {
        const count = await this.fetchAndProcess(state);
        totalEvents += count;
      });

    await Promise.allSettled(promises);
    return totalEvents;
  }

  // ── 内部方法 ──

  /**
   * 启动单个数据源的定时轮询
   */
  private startSourcePolling(state: SourceState): void {
    const intervalMs = state.source.pollIntervalMs ?? this.defaultPollIntervalMs;

    // 立即执行一次
    this.fetchAndProcess(state).catch(err => {
      console.error(`[EventIngestion] 初始轮询失败 (${state.source.name}):`, err);
    });

    // 设置定时轮询
    state.timer = setInterval(() => {
      this.fetchAndProcess(state).catch(err => {
        console.error(`[EventIngestion] 轮询失败 (${state.source.name}):`, err);
      });
    }, intervalMs);
  }

  /**
   * 获取并处理一个数据源的 Feed
   */
  private async fetchAndProcess(state: SourceState): Promise<number> {
    try {
      const xml = await this.fetchFeed(state.source.url);
      const feed = parseFeed(xml);
      state.lastPollTime = new Date();
      state.lastError = undefined;

      const newItems = this.filterNewItems(feed.items);
      state.itemsFetched += newItems.length;

      // 限制每次处理的条目数
      const itemsToProcess = newItems.slice(0, this.maxItemsPerPoll);

      let eventsEmitted = 0;
      for (const item of itemsToProcess) {
        this.emitEvent(item, state.source);
        eventsEmitted++;
      }

      state.eventsEmitted += eventsEmitted;

      if (eventsEmitted > 0) {
        console.log(
          `[EventIngestion] "${state.source.name}" — ` +
          `新条目: ${newItems.length}, 注入事件: ${eventsEmitted}`
        );
      }

      return eventsEmitted;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      state.lastError = errorMsg;
      state.lastPollTime = new Date();
      console.error(`[EventIngestion] 获取数据源 "${state.source.name}" 失败: ${errorMsg}`);
      return 0;
    }
  }

  /**
   * 获取 Feed XML 内容
   */
  private async fetchFeed(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BeeClaw/0.1.0 EventIngestion',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * 过滤已处理过的条目
   */
  private filterNewItems(items: FeedItem[]): FeedItem[] {
    const newItems: FeedItem[] = [];

    for (const item of items) {
      if (!this.seenGuids.has(item.guid)) {
        this.seenGuids.add(item.guid);
        newItems.push(item);
      }
    }

    // 维护去重缓存大小
    this.trimDeduplicationCache();

    return newItems;
  }

  /**
   * 当缓存过大时清理旧条目
   */
  private trimDeduplicationCache(): void {
    if (this.seenGuids.size > this.maxCacheSize) {
      const excess = this.seenGuids.size - this.maxCacheSize;
      const iterator = this.seenGuids.values();
      for (let i = 0; i < excess; i++) {
        const next = iterator.next();
        if (!next.done) {
          this.seenGuids.delete(next.value);
        }
      }
    }
  }

  /**
   * 将 Feed 条目转为 WorldEvent 并注入 EventBus
   */
  private emitEvent(item: FeedItem, source: FeedSource): void {
    const assessment = this.evaluator.evaluate(item);

    // 构建事件内容
    const contentParts: string[] = [item.content];
    if (item.author) {
      contentParts.push(`来源作者: ${item.author}`);
    }
    if (item.link) {
      contentParts.push(`原文链接: ${item.link}`);
    }
    if (item.pubDate) {
      contentParts.push(`发布时间: ${item.pubDate.toISOString()}`);
    }

    // 合并标签：数据源配置的标签 + 条目自带的分类
    const tags = [...(source.tags ?? [])];
    if (item.categories) {
      tags.push(...item.categories);
    }
    if (assessment.matchedKeywords.length > 0) {
      tags.push(...assessment.matchedKeywords.slice(0, 5));
    }

    this.eventBus.injectEvent({
      title: item.title,
      content: contentParts.join('\n'),
      category: source.category,
      source: `feed:${source.id}(${source.name})`,
      importance: assessment.importance,
      propagationRadius: assessment.propagationRadius,
      tick: this.currentTick,
      tags: [...new Set(tags)], // 去重
      type: 'external',
    });
  }

  /**
   * 获取去重缓存大小
   */
  getSeenCount(): number {
    return this.seenGuids.size;
  }

  /**
   * 清空去重缓存（用于测试或重置）
   */
  clearSeenCache(): void {
    this.seenGuids.clear();
  }
}
