// ============================================================================
// @beeclaw/event-ingestion — 公共 API 导出
// ============================================================================

export { EventIngestion } from './EventIngestion.js';
export { parseFeed } from './FeedParser.js';
export { ImportanceEvaluator } from './ImportanceEvaluator.js';
export { FinanceDataSource, POPULAR_STOCKS, POPULAR_CRYPTO, POPULAR_INDICES } from './FinanceDataSource.js';
export { MarketSentiment } from './MarketSentiment.js';

// Phase 2.2 适配器导出
export { RssAdapter } from './RssAdapter.js';
export { FinanceAdapter } from './FinanceAdapter.js';
export { TwitterAdapter } from './TwitterAdapter.js';
export { RedditAdapter } from './RedditAdapter.js';
export { NewsApiAdapter } from './NewsApiAdapter.js';
export { ContentDeduplicator } from './ContentDeduplicator.js';

export type {
  FeedSource,
  FeedSourceType,
  FeedItem,
  ParsedFeed,
  ImportanceAssessment,
  EventIngestionConfig,
  AssetType,
  FinanceSymbol,
  FinanceSourceConfig,
  QuoteData,
  MarketSentimentType,
  MarketSentimentResult,
  IngestionStatus,
  IngestionSourceStatus,
  IngestionFinanceSourceStatus,
  // Phase 2.2 插件架构类型
  DataSourceAdapter,
  DataSourceType,
  SourceHealthMetrics,
  IngestedEvent,
  // Twitter 类型
  TwitterAdapterConfig,
  TwitterSearchQuery,
  TwitterTweet,
  TwitterSearchResponse,
  // Reddit 类型
  RedditAdapterConfig,
  RedditSubredditConfig,
  RedditPost,
  RedditListingResponse,
  // NewsAPI 类型
  NewsApiAdapterConfig,
  NewsApiQuery,
  NewsApiArticle,
  NewsApiResponse,
} from './types.js';

export type { DeduplicationResult } from './ContentDeduplicator.js';
export type { RssAdapterConfig } from './RssAdapter.js';
