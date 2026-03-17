// ============================================================================
// EventIngestion Types — 外部事件接入模块类型定义
// ============================================================================

import type { EventCategory } from '@beeclaw/shared';

/** 数据源类型 */
export type FeedSourceType = 'rss' | 'atom';

/** 数据源配置 */
export interface FeedSource {
  /** 数据源唯一标识 */
  id: string;
  /** 数据源名称 */
  name: string;
  /** Feed URL */
  url: string;
  /** 数据源类型，默认自动检测 */
  type?: FeedSourceType;
  /** 映射到的事件分类 */
  category: EventCategory;
  /** 轮询间隔（毫秒），默认 300_000 (5分钟) */
  pollIntervalMs?: number;
  /** 标签列表，附加到生成的事件上 */
  tags?: string[];
  /** 是否启用，默认 true */
  enabled?: boolean;
}

/** 解析后的 Feed 条目 */
export interface FeedItem {
  /** 条目标题 */
  title: string;
  /** 条目内容/摘要 */
  content: string;
  /** 条目链接 */
  link?: string;
  /** 发布时间 */
  pubDate?: Date;
  /** 作者 */
  author?: string;
  /** 分类/标签 */
  categories?: string[];
  /** 用于去重的唯一标识（优先用 guid，其次 link+title） */
  guid: string;
}

/** 解析后的 Feed 数据 */
export interface ParsedFeed {
  /** Feed 标题 */
  title: string;
  /** Feed 描述 */
  description?: string;
  /** Feed 链接 */
  link?: string;
  /** Feed 条目列表 */
  items: FeedItem[];
  /** Feed 类型 */
  type: FeedSourceType;
}

/** 重要性评估结果 */
export interface ImportanceAssessment {
  /** 计算出的重要性 0-1 */
  importance: number;
  /** 传播半径 0-1 */
  propagationRadius: number;
  /** 匹配到的关键词 */
  matchedKeywords: string[];
}

/** EventIngestion 配置 */
export interface EventIngestionConfig {
  /** 数据源列表 */
  sources: FeedSource[];
  /** 全局轮询间隔（毫秒），各源可覆盖 */
  defaultPollIntervalMs?: number;
  /** 高重要性关键词（匹配到的条目重要性更高） */
  highImportanceKeywords?: string[];
  /** 中重要性关键词 */
  mediumImportanceKeywords?: string[];
  /** 每次轮询最多处理的新条目数 */
  maxItemsPerPoll?: number;
  /** 去重缓存大小（记住已处理的条目 guid） */
  deduplicationCacheSize?: number;
}

// ============================================================================
// 金融数据源类型定义
// ============================================================================

/** 金融资产类型 */
export type AssetType = 'stock' | 'crypto' | 'forex' | 'commodity';

/** 金融标的配置 */
export interface FinanceSymbol {
  /** 标的符号，如 AAPL, BTC-USD */
  symbol: string;
  /** 显示名称 */
  name: string;
  /** 资产类型 */
  type: AssetType;
  /** 自定义标签 */
  tags?: string[];
}

/** 金融数据源配置 */
export interface FinanceSourceConfig {
  /** 数据源唯一标识 */
  id: string;
  /** 数据源名称 */
  name: string;
  /** 关注的标的列表 */
  symbols: FinanceSymbol[];
  /** 轮询间隔（毫秒），默认 60_000 (1分钟) */
  pollIntervalMs?: number;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 价格变动阈值（百分比），超过此值才生成事件。默认 2 */
  priceChangeThreshold?: number;
  /** 是否生成市场情绪事件，默认 true */
  enableSentimentEvents?: boolean;
}

/** 股票/加密货币行情数据 */
export interface QuoteData {
  /** 标的符号 */
  symbol: string;
  /** 显示名称 */
  name: string;
  /** 资产类型 */
  type: AssetType;
  /** 当前价格 */
  price: number;
  /** 价格变动（绝对值） */
  change: number;
  /** 价格变动（百分比） */
  changePercent: number;
  /** 交易量 */
  volume?: number;
  /** 最高价 */
  high?: number;
  /** 最低价 */
  low?: number;
  /** 开盘价 */
  open?: number;
  /** 前收盘价 */
  previousClose?: number;
  /** 市值 */
  marketCap?: number;
  /** 数据获取时间 */
  timestamp: Date;
  /** 货币单位 */
  currency?: string;
}

/** 市场情绪类型 */
export type MarketSentimentType = 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';

// ============================================================================
// EventIngestion 状态查询类型
// ============================================================================

