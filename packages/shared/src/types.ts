// ============================================================================
// BeeClaw Shared Types — 群体智能仿真引擎核心类型定义
// ============================================================================

// ── 基础类型 ──

/** Agent 状态 */
export type AgentStatus = 'active' | 'dormant' | 'dead';

/** 模型层级 */
export type ModelTier = 'local' | 'cheap' | 'strong';

/** 事件类型 */
export type EventType = 'external' | 'agent_action' | 'system';

/** 事件分类 */
export type EventCategory = 'finance' | 'politics' | 'tech' | 'social' | 'general';

/** 记忆类型 */
export type MemoryType = 'event' | 'interaction' | 'observation' | 'decision';

/** 社交关系类型 */
export type RelationType = 'follow' | 'trust' | 'rival' | 'neutral';

/** 社交角色 */
export type SocialRole = 'leader' | 'follower' | 'bridge' | 'contrarian';

/** Agent 行为类型 */
export type AgentActionType = 'speak' | 'forward' | 'silent' | 'predict';

/** 趋势方向 */
export type TrendDirection = 'forming' | 'strengthening' | 'weakening' | 'reversing';

/** 预警类型 */
export type AlertType = 'sentiment_shift' | 'consensus_break' | 'cascade_forming' | 'contrarian_surge';

/** 孵化触发器类型 */
export type SpawnTriggerType = 'event_keyword' | 'population_drop' | 'new_topic' | 'scheduled' | 'manual';

// ── 性格特征 ──

export interface PersonalityTraits {
  riskTolerance: number;        // 风险偏好 0-1
  informationSensitivity: number; // 信息敏感度 0-1
  conformity: number;           // 从众性 0-1
  emotionality: number;         // 情绪化程度 0-1
  analyticalDepth: number;      // 分析深度 0-1
}

// ── Agent 人格 ──

export interface AgentPersona {
  background: string;           // 背景故事
  profession: string;           // 职业
  traits: PersonalityTraits;    // 性格特征
  expertise: string[];          // 专业领域
  biases: string[];             // 认知偏见
  communicationStyle: string;   // 表达风格
}

// ── Agent 记忆 ──

export interface MemoryEntry {
  tick: number;
  type: MemoryType;
  content: string;
  importance: number;           // 0-1
  emotionalImpact: number;      // -1 ~ +1
}

export interface CompressedMemory {
  summary: string;
  tickRange: [number, number];
  keyInsights: string[];
  createdAt: number;
}

export interface Opinion {
  topic: string;
  stance: number;               // -1 ~ +1
  confidence: number;           // 0-1
  reasoning: string;
  lastUpdatedTick: number;
}

export interface PredictionRecord {
  tick: number;
  prediction: string;
  outcome?: string;
  accurate?: boolean;
}

export interface AgentMemoryState {
  shortTerm: MemoryEntry[];     // 最近 50 条 FIFO
  longTerm: CompressedMemory[];
  opinions: Record<string, Opinion>;
  predictions: PredictionRecord[];
}

// ── Agent 定义 ──

export interface BeeAgent {
  id: string;
  name: string;
  persona: AgentPersona;
  memory: AgentMemoryState;
  relationships: Relationship[];
  followers: string[];
  following: string[];
  influence: number;            // 0-100
  status: AgentStatus;
  credibility: number;          // 0-1
  spawnedAtTick: number;
  lastActiveTick: number;
  modelTier: ModelTier;
  modelId: string;
}

export interface Relationship {
  agentId: string;
  type: RelationType;
  strength: number;             // 0-1
}

// ── 世界事件 ──

export interface WorldEvent {
  id: string;
  type: EventType;
  category: EventCategory;
  title: string;
  content: string;
  source: string;
  importance: number;           // 0-1
  propagationRadius: number;    // 0-1 传播范围比例
  tick: number;
  tags: string[];
}

// ── 世界状态 ──

export interface WorldState {
  tick: number;
  timestamp: Date;
  globalFacts: string[];
  sentiment: Record<string, number>;
  activeEvents: WorldEvent[];
  agentCount: number;
}

