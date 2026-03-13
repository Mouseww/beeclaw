// ============================================================================
// BeeClaw Dashboard — 前端类型定义
// ============================================================================

/** 服务器状态（/api/status 响应） */
export interface ServerStatus {
  tick: number;
  agentCount: number;
  activeAgents: number;
  sentiment: Record<string, number>;
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
  durationMs: number;
  timestamp: string;
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
