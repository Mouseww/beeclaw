# BeeClaw (BeeWorld) — 群体智能仿真引擎

## 架构设计文档 v1.0

> **BeeClaw** = Bee + Claw（利爪）—— 蜂群智能，精准抓取未来趋势
> **BeeWorld** = 蜂蜂大世界 —— 一个由完整 AI Agent 组成的持续演化的平行世界

---

## 1. 项目定位

### 1.1 一句话描述
一个由**数百到数千个完整 LLM Agent** 组成的持续运行的仿真社会，通过群体行为涌现来预测现实世界的趋势。

### 1.2 核心差异

| 维度 | MiroFish | BeeClaw |
|------|----------|---------|
| Agent 本质 | 完整 LLM，但预设角色跑一次 | 完整 LLM，持续存活、动态生成 |
| 运行模式 | 输入种子 → 跑仿真 → 输出报告 | 持续运行的世界，实时注入真实事件 |
| 生命周期 | 仿真结束即销毁 | Agent 有出生、进化、死亡 |
| 群体动力学 | 预设社交关系 | 关系动态形成，信息自然传播 |
| 输出 | 单次预测报告 | 持续的趋势信号流 |

### 1.3 变现场景
- **金融市场情绪预测** — Agent 群模拟散户/机构/分析师行为，输出群体情绪指数
- **产品舆论推演** — 新品发布前在 BeeWorld 里跑一遍虚拟社会反应
- **政策影响评估** — 模拟不同利益群体对政策变化的连锁反应
- **营销策略测试** — 在虚拟社会中测试不同传播策略的效果

---

## 2. 系统架构总览

```
┌─────────────────────────────────────────────────────┐
│                    BeeClaw 系统                       │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Real-Time │  │ World    │  │   Agent Pool     │   │
│  │ Event     │→│ Engine   │→│  (完整 LLM Agents)│   │
│  │ Ingestion │  │ (世界引擎) │  │  [100~10000]    │   │
│  └──────────┘  └────┬─────┘  └────────┬─────────┘   │
│                     │                  │             │
│              ┌──────┴──────┐   ┌───────┴──────┐     │
│              │ Event Bus   │   │ Social Graph │     │
│              │ (事件总线)    │   │ (社交网络)    │     │
│              └──────┬──────┘   └───────┬──────┘     │
│                     │                  │             │
│              ┌──────┴──────────────────┴──────┐     │
│              │      Consensus Engine          │     │
│              │      (共识提取引擎)               │     │
│              └──────────────┬─────────────────┘     │
│                             │                       │
│                    ┌────────┴────────┐               │
│                    │  Output API     │               │
│                    │  (预测信号/报告)  │               │
│                    └─────────────────┘               │
└─────────────────────────────────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 World Engine（世界引擎）

世界的时间和状态管理器。

```typescript
interface WorldState {
  tick: number              // 当前世界回合
  timestamp: Date           // 对应现实时间
  globalFacts: Fact[]       // 全局已知事实
  markets: MarketState[]    // 市场状态（股价、汇率等）
  sentiment: SentimentMap   // 全局情绪地图
  activeEvents: WorldEvent[] // 当前活跃事件
}

interface WorldConfig {
  tickIntervalMs: number      // 每个回合间隔（默认 60s）
  maxAgents: number           // Agent 上限
  eventRetentionTicks: number // 事件保留回合数
  enableNaturalSelection: boolean // 是否启用自然选择
}
```

**运行机制：**
1. 每个 tick，World Engine 推进世界时钟
2. 检查外部事件注入队列
3. 通过 Event Bus 传播事件到相关 Agent
4. 等待被激活的 Agent 响应
5. 收集响应，更新世界状态
6. 触发 Consensus Engine 提取信号

### 3.2 Agent 定义

每个 Agent 都是**完整的 LLM Agent**，有独立人格、记忆和决策能力。

```typescript
interface BeeAgent {
  id: string
  name: string
  
  // ── 人格层 ──
  persona: AgentPersona       // 身份、职业、性格
  
  // ── 记忆层 ──
  memory: AgentMemory         // 长短期记忆
  
  // ── 社交层 ──
  relationships: Relationship[] // 与其他 Agent 的关系
  followers: string[]          // 关注者
  following: string[]          // 关注的人
  influence: number            // 影响力指数 (0-100)
  
  // ── 状态层 ──
  status: 'active' | 'dormant' | 'dead'
  credibility: number         // 信誉度（预测准确性）
  spawnedAtTick: number       // 出生回合
  lastActiveTick: number      // 最后活跃回合
  
  // ── LLM 配置 ──
  modelTier: 'local' | 'cheap' | 'strong'  // 模型层级
  modelId: string             // 具体模型 ID
}

