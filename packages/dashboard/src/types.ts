// ============================================================================
// BeeClaw Dashboard — 前端类型定义
// ============================================================================

/** 服务器状态（/api/status 响应） */
export interface ServerStatus {
  tick: number;
  agentCount: number;
  activeAgents: number;
  sentiment: {
    bullish: number;
    bearish: number;
    neutral: number;
    topicBreakdown: {
      topic: string;
      bullish: number;
      bearish: number;
      neutral: number;
      tick: number;
    }[];
    targetBreakdown?: {
      name: string;
      category: 'stock' | 'sector' | 'commodity' | 'crypto' | 'index' | 'macro' | 'other';
      bullish: number;
      bearish: number;
      neutral: number;
      avgStance: number;
      avgConfidence: number;
    }[];
  };
  activeEvents: number;
  lastTick: TickResult | null;
  wsConnections: number;
  uptime: number;
  running: boolean;
}

/** Tick 结果 */
export interface TickResult {
  tick: number;
  eventsProcessed: number;
  responsesCollected: number;
  agentsActivated: number;
  signals: number;
  newAgentsSpawned?: number;
  agentsEliminated?: number;
  cacheHits?: number;
  cacheMisses?: number;
  agentsFiltered?: number;
  durationMs: number;
  timestamp?: string;
  events?: TickEvent[];
  responses?: TickResponse[];
}

export interface TickEvent {
  id: string;
  title: string;
  category: string;
  importance: number;
}

export interface TickResponse {
  agentId: string;
  agentName: string;
  opinion: string;
  action: string;
  emotionalState: number;
  eventId?: string;
}

/** Agent 列表项（/api/agents 分页响应中的单项） */
export interface AgentListItem {
  id: string;
  name: string;
  profession: string;
  status: 'active' | 'dormant' | 'dead';
  influence: number;
  credibility: number;
  modelTier: 'local' | 'cheap' | 'strong';
  followers: number;
  following: number;
  lastActiveTick: number;
}

/** Agent 分页响应 */
export interface AgentListResponse {
  agents: AgentListItem[];
  page: number;
  size: number;
  total: number;
  pages: number;
}

/** 共识信号 */
export interface ConsensusSignal {
  topic: string;
  tick: number;
  sentimentDistribution: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  intensity: number;
  consensus: number;
  trend: 'forming' | 'strengthening' | 'weakening' | 'reversing';
  topArguments: {
    position: string;
    supporters: number;
    avgCredibility: number;
  }[];
  alerts: {
    type: string;
    description: string;
    confidence: number;
    triggeredBy: string[];
  }[];
  targetSentiments?: {
    name: string;
    category: 'stock' | 'sector' | 'commodity' | 'crypto' | 'index' | 'macro' | 'other';
    bullish: number;
    bearish: number;
    neutral: number;
    avgStance: number;
    avgConfidence: number;
  }[];
}

/** 共识 API 响应 */
export interface ConsensusResponse {
  topics: string[];
  latest: ConsensusSignal[];
}

/** 历史记录响应 */
export interface HistoryResponse {
  history: TickResult[];
  source: 'db' | 'memory';
}

/** Agent 详情数据（/api/agents/:id 响应，对应 BeeAgent） */
export interface AgentDetailData {
  id: string;
  name: string;
  persona: {
    background: string;
    profession: string;
    traits: {
      riskTolerance: number;
      informationSensitivity: number;
      conformity: number;
      emotionality: number;
      analyticalDepth: number;
    };
    expertise: string[];
    biases: string[];
    communicationStyle: string;
  };
  memory: {
    shortTerm: {
      tick: number;
      type: string;
      content: string;
      importance: number;
      emotionalImpact: number;
    }[];
    longTerm: {
      summary: string;
      tickRange: [number, number];
      keyInsights: string[];
      createdAt: number;
    }[];
    opinions: Record<string, {
      topic: string;
      stance: number;
      confidence: number;
      reasoning: string;
      lastUpdatedTick: number;
    }>;
    predictions: {
      tick: number;
      prediction: string;
      outcome?: string;
      accurate?: boolean;
    }[];
  };
  relationships: unknown[];
  followers: string[];
  following: string[];
  influence: number;
  status: 'active' | 'dormant' | 'dead';
  credibility: number;
  spawnedAtTick: number;
  lastActiveTick: number;
  modelTier: 'local' | 'cheap' | 'strong';
  modelId: string;
}

/** WebSocket 消息 */
export interface WsMessage {
  type: string;
  data: unknown;
  ts: number;
}

export interface WsTickMessage extends WsMessage {
  type: 'tick';
  data: TickResult;
}

export interface WsConsensusMessage extends WsMessage {
  type: 'consensus';
  data: ConsensusSignal[];
}

/** RSS 数据源状态 */
export interface IngestionSourceStatus {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastPollTime: string | null;
  lastError: string | null;
  itemsFetched: number;
  eventsEmitted: number;
}

/** 金融数据源状态 */
export interface IngestionFinanceSourceStatus {
  id: string;
  name: string;
  enabled: boolean;
  running: boolean;
  lastPollTime: string | null;
  lastError: string | null;
  symbolCount: number;
  quotesPolled: number;
  eventsEmitted: number;
}

/** Tick 事件详情（/api/ticks/:tick/events 响应） */
export interface TickEventsResponse {
  events: TickEvent[];
  total: number;
}

/** Tick 响应详情（/api/ticks/:tick/responses 响应） */
export interface TickResponsesResponse {
  responses: TickResponse[];
  total: number;
}

/** Ingestion 整体状态 */
export interface IngestionStatus {
  running: boolean;
  sourceCount: number;
  financeSourceCount: number;
  deduplicationCacheSize: number;
  sources: IngestionSourceStatus[];
  financeSources: IngestionFinanceSourceStatus[];
}

export interface ForecastResult {
  scenario: 'hot-event' | 'product-launch' | 'policy-impact' | 'roundtable';
  scenarioLabel: string;
  event: string;
  summary: string;
  factions: {
    name: string;
    share: number;
    summary: string;
  }[];
  keyReactions: {
    actor: string;
    reaction: string;
  }[];
  risks: string[];
  recommendations: string[];
  metrics: {
    agentCount: number;
    ticks: number;
    responsesCollected: number;
    averageActivatedAgents: number;
    consensusSignals: number;
    finalTick: number;
  };
}
