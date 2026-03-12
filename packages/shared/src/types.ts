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

// ── LLM 配置 ──

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelRouterConfig {
  local: LLMConfig;
  cheap: LLMConfig;
  strong: LLMConfig;
}
