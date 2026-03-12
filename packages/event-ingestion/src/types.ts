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
