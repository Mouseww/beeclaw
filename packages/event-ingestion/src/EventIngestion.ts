// ============================================================================
// EventIngestion — 外部事件自动接入模块（Phase 2.2 重构）
// 支持 DataSourceAdapter 插件架构 + 保留向后兼容的旧 API
// ============================================================================

import type { EventBus } from '@beeclaw/event-bus';
import type {
  FeedSource,
  FeedItem,
  EventIngestionConfig,
  FinanceSourceConfig,
  IngestionStatus,
  IngestionSourceStatus,
  IngestionFinanceSourceStatus,
  DataSourceAdapter,
  SourceHealthMetrics,
} from './types.js';
import { parseFeed } from './FeedParser.js';
import { ImportanceEvaluator } from './ImportanceEvaluator.js';
import { FinanceDataSource } from './FinanceDataSource.js';
import { ContentDeduplicator } from './ContentDeduplicator.js';

/** 默认配置 */
const DEFAULTS = {
  pollIntervalMs: 300_000,
  maxItemsPerPoll: 20,
  deduplicationCacheSize: 5000,
} as const;

/** 单个 RSS 数据源的运行时状态（向后兼容） */
interface SourceState {
  source: FeedSource;
  timer?: ReturnType<typeof setInterval>;
  lastPollTime?: Date;
  lastError?: string;
  itemsFetched: number;
  eventsEmitted: number;
}

/** 适配器运行时状态 */
interface AdapterState {
  adapter: DataSourceAdapter;
  timer?: ReturnType<typeof setInterval>;
}

export class EventIngestion {
  private eventBus: EventBus;

  // ── 旧 API（向后兼容） ──
  private sources: Map<string, SourceState> = new Map();
  private financeSources: Map<string, FinanceDataSource> = new Map();
  private seenGuids: Set<string> = new Set();
  private maxCacheSize: number;
  private maxItemsPerPoll: number;
  private defaultPollIntervalMs: number;
  private evaluator: ImportanceEvaluator;

  // ── 新 API：适配器注册表 ──
  private adapters: Map<string, AdapterState> = new Map();
  private deduplicator: ContentDeduplicator;

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
    this.deduplicator = new ContentDeduplicator({
      maxSize: this.maxCacheSize * 2,
    });

