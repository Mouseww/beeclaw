// ============================================================================
// @beeclaw/event-ingestion — 公共 API 导出
// ============================================================================

export { EventIngestion } from './EventIngestion.js';
export { parseFeed } from './FeedParser.js';
export { ImportanceEvaluator } from './ImportanceEvaluator.js';
export { FinanceDataSource, POPULAR_STOCKS, POPULAR_CRYPTO, POPULAR_INDICES } from './FinanceDataSource.js';
export { MarketSentiment } from './MarketSentiment.js';

// Phase 2.2 新导出
export { RssAdapter } from './RssAdapter.js';
export { FinanceAdapter } from './FinanceAdapter.js';
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
  // Phase 2.2 新类型
  DataSourceAdapter,
  DataSourceType,
  SourceHealthMetrics,
  IngestedEvent,
} from './types.js';

export type { DeduplicationResult } from './ContentDeduplicator.js';
export type { RssAdapterConfig } from './RssAdapter.js';