interface AgentPersona {
  background: string          // 背景故事（1-2段）
  profession: string          // 职业
  traits: PersonalityTraits   // 性格特征
  expertise: string[]         // 专业领域
  biases: string[]            // 认知偏见
  communicationStyle: string  // 表达风格
}

interface PersonalityTraits {
  riskTolerance: number       // 风险偏好 0-1
  informationSensitivity: number // 信息敏感度 0-1
  conformity: number          // 从众性 0-1
  emotionality: number        // 情绪化程度 0-1
  analyticalDepth: number     // 分析深度 0-1
}
```

### 3.3 Agent Memory（Agent 记忆）

```typescript
interface AgentMemory {
  // 短期记忆 — 最近 N 个回合的事件和交互
  shortTerm: MemoryEntry[]    // 最近 50 条，FIFO
  
  // 长期记忆 — 压缩后的重要经历
  longTerm: CompressedMemory[] // 摘要形式，定期压缩
  
  // 观点记忆 — Agent 对各话题的当前立场
  opinions: Map<string, Opinion>
  
  // 预测记录 — 追踪预测准确性
  predictions: PredictionRecord[]
}

interface MemoryEntry {
  tick: number
  type: 'event' | 'interaction' | 'observation' | 'decision'
  content: string
  importance: number          // 0-1，决定是否进入长期记忆
  emotionalImpact: number     // 情绪影响
}

interface CompressedMemory {
  summary: string             // LLM 生成的摘要
  tickRange: [number, number] // 覆盖的回合范围
  keyInsights: string[]       // 关键洞察
  createdAt: number
}

interface Opinion {
  topic: string
  stance: number              // -1 (强烈反对) ~ +1 (强烈支持)
  confidence: number          // 0-1
  reasoning: string           // 推理依据
  lastUpdatedTick: number
}
```

### 3.4 Agent Spawner（Agent 孵化器）

动态生成新 Agent，模拟真实世界中新参与者不断加入的现象。

```typescript
interface SpawnRule {
  trigger: SpawnTrigger       // 触发条件
  template: AgentTemplate     // Agent 模板
  count: number | Range       // 生成数量
  modelTier: 'local' | 'cheap' | 'strong'
}

type SpawnTrigger =
  | { type: 'event_keyword', keywords: string[] }      // 事件包含关键词
  | { type: 'population_drop', threshold: number }      // 人口低于阈值
  | { type: 'new_topic', minNovelty: number }           // 出现全新话题
  | { type: 'scheduled', intervalTicks: number }        // 定时生成
  | { type: 'manual' }                                  // 手动触发

interface AgentTemplate {
  professionPool: string[]    // 随机职业池
  traitRanges: {              // 性格范围（随机生成）
    riskTolerance: [number, number]
    conformity: [number, number]
    // ...
  }
  expertisePool: string[][]   // 专业领域组合池
  biasPool: string[]          // 认知偏见池
}
```

**孵化策略：**
- 当新的重大事件注入（如"央行加息"），自动生成一批相关领域 Agent（经济学家、交易员、普通储户）
- Agent 死亡/休眠后自动补充，维持生态多样性
- 可手动注入特定角色的 Agent（如"做空者"、"内幕知情人"）

### 3.5 Social Graph（社交网络）

Agent 之间的关系网络，影响信息传播路径。

```typescript
interface SocialGraph {
  nodes: Map<string, SocialNode>
  edges: Map<string, SocialEdge[]>
}

interface SocialNode {
  agentId: string
  influence: number           // 影响力（粉丝数、发言质量）
  community: string           // 所属社区/圈子
  role: 'leader' | 'follower' | 'bridge' | 'contrarian' // 社交角色
}

interface SocialEdge {
  from: string
  to: string
  type: 'follow' | 'trust' | 'rival' | 'neutral'
  strength: number            // 0-1
  formedAtTick: number
}
```

**关系动态形成：**
- Agent 交互后可能建立 follow/trust 关系
- 观点一致的 Agent 自然聚集成社区
- 持续错误的 Agent 会失去 followers
- 少数"bridge" Agent 连接不同社区，传播跨圈信息

### 3.6 Event Bus（事件总线）

```typescript
interface WorldEvent {
  id: string
  type: 'external' | 'agent_action' | 'system'
  category: string            // 'finance', 'politics', 'tech', 'social'
  title: string
  content: string
  source: string              // 来源（RSS、API、Agent ID）
  importance: number          // 0-1
  propagationRadius: number   // 传播范围（影响多少比例的 Agent）
  tick: number
  tags: string[]
}
```

**事件传播机制：**
1. 外部事件注入（RSS 新闻、API 数据、手动注入）
2. 根据 `propagationRadius` 和 Social Graph 计算哪些 Agent "看到"这个事件
3. 被激活的 Agent 生成响应（可能产生新的内部事件）
4. Agent 的响应通过 Social Graph 传播给 followers
5. 形成信息级联效应

### 3.7 Consensus Engine（共识提取引擎）

从 Agent 群体的分散行为中提取有意义的趋势信号。

```typescript
interface ConsensusSignal {
  topic: string
  tick: number
  