/** 单个 RSS 数据源的运行时状态 */
export interface IngestionSourceStatus {
  /** 数据源 ID */
  id: string;
  /** 数据源名称 */
  name: string;
  /** Feed URL */
  url: string;
  /** 是否启用 */
  enabled: boolean;
  /** 最后一次轮询时间（ISO 字符串） */
  lastPollTime: string | null;
  /** 最后一次错误信息 */
  lastError: string | null;
  /** 累计抓取条目数 */
  itemsFetched: number;
  /** 累计注入事件数 */
  eventsEmitted: number;
}

/** 单个金融数据源的运行时状态 */
export interface IngestionFinanceSourceStatus {
  /** 数据源 ID */
  id: string;
  /** 数据源名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否正在运行 */
  running: boolean;
  /** 最后一次轮询时间（ISO 字符串） */
  lastPollTime: string | null;
  /** 最后一次错误信息 */
  lastError: string | null;
  /** 关注标的数量 */
  symbolCount: number;
  /** 累计查询次数 */
  quotesPolled: number;
  /** 累计注入事件数 */
  eventsEmitted: number;
}

/** EventIngestion 整体运行状态 */
export interface IngestionStatus {
  /** 是否正在运行 */
  running: boolean;
  /** RSS 数据源总数 */
  sourceCount: number;
  /** 金融数据源总数 */
  financeSourceCount: number;
  /** 去重缓存大小 */
  deduplicationCacheSize: number;
  /** RSS 数据源状态列表 */
  sources: IngestionSourceStatus[];
  /** 金融数据源状态列表 */
  financeSources: IngestionFinanceSourceStatus[];
}

/** 市场情绪评估结果 */
export interface MarketSentimentResult {
  /** 标的符号 */
  symbol: string;
  /** 情绪类型 */
  sentiment: MarketSentimentType;
  /** 情绪强度 0-1 */
  intensity: number;
  /** 波动率指标 0-1 */
  volatility: number;
  /** 价格趋势方向 */
  trend: 'bullish' | 'bearish' | 'sideways';
  /** 描述文本 */
  description: string;
}

// ============================================================================
// Phase 2.2 — DataSourceAdapter 插件架构类型
// ============================================================================

/** 数据源适配器类型标识 */
export type DataSourceType = 'rss' | 'finance' | 'twitter' | 'reddit' | 'newsapi' | 'custom';

/** 数据源健康监控指标 */
export interface SourceHealthMetrics {
  /** 数据源 ID */
  sourceId: string;
  /** 是否可连通 */
  connected: boolean;
  /** 连续错误次数 */
  consecutiveErrors: number;
  /** 总错误次数 */
  totalErrors: number;
  /** 总成功次数 */
  totalSuccesses: number;
  /** 错误率 (0-1) */
  errorRate: number;
  /** 最近一次轮询的延迟（毫秒） */
  lastLatencyMs: number;
  /** 平均延迟（毫秒） */
  averageLatencyMs: number;
  /** 最后一次成功时间 */
  lastSuccessTime: Date | null;
  /** 最后一次错误时间 */
  lastErrorTime: Date | null;
  /** 最后一条错误信息 */
  lastErrorMessage: string | null;
  /** 累计注入事件数 */
  eventsEmitted: number;
  /** 运行时长（毫秒） */
  uptimeMs: number;
}

/** 数据源适配器产出的标准化事件 */
export interface IngestedEvent {
  /** 事件标题 */
  title: string;
  /** 事件内容 */
  content: string;
  /** 事件分类 */
  category: import('@beeclaw/shared').EventCategory;
  /** 来源标识 */
  source: string;
  /** 重要性 0-1 */
  importance: number;
  /** 传播半径 0-1 */
  propagationRadius: number;
  /** 标签 */
  tags: string[];
  /** 原始去重 ID（用于跨数据源去重） */
  deduplicationId?: string;
}

/**
 * DataSourceAdapter — 统一数据源适配器接口
 *
 * 所有数据源（RSS、Finance、Twitter、Reddit 等）都实现此接口，
 * 由 EventIngestion 统一管理生命周期和轮询调度。
 */
export interface DataSourceAdapter {
  /** 适配器唯一标识 */
  readonly id: string;
  /** 适配器显示名称 */
  readonly name: string;
  /** 数据源类型 */
  readonly type: DataSourceType;

  /**
   * 启动适配器（初始化连接、定时器等）
   */
  start(): void;

  /**
   * 停止适配器（清理定时器、关闭连接）
   */
  stop(): void;

  /**
   * 手动执行一次轮询，返回产出的事件列表
   */
  poll(): Promise<IngestedEvent[]>;

  /**
   * 获取当前健康监控指标
   */
  getHealthMetrics(): SourceHealthMetrics;

  /**
   * 更新当前世界 tick
   */
  setCurrentTick(tick: number): void;
}
