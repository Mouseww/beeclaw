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