  // 群体情绪
  sentimentDistribution: {
    bullish: number           // 看多比例
    bearish: number           // 看空比例
    neutral: number           // 中立比例
  }
  
  // 情绪强度
  intensity: number           // 0-1，群体情绪激烈程度
  
  // 共识度
  consensus: number           // 0-1，观点一致性
  
  // 趋势方向
  trend: 'forming' | 'strengthening' | 'weakening' | 'reversing'
  
  // 关键论点
  topArguments: {
    position: string
    supporters: number
    avgCredibility: number
  }[]
  
  // 预警信号
  alerts: AlertSignal[]
}

interface AlertSignal {
  type: 'sentiment_shift' | 'consensus_break' | 'cascade_forming' | 'contrarian_surge'
  description: string
  confidence: number
  triggeredBy: string[]       // 触发的 Agent IDs
}
```

---

## 4. 成本控制架构

每个 Agent 都是完整 LLM，但通过架构层面控制成本：

### 4.1 模型分层

```
┌─────────────────────────────────────────┐
│ Strong Tier (5-10%)                     │
│ Claude Opus / GPT-4o                    │
│ 意见领袖、专家 Agent、关键决策点           │
├─────────────────────────────────────────┤
│ Cheap Tier (30-40%)                     │
│ Claude Haiku / GPT-4o-mini / Qwen       │
│ 普通参与者、跟随者                        │
├─────────────────────────────────────────┤
│ Local Tier (50-60%)                     │
│ Qwen-7B / Llama-8B 本地部署              │
│ 大量普通群众 Agent                        │
│ 成本 ≈ 0（仅电费）                        │
└─────────────────────────────────────────┘
```

### 4.2 选择性激活

不是每个事件都唤醒所有 Agent：
- **事件传播半径** — 小事件只影响附近 Agent
- **兴趣匹配** — Agent 只对自己专业/关注领域的事件响应
- **休眠机制** — 连续 N 个 tick 无事可做的 Agent 进入 dormant 状态
- 典型比例：1000 个 Agent，每个 tick 实际激活 50-200 个

### 4.3 批量 & 异步

- Agent 响应不需要实时，按 tick 批量处理
- 同一 tick 内的多个 Agent 可以并发请求 LLM API
- 本地模型可以跑 batch inference

### 4.4 成本估算

| 规模 | 每 tick 激活 | 本地模型 | 云 API | 每 tick 成本 | 每日成本（1440 tick）|
|------|------------|---------|--------|------------|-----------------|
| 100 Agent | ~20 | 12 | 8 | ~$0.01 | ~$15 |
| 500 Agent | ~80 | 48 | 32 | ~$0.04 | ~$60 |
| 1000 Agent | ~150 | 90 | 60 | ~$0.08 | ~$115 |
| 5000 Agent | ~500 | 350 | 150 | ~$0.20 | ~$290 |

---

## 5. 技术栈

```
核心引擎:     TypeScript (Node.js)
数据存储:     PostgreSQL (Agent 状态 + 世界状态) + Redis (事件队列 + 缓存)
本地 LLM:    Ollama / vLLM (Qwen-7B, Llama-8B)
云 LLM:      OpenAI API / Anthropic API / 任意 OpenAI 兼容 API
消息队列:     BullMQ (基于 Redis)
前端可视化:   React + D3.js (Social Graph 可视化)
API 层:      Express / Fastify
容器化:      Docker Compose
```

---

## 6. 项目结构

```
beeclaw/
├── docs/
│   ├── ARCHITECTURE.md          # 本文档
│   └── API.md                   # API 文档
├── packages/
│   ├── world-engine/            # 世界引擎核心
│   │   └── src/
│   │       ├── WorldEngine.ts       # 主循环
│   │       ├── WorldState.ts        # 世界状态管理
│   │       ├── TickScheduler.ts     # 回合调度器
│   │       └── types.ts
│   ├── agent-runtime/           # Agent 运行时
│   │   └── src/
│   │       ├── Agent.ts             # Agent 核心类
│   │       ├── AgentMemory.ts       # 记忆系统
│   │       ├── AgentPersona.ts      # 人格生成
│   │       ├── AgentSpawner.ts      # 孵化器
│   │       ├── ModelRouter.ts       # 模型路由（分层）
│   │       └── types.ts
│   ├── social-graph/            # 社交网络
│   │   └── src/
│   │       ├── SocialGraph.ts       # 图结构
│   │       ├── Propagation.ts       # 信息传播算法
│   │       ├── CommunityDetection.ts # 社区发现
│   │       └── types.ts
│   ├── event-bus/               # 事件总线
│   │   └── src/
│   │       ├── EventBus.ts          # 事件分发
│   │       ├── EventIngestion.ts    # 外部事件接入
│   │       ├── EventPropagation.ts  # 传播规则
│   │       └── types.ts
│   ├── consensus/               # 共识提取
│   │   └── src/
│   │       ├── ConsensusEngine.ts   # 共识分析
│   │       ├── SentimentAggregator.ts # 情绪聚合
│   │       ├── TrendDetector.ts     # 趋势检测
│   │       └── types.ts
│   ├── api/                     # REST API
│   │   └── src/
│   │       ├── server.ts
│   │       └── routes/
│   ├── dashboard/               # React 前端
│   │   └── src/
│   │       ├── App.tsx
│   │       └── components/
│   └── shared/                  # 共享类型和工具
│       └── src/
│           ├── types.ts
│           └── utils.ts
├── config/
│   ├── default.yaml             # 默认配置
│   └── personas/                # 预设人格模板
│       ├── financial-analyst.yaml
│       ├── retail-investor.yaml
│       ├── economist.yaml
│       └── journalist.yaml
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 7. 核心流程