export interface WorldConfig {
  tickIntervalMs: number;
  maxAgents: number;
  eventRetentionTicks: number;
  enableNaturalSelection: boolean;
}

// ── Social Graph ──

export interface SocialNode {
  agentId: string;
  influence: number;
  community: string;
  role: SocialRole;
}

export interface SocialEdge {
  from: string;
  to: string;
  type: RelationType;
  strength: number;
  formedAtTick: number;
}

// ── Agent LLM 响应 ──

export interface AgentResponse {
  opinion: string;
  action: AgentActionType;
  emotionalState: number;       // -1 ~ +1
  reasoning?: string;
  newOpinions?: Record<string, { stance: number; confidence: number }>;
  socialActions?: SocialAction[];
}

export interface SocialAction {
  type: 'follow' | 'unfollow' | 'reply';
  targetAgentId: string;
  reason?: string;
}

// ── 共识信号 ──

export interface SentimentDistribution {
  bullish: number;
  bearish: number;
  neutral: number;
}

export interface TopArgument {
  position: string;
  supporters: number;
  avgCredibility: number;
}

export interface AlertSignal {
  type: AlertType;
  description: string;
  confidence: number;
  triggeredBy: string[];
}

export interface ConsensusSignal {
  topic: string;
  tick: number;
  sentimentDistribution: SentimentDistribution;
  intensity: number;
  consensus: number;
  trend: TrendDirection;
  topArguments: TopArgument[];
  alerts: AlertSignal[];
}

// ── Agent 孵化 ──

export type SpawnTrigger =
  | { type: 'event_keyword'; keywords: string[] }
  | { type: 'population_drop'; threshold: number }
  | { type: 'new_topic'; minNovelty: number }
  | { type: 'scheduled'; intervalTicks: number }
  | { type: 'manual' };

export interface TraitRanges {
  riskTolerance: [number, number];
  informationSensitivity: [number, number];
  conformity: [number, number];
  emotionality: [number, number];
  analyticalDepth: [number, number];
}

export interface AgentTemplate {
  professionPool: string[];
  traitRanges: TraitRanges;
  expertisePool: string[][];
  biasPool: string[];
}

export interface SpawnRule {
  trigger: SpawnTrigger;
  template: AgentTemplate;
  count: number;
  modelTier: ModelTier;
}

// ── 场景模板 ──

/** Agent 角色定义（场景模板中的预定义角色） */
export interface AgentProfile {
  /** 角色名称标签，如 "散户"、"分析师" */
  role: string;
  /** 该角色的数量 */
  count: number;
  /** 模型层级 */
  modelTier: ModelTier;
  /** Agent 模板（用于生成 Agent） */
  template: AgentTemplate;
}

/** 事件源配置（场景模板中的事件源） */
export interface EventSourceConfig {
  /** 事件源类型 */
  type: 'finance' | 'rss' | 'manual';
  /** 事件源名称 */
  name: string;
  /** 事件源配置参数（根据 type 不同而不同） */
  config: Record<string, unknown>;
}

/** 共识配置覆盖 */
export interface ConsensusConfig {
  /** 最少需要多少个 Agent 响应才生成共识信号 */
  minResponsesForSignal?: number;
  /** 是否启用预警信号 */
  enableAlerts?: boolean;
}

/** 场景模板 — 定义一个完整的仿真场景 */
export interface ScenarioTemplate {
  /** 模板唯一标识名 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 预定义的 Agent 角色列表 */
  agentProfiles: AgentProfile[];
  /** 关联的事件源配置 */
  eventSources: EventSourceConfig[];
  /** 世界配置覆盖 */
  worldConfig: Partial<WorldConfig>;
  /** 共识配置覆盖 */
  consensusConfig: Partial<ConsensusConfig>;
  /** 默认运行 tick 数 */
  duration?: number;
  /** 孵化规则 */
  spawnRules?: SpawnRule[];
  /** 种子事件列表（启动时自动注入） */
  seedEvents?: Array<{
    title: string;
    content: string;
    category: EventCategory;
    importance: number;
    tags: string[];
  }>;
}