    // 注册初始 RSS 数据源
    if (config?.sources) {
      for (const source of config.sources) {
        this.addSource(source);
      }
    }
  }

  // ── Phase 2.2 新 API：适配器注册 ──

  /**
   * 注册一个数据源适配器
   */
  registerAdapter(adapter: DataSourceAdapter): void {
    if (this.adapters.has(adapter.id)) {
      console.warn(`[EventIngestion] 适配器 "${adapter.id}" 已存在，将被覆盖`);
      this.removeAdapter(adapter.id);
    }

    adapter.setCurrentTick(this.currentTick);
    this.adapters.set(adapter.id, { adapter });
    console.log(`[EventIngestion] 注册适配器: "${adapter.name}" (类型: ${adapter.type})`);

    // 如果已在运行中，立即启动适配器
    if (this.running) {
      this.startAdapter(adapter.id);
    }
  }

  /**
   * 注销一个适配器
   */
  removeAdapter(adapterId: string): void {
    const state = this.adapters.get(adapterId);
    if (!state) return;

    state.adapter.stop();
    if (state.timer) {
      clearInterval(state.timer);
    }
    this.adapters.delete(adapterId);
    console.log(`[EventIngestion] 注销适配器: "${adapterId}"`);
  }

  /**
   * 获取适配器实例
   */
  getAdapter(adapterId: string): DataSourceAdapter | undefined {
    return this.adapters.get(adapterId)?.adapter;
  }

  /**
   * 获取所有适配器的健康指标
   */
  getAdapterHealthMetrics(): SourceHealthMetrics[] {
    return Array.from(this.adapters.values()).map(s => s.adapter.getHealthMetrics());
  }

  /**
   * 手动触发指定适配器的一次轮询（结果去重后注入 EventBus）
   */
  async pollAdapter(adapterId: string): Promise<number> {
    const state = this.adapters.get(adapterId);
    if (!state) {
      throw new Error(`适配器 "${adapterId}" 不存在`);
    }
    return this.runAdapterPollAndEmit(state.adapter);
  }

  /**
   * 手动触发所有适配器的一次轮询
   */
  async pollAllAdapters(): Promise<number> {
    let totalEvents = 0;
    const promises = Array.from(this.adapters.values()).map(async (state) => {
      const count = await this.runAdapterPollAndEmit(state.adapter);
      totalEvents += count;
    });
    await Promise.allSettled(promises);
    return totalEvents;
  }

  // ── 向后兼容 API（旧 addSource / addFinanceSource） ──

  /**
   * 添加一个 RSS 数据源（向后兼容）
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

    if (this.running && state.source.enabled) {
      this.startSourcePolling(state);
    }
  }

  /**
   * 移除一个 RSS 数据源（向后兼容）
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
   * 添加金融数据源（向后兼容）
   */
  addFinanceSource(config: FinanceSourceConfig): FinanceDataSource {
    if (this.financeSources.has(config.id)) {
      console.warn(`[EventIngestion] 金融数据源 "${config.id}" 已存在，将被覆盖`);
      this.removeFinanceSource(config.id);
    }

    const financeSource = new FinanceDataSource(this.eventBus, config);
    financeSource.setCurrentTick(this.currentTick);
    this.financeSources.set(config.id, financeSource);
    console.log(`[EventIngestion] 添加金融数据源: "${config.name}" (${config.symbols.length} 个标的)`);

    if (this.running && (config.enabled ?? true)) {
      financeSource.start();
    }

    return financeSource;
  }

  /**
   * 移除金融数据源（向后兼容）
   */
  removeFinanceSource(sourceId: string): void {
    const source = this.financeSources.get(sourceId);
    if (!source) return;

    source.stop();
    this.financeSources.delete(sourceId);
    console.log(`[EventIngestion] 移除金融数据源: "${sourceId}"`);
  }

  /**
   * 获取金融数据源状态（向后兼容）
   */
  getFinanceSourceStates(): Array<ReturnType<FinanceDataSource['getStatus']>> {
    return Array.from(this.financeSources.values()).map(s => s.getStatus());
  }

  /**
   * 获取指定金融数据源实例（向后兼容）
   */
  getFinanceSource(sourceId: string): FinanceDataSource | undefined {
    return this.financeSources.get(sourceId);
  }

  /**
   * 获取所有 RSS 数据源状态（向后兼容）
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

  // ── 生命周期方法 ──

  /**
   * 更新当前世界 tick（由 WorldEngine 调用）
   */
  setCurrentTick(tick: number): void {
    this.currentTick = tick;
    for (const source of this.financeSources.values()) {
      source.setCurrentTick(tick);
    }
    for (const state of this.adapters.values()) {
      state.adapter.setCurrentTick(tick);
    }
  }

  /**
   * 启动所有数据源的自动轮询
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const legacyCount = this.sources.size + this.financeSources.size;
    const adapterCount = this.adapters.size;
    console.log(
      `[EventIngestion] 启动自动轮询 — ` +
      `旧式数据源: ${legacyCount}, 适配器: ${adapterCount}`,
    );

    // 启动旧式 RSS 数据源
    for (const state of this.sources.values()) {
      if (state.source.enabled) {
        this.startSourcePolling(state);
      }
    }

    // 启动旧式金融数据源
    for (const source of this.financeSources.values()) {
      source.start();
    }

    // 启动适配器
    for (const adapterId of this.adapters.keys()) {
      this.startAdapter(adapterId);
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

    for (const source of this.financeSources.values()) {
      source.stop();
    }

    for (const state of this.adapters.values()) {
      state.adapter.stop();
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
   * 手动触发指定 RSS 数据源的轮询（向后兼容）
   */
  async pollSource(sourceId: string): Promise<number> {
    const state = this.sources.get(sourceId);
    if (!state) {
      throw new Error(`数据源 "${sourceId}" 不存在`);
    }
    return this.fetchAndProcess(state);
  }

  /**
   * 手动触发所有 RSS 数据源的轮询（向后兼容）
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

  /**
   * 获取整体运行状态
   */
  getStatus(): IngestionStatus {
    const sources: IngestionSourceStatus[] = Array.from(this.sources.values()).map(s => ({
      id: s.source.id,
      name: s.source.name,
      url: s.source.url,
      enabled: s.source.enabled ?? true,
      lastPollTime: s.lastPollTime?.toISOString() ?? null,
      lastError: s.lastError ?? null,
      itemsFetched: s.itemsFetched,
      eventsEmitted: s.eventsEmitted,
    }));

    const financeSources: IngestionFinanceSourceStatus[] = Array.from(this.financeSources.values()).map(fs => {
      const status = fs.getStatus();
      return {
        id: status.id,
        name: status.name,
        enabled: status.enabled,
        running: status.running,
        lastPollTime: status.lastPollTime?.toISOString() ?? null,
        lastError: status.lastError ?? null,
        symbolCount: status.symbolCount,
        quotesPolled: status.quotesPolled,
        eventsEmitted: status.eventsEmitted,
      };
    });

    return {
      running: this.running,
      sourceCount: this.sources.size,
      financeSourceCount: this.financeSources.size,
      adapterCount: this.adapters.size,
      deduplicationCacheSize: this.seenGuids.size + this.deduplicator.size(),
      sources,
      financeSources,
    };
  }

  /**
   * 查询单个 RSS 数据源的状态（向后兼容）
   */
  getSourceStatus(sourceId: string): IngestionSourceStatus | undefined {
    const s = this.sources.get(sourceId);
    if (!s) return undefined;
    return {
      id: s.source.id,
      name: s.source.name,
      url: s.source.url,
      enabled: s.source.enabled ?? true,
      lastPollTime: s.lastPollTime?.toISOString() ?? null,
      lastError: s.lastError ?? null,
      itemsFetched: s.itemsFetched,
      eventsEmitted: s.eventsEmitted,
    };
  }

  /** 获取去重缓存大小（旧式，向后兼容） */
  getSeenCount(): number {
    return this.seenGuids.size;
  }

  /** 清空旧式去重缓存 */
  clearSeenCache(): void {
    this.seenGuids.clear();
  }

  /** 获取内容去重器实例 */
  getDeduplicator(): ContentDeduplicator {
    return this.deduplicator;
  }

  // ── 内部方法 ──

  /**
   * 启动适配器的定时轮询
   */
  private startAdapter(adapterId: string): void {
    const state = this.adapters.get(adapterId);
    if (!state) return;

    // 先调用适配器自己的 start()（内部有自己的定时器）
    state.adapter.start();
  }

  /**
   * 运行适配器轮询，去重后注入 EventBus
   */
  private async runAdapterPollAndEmit(adapter: DataSourceAdapter): Promise<number> {
    let emitted = 0;
    try {
      const events = await adapter.poll();

      for (const event of events) {
        const result = this.deduplicator.checkAndRecord(event);
        if (!result.isDuplicate) {
          this.eventBus.injectEvent({
            title: event.title,
            content: event.content,
            category: event.category,
            source: event.source,
            importance: event.importance,
            propagationRadius: event.propagationRadius,
            tick: this.currentTick,
            tags: event.tags,
            type: 'external',
          });
          emitted++;
        }
      }
    } catch (error) {
      console.error(
        `[EventIngestion] 适配器 "${adapter.name}" 轮询注入失败:`,
        error,
      );
    }
    return emitted;
  }

  // ── 旧式 RSS 内部方法（向后兼容） ──

  private startSourcePolling(state: SourceState): void {
    const intervalMs = state.source.pollIntervalMs ?? this.defaultPollIntervalMs;

    this.fetchAndProcess(state).catch(err => {
      console.error(`[EventIngestion] 初始轮询失败 (${state.source.name}):`, err);
    });

    state.timer = setInterval(() => {
      this.fetchAndProcess(state).catch(err => {
        console.error(`[EventIngestion] 轮询失败 (${state.source.name}):`, err);
      });
    }, intervalMs);
  }

  private async fetchAndProcess(state: SourceState): Promise<number> {
    try {
      const xml = await this.fetchFeed(state.source.url);
      const feed = parseFeed(xml);
      state.lastPollTime = new Date();
      state.lastError = undefined;

      const newItems = this.filterNewItems(feed.items);
      state.itemsFetched += newItems.length;

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
          `新条目: ${newItems.length}, 注入事件: ${eventsEmitted}`,
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

  private async fetchFeed(url: string, retries = 3): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'BeeClaw/1.0.0 EventIngestion',
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
          console.warn(
            `[EventIngestion] 请求失败 (${url}), 第 ${attempt}/${retries} 次重试, ` +
            `${delayMs}ms 后重试: ${lastError.message}`,
          );
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError!;
  }

  private filterNewItems(items: FeedItem[]): FeedItem[] {
    const newItems: FeedItem[] = [];

    for (const item of items) {
      if (!this.seenGuids.has(item.guid)) {
        this.seenGuids.add(item.guid);
        newItems.push(item);
      }
    }

    this.trimDeduplicationCache();

    return newItems;
  }

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

  private emitEvent(item: FeedItem, source: FeedSource): void {
    const assessment = this.evaluator.evaluate(item);

    const contentParts: string[] = [item.content];
    if (item.author) contentParts.push(`来源作者: ${item.author}`);
    if (item.link) contentParts.push(`原文链接: ${item.link}`);
    if (item.pubDate) contentParts.push(`发布时间: ${item.pubDate.toISOString()}`);

    const tags = [...(source.tags ?? [])];
    if (item.categories) tags.push(...item.categories);
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
      tags: [...new Set(tags)],
      type: 'external',
    });
  }
}

// Re-export adapters for convenience
export { RssAdapter } from './RssAdapter.js';
export { FinanceAdapter } from './FinanceAdapter.js';
export { TwitterAdapter } from './TwitterAdapter.js';
export { RedditAdapter } from './RedditAdapter.js';
export { NewsApiAdapter } from './NewsApiAdapter.js';
