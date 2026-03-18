# BeeClaw REST API Reference

> 基于 Fastify v5，默认监听 `0.0.0.0:3000`。

## 目录

- [基础信息](#基础信息)
- [认证](#认证)
- [健康检查](#健康检查)
- [世界状态](#世界状态)
- [Agent 管理](#agent-管理)
- [事件注入](#事件注入)
- [共识引擎](#共识引擎)
- [Tick 历史](#tick-历史)
- [场景推演](#场景推演)
- [用户推演（Forecast）](#用户推演forecast)
- [LLM 配置管理](#llm-配置管理)
- [Webhook 管理](#webhook-管理)
- [数据源管理（Ingestion）](#数据源管理ingestion)
- [API Key 管理](#api-key-管理)
- [运行时指标 (JSON)](#运行时指标-json)
- [Prometheus 指标](#prometheus-指标)
- [WebSocket](#websocket)
- [Dashboard 静态资源](#dashboard-静态资源)

---

## 基础信息

| 项目 | 值 |
|------|-----|
| 框架 | Fastify v5.3 |
| 默认端口 | `3000`（环境变量 `BEECLAW_PORT`） |
| 默认主机 | `0.0.0.0`（环境变量 `BEECLAW_HOST`） |
| 认证 | API Key / Bearer Token（见下方[认证](#认证)章节） |
| 数据格式 | JSON（除 Prometheus 端点外） |

---

## 认证

**源码**: `packages/server/src/middleware/auth.ts`

通过环境变量 `BEECLAW_API_KEY` 启用认证。未设置时所有端点公开访问（开发模式）。

### 认证方式

支持两种方式提供凭证：

| 方式 | 格式 | 说明 |
|------|------|------|
| Bearer Token | `Authorization: Bearer <key>` | 标准 HTTP Bearer 认证 |
| API Key Header | `X-API-Key: <key>` | 自定义 Header |
| WebSocket Query | `?token=<key>` | 仅用于 WebSocket 连接 |

### 密钥类型

| 类型 | 说明 |
|------|------|
| Master Key | 通过 `BEECLAW_API_KEY` 环境变量配置，拥有完全访问权限 |
| 托管 API Key | 通过 `/api/keys` 端点动态创建，Hash 存储于数据库 |

### 公开路由（无需认证）

| 路由 | 说明 |
|------|------|
| `/health` | 健康检查 |
| `/metrics/prometheus` | Prometheus 指标 |
| `/`、`/index.html` | Dashboard 首页 |
| `/assets/*`、`/bee.svg` | 静态资源 |

### 请求示例

```bash
# Bearer Token 方式
curl -H "Authorization: Bearer bk_abc123..." http://localhost:3000/api/status

# X-API-Key 方式
curl -H "X-API-Key: bk_abc123..." http://localhost:3000/api/status

# WebSocket 连接
wscat -c "ws://localhost:3000/ws?token=bk_abc123..."
```

**未认证响应**: 401

```json
{ "error": "Unauthorized", "message": "Missing or invalid API key" }
```

---

## 健康检查

### `GET /health`

**源码**: `packages/server/src/api/health.ts`

生产就绪的健康检查端点，可用于 Docker / Kubernetes 存活探针。

**响应示例**:

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "version": "0.1.0",
  "tick": 42
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `string` | 始终为 `"ok"` |
| `uptime` | `number` | 服务器运行时间（秒） |
| `version` | `string` | 版本号 |
| `tick` | `number` | 当前世界引擎 tick 数 |

---

## 世界状态

### `GET /api/status`

**源码**: `packages/server/src/api/status.ts`

返回世界引擎的实时状态概览。

**响应示例**:

```json
{
  "tick": 42,
  "agentCount": 15,
  "activeAgents": 12,
  "sentiment": 0.35,
  "activeEvents": 3,
  "lastTick": { ... },
  "wsConnections": 2,
  "uptime": 3600.5,
  "running": true
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `tick` | `number` | 当前 tick |
| `agentCount` | `number` | 总 Agent 数 |
| `activeAgents` | `number` | 活跃 Agent 数（状态为 `active`） |
| `sentiment` | `number` | 世界情绪值 |
| `activeEvents` | `number` | 当前活跃事件数 |
| `lastTick` | `TickResult \| null` | 最后一次 tick 的结果对象 |
| `wsConnections` | `number` | 当前 WebSocket 连接数 |
| `uptime` | `number` | 服务器运行时间（秒） |
| `running` | `boolean` | 引擎是否正在运行 |

---

## Agent 管理

### `GET /api/agents`

**源码**: `packages/server/src/api/agents.ts`

分页获取 Agent 列表，按 `influence` 降序排列。

**Query 参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | `string` | `"1"` | 页码（最小 1） |
| `size` | `string` | `"20"` | 每页数量（1–100） |

**响应示例**:

```json
{
  "agents": [
    {
      "id": "agent-abc123",
      "name": "王小明",
      "profession": "金融分析师",
      "status": "active",
      "influence": 0.85,
      "credibility": 0.72,
      "modelTier": "strong",
      "followers": 5,
      "following": 3,
      "lastActiveTick": 41
    }
  ],
  "page": 1,
  "size": 20,
  "total": 15,
  "pages": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `agents` | `AgentSummary[]` | Agent 摘要列表 |
| `page` | `number` | 当前页码 |
| `size` | `number` | 每页数量 |
| `total` | `number` | 总 Agent 数 |
| `pages` | `number` | 总页数 |

**AgentSummary 字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Agent 唯一 ID |
| `name` | `string` | Agent 名称 |
| `profession` | `string` | 职业 |
| `status` | `AgentStatus` | 状态：`active` / `dormant` / `dead` |
| `influence` | `number` | 影响力 (0–1) |
| `credibility` | `number` | 可信度 (0–1) |
| `modelTier` | `ModelTier` | 模型层级：`local` / `cheap` / `strong` |
| `followers` | `number` | 粉丝数 |
| `following` | `number` | 关注数 |
| `lastActiveTick` | `number` | 上次活跃的 tick |

---

### `GET /api/agents/:id`

**源码**: `packages/server/src/api/agents.ts`

获取单个 Agent 的完整数据。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Agent ID |

**成功响应**: 200 — 完整的 Agent 数据对象（通过 `agent.toData()` 序列化）

**错误响应**: 404

```json
{ "error": "Agent not found" }
```

---

## 事件注入

### `POST /api/events`

**源码**: `packages/server/src/api/events.ts`

向世界引擎注入一个新事件。注入后会通过 WebSocket 广播 `event_injected` 消息。

**请求体**:

```json
{
  "title": "央行宣布加息25个基点",
  "content": "中国人民银行今日宣布上调基准利率 25 个基点...",
  "category": "finance",
  "importance": 0.8,
  "propagationRadius": 0.6,
  "tags": ["金融", "加息", "利率"]
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | `string` | ✅ | — | 事件标题 |
| `content` | `string` | ✅ | — | 事件详细内容 |
| `category` | `EventCategory` | ❌ | `"general"` | 分类：`finance` / `politics` / `tech` / `social` / `general` |
| `importance` | `number` | ❌ | `0.6` | 重要性 (0–1) |
| `propagationRadius` | `number` | ❌ | `0.5` | 传播半径 (0–1) |
| `tags` | `string[]` | ❌ | `[]` | 事件标签 |

**成功响应**: 200

```json
{
  "ok": true,
  "event": { ... }
}
```

**错误响应**: 400

```json
{ "error": "title and content are required" }
```

---

## 共识引擎

### `GET /api/consensus`

**源码**: `packages/server/src/api/consensus.ts`

获取共识信号数据。不带 `topic` 参数时返回所有主题概览；带 `topic` 参数时返回该主题的历史信号。

**Query 参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `topic` | `string` | — | 指定主题。省略则返回主题概览 |
| `limit` | `string` | `"20"` | 返回数量上限（最大 50） |

**响应（无 topic）**:

```json
{
  "topics": ["interest-rate", "tech-stock"],
  "latest": [ ... ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `topics` | `string[]` | 所有主题列表 |
| `latest` | `ConsensusSignal[]` | 最新的共识信号 |

**响应（有 topic）**:

```json
{
  "topic": "interest-rate",
  "signals": [ ... ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `topic` | `string` | 请求的主题名 |
| `signals` | `ConsensusSignal[]` | 该主题的历史信号（取最近 `limit` 条） |

---

## Tick 历史

### `GET /api/history`

**源码**: `packages/server/src/api/history.ts`

获取 tick 执行历史。优先从 SQLite 数据库读取，数据库为空时从内存 fallback。

**Query 参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | `string` | `"50"` | 返回条数上限（最大 200） |

**响应示例**:

```json
{
  "history": [
    {
      "tick": 1,
      "durationMs": 1200,
      "eventsProcessed": 2,
      "agentsActivated": 8,
      "responsesCollected": 6,
      "signals": 1
    }
  ],
  "source": "db"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `history` | `TickResult[]` | Tick 结果列表 |
| `source` | `"db" \| "memory"` | 数据来源 |

---

## 场景推演

### `POST /api/scenario`

**源码**: `packages/server/src/api/scenario.ts`

创建隔离的 WorldEngine 实例进行场景推演，不影响主世界状态。

**请求体**:

```json
{
  "seedEvent": {
    "title": "某科技巨头宣布大规模裁员",
    "content": "今日某科技公司宣布裁员 10000 人...",
    "category": "tech",
    "importance": 0.9,
    "tags": ["科技", "裁员"]
  },
  "agentCount": 20,
  "ticks": 10
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `seedEvent.title` | `string` | ✅ | — | 种子事件标题 |
| `seedEvent.content` | `string` | ✅ | — | 种子事件内容 |
| `seedEvent.category` | `EventCategory` | ❌ | `"general"` | 事件分类 |
| `seedEvent.importance` | `number` | ❌ | `0.8` | 重要性 |
| `seedEvent.tags` | `string[]` | ❌ | `["scenario"]` | 标签 |
| `agentCount` | `number` | ❌ | `10` | Agent 数量（最大 50） |
| `ticks` | `number` | ❌ | `5` | 推演轮数（最大 20） |

**成功响应**: 200

```json
{
  "scenario": "某科技巨头宣布大规模裁员",
  "agentCount": 20,
  "ticks": [ ... ],
  "consensus": [ ... ],
  "agents": [
    {
      "name": "张三",
      "profession": "散户投资者",
      "status": "active"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `scenario` | `string` | 场景标题（即种子事件标题） |
| `agentCount` | `number` | 实际生成的 Agent 数 |
| `ticks` | `TickResult[]` | 每轮 tick 的结果 |
| `consensus` | `ConsensusSignal[]` | 推演结束时的共识信号 |
| `agents` | `AgentBrief[]` | 参与推演的 Agent 列表 |

**错误响应**: 400

```json
{ "error": "seedEvent.title and seedEvent.content required" }
```

```json
{ "error": "max 20 ticks per scenario" }
```

---

## 用户推演（Forecast）

### `POST /api/forecast`

**源码**: `packages/server/src/api/forecast.ts`

用户输入式推演端点。输入一段事件/问题描述，系统自动匹配场景模板，创建隔离的 WorldEngine 实例执行多轮推演，返回派系分析、风险点和行动建议。

**请求体**:

```json
{
  "event": "央行宣布降息 25 个基点",
  "scenario": "hot-event",
  "ticks": 4,
  "importance": 0.85
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `event` | `string` | ✅ | — | 要推演的事件描述（`minLength: 1`） |
| `scenario` | `ForecastScenarioKey` | ❌ | `"hot-event"` | 场景类型 |
| `ticks` | `integer` | ❌ | `4` | 推演轮数（1–8） |
| `importance` | `number` | ❌ | 由场景决定 | 事件重要性（0.1–1） |

**ForecastScenarioKey 枚举**:

| 值 | 说明 |
|----|------|
| `hot-event` | 热点事件预测 |
| `product-launch` | 产品发布预演 |
| `policy-impact` | 政策影响评估 |
| `roundtable` | AI 圆桌讨论 |

**成功响应**: 200

```json
{
  "scenario": "hot-event",
  "scenarioLabel": "热点事件预测",
  "event": "央行宣布降息 25 个基点",
  "summary": "在"热点事件预测"场景下，系统为…创建了 25 个角色并运行 4 轮推演…",
  "factions": [
    { "name": "散户投资者", "share": 40, "summary": "散户投资者（约 10 个 Agent）会率先放大讨论热度…" }
  ],
  "keyReactions": [
    { "actor": "散户投资者", "reaction": "会先表达态度，并影响同类群体的初始判断" }
  ],
  "risks": ["围绕"央行宣布降息"的情绪会先于事实校验扩散", "..."],
  "recommendations": ["优先跟踪最先扩散观点的群体", "..."],
  "metrics": {
    "agentCount": 25,
    "ticks": 4,
    "responsesCollected": 80,
    "averageActivatedAgents": 20,
    "consensusSignals": 3,
    "finalTick": 4
  },
  "raw": {
    "ticks": [ ... ],
    "consensus": [ ... ]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `scenario` | `string` | 场景 key |
| `scenarioLabel` | `string` | 场景中文名 |
| `event` | `string` | 原始事件文本 |
| `summary` | `string` | 自然语言推演摘要 |
| `factions` | `Faction[]` | 主要阵营分析 |
| `keyReactions` | `Reaction[]` | 关键反应描述 |
| `risks` | `string[]` | 风险预警 |
| `recommendations` | `string[]` | 行动建议 |
| `metrics` | `object` | 执行指标 |
| `raw` | `object` | 原始 tick 和共识数据 |

**错误响应**: 400 — 缺少 `event`、无效 `scenario`、`ticks` 超范围

```json
{ "error": "event required" }
```

**错误响应**: 500 — 推演引擎运行时错误

```json
{ "error": "forecast engine failed at tick 2: ..." }
```

---

## LLM 配置管理

### `GET /api/config/llm`

**源码**: `packages/server/src/api/config.ts`

获取当前 LLM 配置（apiKey 已脱敏）。

**响应示例**:

```json
{
  "local": {
    "baseURL": "http://localhost:11434",
    "apiKey": "no-k****",
    "model": "qwen2.5:7b"
  },
  "cheap": { ... },
  "strong": { ... }
}
```

---

### `PUT /api/config/llm`

**源码**: `packages/server/src/api/config.ts`

更新所有 tier 的 LLM 配置。配置会持久化到 SQLite 数据库。

**请求体**:

```json
{
  "local": {
    "baseURL": "http://localhost:11434",
    "apiKey": "no-key",
    "model": "qwen2.5:7b",
    "maxTokens": 2048,
    "temperature": 0.7
  },
  "cheap": { ... },
  "strong": { ... }
}
```

每个 tier 的字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baseURL` | `string` | ✅ | API 基础 URL |
| `apiKey` | `string` | ✅ | API Key |
| `model` | `string` | ✅ | 模型名称 |
| `maxTokens` | `number` | ❌ | 最大 token 数（正数） |
| `temperature` | `number` | ❌ | 温度参数（0–2） |

**成功响应**: 200

```json
{
  "ok": true,
  "config": { "local": { ... }, "cheap": { ... }, "strong": { ... } }
}
```

**错误响应**: 400 — 缺少 tier 或字段校验失败

---

### `PUT /api/config/llm/:tier`

**源码**: `packages/server/src/api/config.ts`

更新单个 tier 的 LLM 配置。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `tier` | `string` | 模型层级：`local` / `cheap` / `strong` |

**请求体**: 同单个 tier 的配置对象（见上方表格）。

**成功响应**: 200

```json
{
  "ok": true,
  "tier": "local",
  "config": { "local": { ... }, "cheap": { ... }, "strong": { ... } }
}
```

**错误响应**: 400

```json
{ "error": "Invalid tier: xxx. Must be one of: local, cheap, strong" }
```

---

## Webhook 管理

### `POST /api/webhooks`

**源码**: `packages/server/src/api/webhooks.ts`

注册新的 Webhook 订阅。创建后会自动生成唯一 ID 和 secret（若未指定）。

**请求体**:

```json
{
  "url": "https://example.com/webhook",
  "events": ["consensus.signal", "trend.detected"],
  "secret": "my-custom-secret"
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | `string` | ✅ | — | Webhook 回调 URL |
| `events` | `string[]` | ✅ | — | 订阅的事件类型列表 |
| `secret` | `string` | ❌ | 自动生成 | 用于签名验证的密钥 |

**可订阅事件类型**:

| 事件类型 | 说明 |
|----------|------|
| `consensus.signal` | 产生新的共识信号 |
| `trend.detected` | 检测到新趋势 |
| `trend.shift` | 趋势发生变化 |
| `agent.spawned` | 新 Agent 孵化 |
| `tick.completed` | Tick 完成 |

**成功响应**: 201

```json
{
  "ok": true,
  "webhook": {
    "id": "wh_a1b2c3d4e5f67890",
    "url": "https://example.com/webhook",
    "events": ["consensus.signal", "trend.detected"],
    "secret": "abcdef1234567890...",
    "active": true,
    "createdAt": 1710000000
  }
}
```

**错误响应**: 400

```json
{ "error": "url is required" }
```

```json
{ "error": "events array is required and must not be empty" }
```

```json
{ "error": "Invalid event types: foo. Valid types: consensus.signal, trend.detected, trend.shift, agent.spawned, tick.completed" }
```

---

### `GET /api/webhooks`

**源码**: `packages/server/src/api/webhooks.ts`

获取所有已注册的 Webhook 列表。secret 字段仅返回前 6 位 + 掩码。

**响应示例**:

```json
{
  "webhooks": [
    {
      "id": "wh_a1b2c3d4e5f67890",
      "url": "https://example.com/webhook",
      "events": ["consensus.signal"],
      "secret": "abcdef••••••",
      "active": true,
      "createdAt": 1710000000
    }
  ],
  "total": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `webhooks` | `Webhook[]` | Webhook 列表（secret 已脱敏） |
| `total` | `number` | 总数 |

---

### `PUT /api/webhooks/:id`

**源码**: `packages/server/src/api/webhooks.ts`

更新已有 Webhook 的配置。所有字段均为可选，仅更新传入的字段。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Webhook ID |

**请求体**:

```json
{
  "url": "https://new-endpoint.com/hook",
  "events": ["tick.completed"],
  "active": false
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | ❌ | 新的回调 URL |
| `events` | `string[]` | ❌ | 新的事件类型列表 |
| `active` | `boolean` | ❌ | 是否启用 |

**成功响应**: 200

```json
{
  "ok": true,
  "webhook": { ... }
}
```

**错误响应**: 404

```json
{ "error": "Webhook not found" }
```

**错误响应**: 400

```json
{ "error": "events array must not be empty" }
```

---

### `DELETE /api/webhooks/:id`

**源码**: `packages/server/src/api/webhooks.ts`

删除指定 Webhook。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Webhook ID |

**成功响应**: 200

```json
{ "ok": true }
```

**错误响应**: 404

```json
{ "error": "Webhook not found" }
```

---

### `POST /api/webhooks/:id/test`

**源码**: `packages/server/src/api/webhooks.ts`

向指定 Webhook 发送测试 payload，验证回调端点是否可达。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Webhook ID |

**成功响应**: 200

```json
{
  "ok": true,
  "delivery": {
    "status": "success",
    ...
  }
}
```

**错误响应**: 404

```json
{ "error": "Webhook not found" }
```

**错误响应**: 503

```json
{ "error": "Webhook dispatcher not available" }
```

---

## 数据源管理（Ingestion）

### `GET /api/ingestion`

**源码**: `packages/server/src/api/ingestion.ts`

获取所有 RSS 数据源的状态汇总。

**响应示例**:

```json
{
  "enabled": true,
  "sources": [
    {
      "id": "reuters-finance",
      "name": "Reuters Finance",
      "url": "https://feeds.reuters.com/finance",
      "enabled": true,
      "lastPoll": 1710000000,
      "itemsIngested": 42
    }
  ]
}
```

**错误响应**: 503

```json
{ "error": "EventIngestion not available" }
```

---

### `GET /api/ingestion/sources/:sourceId`

**源码**: `packages/server/src/api/ingestion.ts`

获取单个 RSS 数据源的详细状态。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `sourceId` | `string` | 数据源 ID |

**成功响应**: 200 — 数据源的详细状态对象

**错误响应**: 404

```json
{ "error": "Source \"reuters-finance\" not found" }
```

**错误响应**: 503

```json
{ "error": "EventIngestion not available" }
```

---

### `POST /api/ingestion/sources`

**源码**: `packages/server/src/api/ingestion.ts`

新增 RSS 数据源。同步持久化到数据库。

**请求体**:

```json
{
  "id": "reuters-finance",
  "name": "Reuters Finance",
  "url": "https://feeds.reuters.com/finance",
  "category": "finance",
  "tags": ["金融", "国际"],
  "pollIntervalMs": 300000,
  "enabled": true
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | `string` | ✅ | — | 数据源唯一标识 |
| `name` | `string` | ✅ | — | 数据源名称 |
| `url` | `string` | ✅ | — | RSS 订阅 URL |
| `category` | `EventCategory` | ❌ | `"general"` | 事件分类 |
| `tags` | `string[]` | ❌ | `[]` | 标签 |
| `pollIntervalMs` | `number` | ❌ | `300000` | 轮询间隔（毫秒） |
| `enabled` | `boolean` | ❌ | `true` | 是否启用 |

**成功响应**: 200

```json
{ "ok": true, "id": "reuters-finance" }
```

**错误响应**: 400

```json
{ "error": "id, name, url are required" }
```

**错误响应**: 503

```json
{ "error": "EventIngestion not available" }
```

---

### `PUT /api/ingestion/sources/:sourceId`

**源码**: `packages/server/src/api/ingestion.ts`

更新指定 RSS 数据源。未传入的字段保持原值（`category`、`tags`、`pollIntervalMs` 除外，它们回落到默认值）。同步持久化到数据库。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `sourceId` | `string` | 数据源 ID |

**请求体**:

```json
{
  "name": "Reuters Finance v2",
  "url": "https://feeds.reuters.com/finance/v2",
  "category": "finance",
  "enabled": false
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | ❌ | 数据源名称 |
| `url` | `string` | ❌ | RSS 订阅 URL |
| `category` | `EventCategory` | ❌ | 事件分类（默认 `"general"`） |
| `tags` | `string[]` | ❌ | 标签（默认 `[]`） |
| `pollIntervalMs` | `number` | ❌ | 轮询间隔（默认 `300000`） |
| `enabled` | `boolean` | ❌ | 是否启用 |

**成功响应**: 200

```json
{ "ok": true, "id": "reuters-finance" }
```

**错误响应**: 404

```json
{ "error": "Source \"reuters-finance\" not found" }
```

**错误响应**: 503

```json
{ "error": "EventIngestion not available" }
```

---

### `DELETE /api/ingestion/sources/:sourceId`

**源码**: `packages/server/src/api/ingestion.ts`

删除指定 RSS 数据源。同步从数据库移除。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `sourceId` | `string` | 数据源 ID |

**成功响应**: 200

```json
{ "ok": true, "deleted": "reuters-finance" }
```

**错误响应**: 404

```json
{ "error": "Source \"reuters-finance\" not found" }
```

**错误响应**: 503

```json
{ "error": "EventIngestion not available" }
```

---

## API Key 管理

### `POST /api/keys`

**源码**: `packages/server/src/api/keys.ts`

创建新的 API Key。明文密钥仅在创建时返回一次，后续无法再获取。密钥格式为 `bk_` 前缀 + 48 位 hex 随机字符串。

**请求体**:

```json
{
  "name": "Dashboard 集成",
  "permissions": ["read", "write"],
  "rateLimit": 100
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | ✅ | — | 密钥名称 |
| `permissions` | `string[]` | ❌ | `["read", "write"]` | 权限列表 |
| `rateLimit` | `number` | ❌ | `100` | 速率限制（次/分钟） |

**成功响应**: 200

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Dashboard 集成",
  "key": "bk_a1b2c3d4e5f6...",
  "permissions": ["read", "write"],
  "rateLimit": 100,
  "message": "请妥善保存此 key，它不会再显示"
}
```

> ⚠️ **重要**: `key` 字段仅在此响应中返回，请务必安全保存。

**错误响应**: 400

```json
{ "error": "name is required" }
```

---

### `GET /api/keys`

**源码**: `packages/server/src/api/keys.ts`

列出所有 API Key 的元数据。不返回明文密钥或哈希值。

**响应示例**:

```json
{
  "keys": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Dashboard 集成",
      "permissions": ["read", "write"],
      "rateLimit": 100,
      "createdAt": 1710000000
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `keys` | `ApiKeyMeta[]` | API Key 元数据列表 |

---

### `DELETE /api/keys/:id`

**源码**: `packages/server/src/api/keys.ts`

删除指定 API Key，立即失效。

**URL 参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | API Key ID（UUID） |

**成功响应**: 200

```json
{ "ok": true, "deleted": "550e8400-e29b-41d4-a716-446655440000" }
```

**错误响应**: 404

```json
{ "error": "API key not found" }
```

---

## 运行时指标 (JSON)

### `GET /metrics`

**源码**: `packages/server/src/api/metrics.ts`

返回 JSON 格式的详细运行时指标。

**响应结构**:

```json
{
  "server": {
    "uptime": 3600,
    "uptimeFormatted": "1h 0m 0s",
    "nodeVersion": "v22.0.0",
    "pid": 12345
  },
  "engine": {
    "currentTick": 42,
    "running": true,
    "totalAgents": 15,
    "activeAgents": 12,
    "dormantAgents": 2,
    "deadAgents": 1
  },
  "performance": {
    "cache": {
      "size": 100,
      "hits": 500,
      "misses": 50,
      "hitRate": 0.909,
      "evictions": 10
    },
    "batchInference": {
      "totalRequests": 200,
      "succeeded": 195,
      "failed": 5,
      "totalRetries": 8,
      "avgDurationMs": 850
    },
    "activationPool": {
      "totalActivations": 100,
      "totalFiltered": 30,
      "totalAgentsActivated": 500,
      "avgActivated": 5,
      "avgFiltered": 0.3
    }
  },
  "events": {
    "activeEvents": 3,
    "totalEventsProcessed": 120,
    "totalResponsesCollected": 800
  },
  "llm": {
    "totalCalls": 200,
    "successRate": 0.975,
    "avgLatencyMs": 850
  },
  "consensus": {
    "totalSignals": 50,
    "latestSignalCount": 3,
    "topics": ["interest-rate", "tech-stock"]
  },
  "memory": {
    "rss": 104857600,
    "heapTotal": 67108864,
    "heapUsed": 52428800,
    "external": 1048576,
    "rssMB": "100.0",
    "heapUsedMB": "50.0"
  },
  "wsConnections": 2,
  "recentTicks": {
    "count": 42,
    "avgDurationMs": 1200,
    "avgEventsPerTick": 2.5,
    "avgResponsesPerTick": 8.3
  }
}
```

---

## Prometheus 指标

### `GET /metrics/prometheus`

**源码**: `packages/server/src/api/prometheus.ts`

返回 Prometheus text exposition format 指标，可直接接入 Prometheus + Grafana 监控栈。

**Content-Type**: `text/plain; version=0.0.4; charset=utf-8`

**暴露的指标**:

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `beeclaw_uptime_seconds` | gauge | 服务器运行时间（秒） |
| `beeclaw_current_tick` | gauge | 当前 tick |
| `beeclaw_agents_total` | gauge | 总 Agent 数 |
| `beeclaw_agents_active` | gauge | 活跃 Agent 数 |
| `beeclaw_agents_by_status{status}` | gauge | 按状态分组的 Agent 数 |
| `beeclaw_events_active` | gauge | 当前活跃事件数 |
| `beeclaw_events_processed_total` | counter | 已处理事件总数 |
| `beeclaw_responses_collected_total` | counter | 已收集响应总数 |
| `beeclaw_llm_calls_total` | counter | LLM 调用总数 |
| `beeclaw_llm_calls_succeeded` | counter | 成功的 LLM 调用 |
| `beeclaw_llm_calls_failed` | counter | 失败的 LLM 调用 |
| `beeclaw_llm_avg_duration_ms` | gauge | LLM 平均调用耗时（ms） |
| `beeclaw_cache_hits_total` | counter | 缓存命中总数 |
| `beeclaw_cache_misses_total` | counter | 缓存未命中总数 |
| `beeclaw_cache_hit_rate` | gauge | 缓存命中率 (0–1) |
| `beeclaw_tick_avg_duration_ms` | gauge | Tick 平均耗时（ms） |
| `beeclaw_consensus_signals_latest` | gauge | 最新共识信号数 |
| `beeclaw_ws_connections` | gauge | 当前 WebSocket 连接数 |
| `beeclaw_memory_rss_bytes` | gauge | RSS 内存（字节） |
| `beeclaw_memory_heap_used_bytes` | gauge | 已用堆内存（字节） |
| `beeclaw_memory_heap_total_bytes` | gauge | 总堆内存（字节） |

---

## WebSocket

### `GET /ws`

**源码**: `packages/server/src/ws/handler.ts`

WebSocket 端点，用于接收世界引擎的实时事件推送。

**连接后立即收到**:

```json
{ "type": "connected", "message": "🐝 BeeClaw WebSocket 已连接" }
```

**推送消息格式**:

```json
{
  "type": "<消息类型>",
  "data": { ... },
  "ts": 1710000000000
}
```

**消息类型**:

| type | 触发时机 | data 内容 |
|------|----------|-----------|
| `tick` | 每个 tick 完成后 | `TickResult` 对象 |
| `consensus` | 产生新共识信号时 | `ConsensusSignal[]` |
| `event_injected` | 通过 API 注入事件时 | `{ id, title }` |

**心跳机制**:

- 服务器每 **30 秒** 发送 `ping` 帧
- 客户端需响应 `pong` 帧
- 连续未响应则服务器主动断开连接

**连接管理**:

- 服务器优雅退出时会向所有客户端发送 close frame（code `1001`）
- 广播过程中 `send()` 失败的客户端会被自动清理

---

## Dashboard 静态资源

### `GET /`

**源码**: `packages/server/src/index.ts`

服务器通过 `@fastify/static` 提供 Dashboard SPA 静态资源。

- 根路径 `/` 指向 `packages/dashboard/dist`
- 非 API / WebSocket 路径 fallback 到 `index.html`（支持 SPA 客户端路由）

---

## 通用说明

### EventCategory 枚举

```
'finance' | 'politics' | 'tech' | 'social' | 'general'
```

### AgentStatus 枚举

```
'active' | 'dormant' | 'dead'
```

### ModelTier 枚举

```
'local' | 'cheap' | 'strong'
```