### 7.1 世界主循环

```
每个 Tick：
  1. TickScheduler 推进世界时钟
  2. EventIngestion 检查外部事件队列（RSS、API、手动注入）
  3. 新事件注入 → EventBus
  4. EventPropagation 根据 SocialGraph 计算传播范围
  5. 被激活的 Agent 列表确定
  6. 并发调用 Agent.react(event) → LLM 生成响应
  7. Agent 响应可能产生新事件（发言、转发、预测）
  8. 内部事件再次进入 EventBus（级联传播，最多 3 层）
  9. ConsensusEngine 分析本 tick 的群体行为
  10. 输出 ConsensusSignal 到 API / 存储
  11. AgentSpawner 检查是否需要生成新 Agent
  12. NaturalSelection 检查 Agent 信誉，淘汰低效 Agent
```

### 7.2 Agent 响应流程

```
Agent.react(event):
  1. 加载 Agent 人格 (system prompt)
  2. 注入短期记忆 + 相关长期记忆
  3. 注入事件内容
  4. 调用 LLM (根据 modelTier 路由到对应模型)
  5. 解析 LLM 输出 → 结构化响应：
     - opinion: 对事件的观点
     - action: 可能的行为（发言/转发/沉默/做预测）
     - emotional_state: 情绪变化
  6. 更新 Agent 记忆
  7. 更新 Social Graph（可能 follow/unfollow 其他 Agent）
  8. 返回响应事件
```

---

## 8. MVP 范围（Phase 1）

第一阶段先跑通核心链路，用 50-100 个 Agent 做概念验证：

### 8.1 必须实现
- [x] World Engine 基本主循环（Tick 驱动）
- [x] Agent 定义 + LLM 调用（先对接 OpenAI 兼容 API）
- [x] Agent 基本记忆（短期记忆 + 观点记忆）
- [x] Event Bus（手动注入事件 + Agent 响应传播）
- [x] Simple Social Graph（随机初始关系，交互后更新）
- [x] Consensus Engine（基本情绪聚合 + 多空比例）
- [x] CLI 工具（启动世界、注入事件、查看状态）
- [x] Agent Spawner（基本模板 + 手动/事件触发）

### 8.2 Phase 2
- [x] 外部事件自动接入（RSS、新闻 API）— event-ingestion 包已完成
- [x] 模型分层（本地模型 + 云 API 混合）— ModelRouter 已实现
- [x] React Dashboard（世界状态可视化）
- [x] Social Graph 可视化（D3.js）
- [x] 记忆压缩（定期摘要）— AgentMemory 已内置 LLM 压缩
- [x] 自然选择（信誉淘汰）

### 8.3 Phase 3
- [x] REST API（对外提供预测信号）— server 包已实现（Fastify + WebSocket）
- [x] 金融数据源接入（Yahoo Finance + 加密货币 + 市场情绪推断）
- [ ] 多场景模板（金融、舆论、产品测试）
- [ ] 性能优化（batch inference、缓存）
- [ ] 生产部署 + 监控

---

## 9. 与 BeeAgent 的关系

- **BeeAgent** = 网页内 GUI Agent（操作网页的工具）
- **BeeClaw/BeeWorld** = Agent 群体仿真引擎（预测趋势的平台）
- 未来可整合：BeeAgent 作为 BeeClaw 的数据采集层（自动浏览网页获取信息注入世界）

---

*BeeQueen 集团出品 🐝*
*Alex (CTO) | 2026-03-12*