// ── LLM 配置 ──

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** 请求超时时间（毫秒），默认 60000 */
  timeoutMs?: number;
}

export interface ModelRouterConfig {
  local: LLMConfig;
  cheap: LLMConfig;
  strong: LLMConfig;
}

// ── 预测信号 API (Phase 2.2) ──

/** 预测信号的可信度信息（基于 Agent 信誉加权） */
export interface SignalCredibilityScore {
  /** 加权可信度评分 0-1 */
  weightedScore: number;
  /** 参与计算的 Agent 数量 */
  agentCount: number;
  /** 平均信誉 */
  avgCredibility: number;
  /** 高信誉 Agent（credibility > 0.7）数量 */
  highCredibilityCount: number;
}

/** 信号趋势分析（基于历史信号时序） */
export interface SignalTrendAnalysis {
  topic: string;
  /** 趋势方向 */
  direction: TrendDirection;
  /** 趋势强度（共识强度均值变化） */
  momentumDelta: number;
  /** 情绪均值（正=看涨，负=看跌） */
  sentimentMean: number;
  /** 分析覆盖的 tick 范围 */
  tickRange: [number, number];
  /** 数据点数量 */
  dataPoints: number;
}

/** 标准化预测信号（对外输出格式） */
export interface PredictionSignal {
  /** 信号唯一标识（topic + tick 组合） */
  id: string;
  topic: string;
  tick: number;
  /** 信号生成时间戳（Unix ms） */
  timestamp: number;
  /** 情绪分布（百分比） */
  sentimentDistribution: SentimentDistribution;
  /** 共识强度 0-1 */
  consensus: number;
  /** 情绪强度 0-1 */
  intensity: number;
  /** 趋势方向 */
  trend: TrendDirection;
  /** 可信度评分 */
  credibility: SignalCredibilityScore;
  /** 预警信号 */
  alerts: AlertSignal[];
  /** 顶部论点 */
  topArguments: TopArgument[];
}

/** 活跃趋势摘要（多 topic 交叉分析） */
export interface TrendSummary {
  /** 活跃 topic 数量 */
  activeTopics: number;
  /** topic 信号列表 */
  topics: Array<{
    topic: string;
    latestSignal: PredictionSignal;
    trend: TrendDirection;
    signalCount: number;
  }>;
  /** 全局情绪均值 */
  globalSentimentMean: number;
  /** 高置信度预警数量 */
  highConfidenceAlerts: number;
  /** 汇总时间戳 */
  timestamp: number;
}

/** 预测准确性统计 */
export interface PredictionAccuracyStats {
  /** 已评估信号总数 */
  totalSignals: number;
  /** 有后续验证事件的信号数 */
  evaluatedSignals: number;
  /** 准确率（0-1） */
  accuracyRate: number;
  /** 按 topic 的准确率 */
  byTopic: Record<string, { total: number; accurate: number; rate: number }>;
  /** 按趋势方向的准确率 */
  byTrend: Record<TrendDirection, { total: number; accurate: number; rate: number }>;
  /** 统计时间戳 */
  timestamp: number;
}

/** WebSocket signal 订阅消息类型 */
export type SignalSubscriptionAction = 'subscribe' | 'unsubscribe';

/** WebSocket signal 订阅请求 */
export interface SignalSubscriptionRequest {
  action: SignalSubscriptionAction;
  /** 订阅的 topic（不传则订阅全部） */
  topic?: string;
}

// ── Webhook 通知 ──

/** Webhook 支持的事件类型 */
export type WebhookEventType =
  | 'consensus.signal'
  | 'trend.detected'
  | 'trend.shift'
  | 'agent.spawned'
  | 'tick.completed';

/** Webhook 订阅 */
export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  active: boolean;
  createdAt: number;
}

/** Webhook 投递载荷 */
export interface WebhookPayload {
  event: WebhookEventType;
  data: unknown;
  timestamp: number;
  signature: string;
}

/** Webhook 投递状态 */
export type WebhookDeliveryStatus = 'success' | 'failed' | 'retrying';
