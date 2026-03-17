# BeeClaw — Phase 2 路线图

> Phase 1 (MVP) 已于 v1.0.14 完成，核心链路完整，1423 个测试全部通过。
> 本文档描述 Phase 2 的目标与计划。

---

## 1. PostgreSQL 支持（数据库抽象层） ✅

**目标：** 当前持久化层直接绑定 SQLite (better-sqlite3)。Phase 2 引入 `DatabaseAdapter` 接口抽象，使引擎可切换为 PostgreSQL 驱动，支持生产级高并发场景。

**关键步骤：**
1. 定义 `DatabaseAdapter` 接口，覆盖所有 Store 公共方法签名
2. 将现有 `Store` 重构为 `SqliteAdapter implements DatabaseAdapter`
3. 实现 `PostgresAdapter implements DatabaseAdapter`（基于 pg / postgres.js）
4. 通过配置或环境变量选择驱动（`BEECLAW_DB_DRIVER=sqlite|postgres`）
5. 迁移工具：提供 SQLite → PostgreSQL 一键数据迁移脚本

**注意事项：**
- PostgreSQL 使用参数化查询 `$1, $2` 而非 `?`
- 事务语义差异需要统一抽象
- 连接池管理（pg.Pool）
- JSON 字段可直接使用 `jsonb` 类型

---

## 2. Agent 持久化与恢复 ✅

**目标：** 服务器重启后 Agent 状态完整恢复，包括记忆、社交关系、信誉积分等，实现零数据丢失。

**关键步骤：**
1. Agent 记忆完整序列化（短期、长期、观点、预测记录）
2. Social Graph 边关系持久化（当前仅在内存中）
3. 增量保存：仅保存自上次快照以来变化的 Agent
4. 恢复校验：加载时验证数据完整性，损坏记录自动标记
5. WAL checkpoint 策略优化（SQLite）/ 事务隔离级别配置（PostgreSQL）

**验收标准：**
- 停机 → 重启后，所有 Agent 的记忆和关系完整恢复
- 恢复耗时不超过 Agent 数量 × 10ms

---

## 3. 水平扩展（分布式 Tick）

**目标：** 单节点 Agent 容量有限（受 LLM 并发限制），需要支持多节点分布式 tick 执行。

**关键步骤：**
1. Tick 协调器：基于 Redis 的分布式锁 + tick 编号分发
2. Agent 分片：按 Agent ID 哈希分配到不同 Worker 节点
3. 事件广播：跨节点事件同步（Redis Pub/Sub 或 NATS）
4. 共识聚合：各节点上报局部信号 → 协调器汇总全局共识
5. Social Graph 同步：跨节点关系查询（集中式存储 or 分布式缓存）

**架构方案：**
```
┌──────────────┐
│  Coordinator │  ← 分配 tick、汇总共识
│  (Redis Lock)│
└──────┬───────┘
       │
  ┌────┴────┬────────┐
  ▼         ▼        ▼
Worker-1  Worker-2  Worker-N   ← 各自运行一批 Agent
  │         │        │
  └────┬────┴────────┘
       ▼
   PostgreSQL (共享持久化)
```

---

## 4. 实时事件采集增强 ✅

**目标：** 当前仅支持 RSS 数据源。Phase 2 扩展至 Twitter/X、Reddit、新闻 API 等多渠道实时数据。

**新数据源：**
| 数据源 | 协议 | 更新频率 | 用途 |
|--------|------|----------|------|
| Twitter/X API | REST + Streaming | 实时 | 社交舆情、热点追踪 |
| Reddit API | REST (OAuth2) | 1-5 min | 社区讨论、情绪采集 |
| NewsAPI / GNews | REST | 15 min | 结构化新闻 |
| CoinGecko / Binance | WebSocket | 实时 | 加密货币行情 |
| Alpha Vantage | REST | 1 min | 股票/外汇行情 |

**关键步骤：**
1. 扩展 `EventIngestion` 支持插件化数据源适配器
2. 每种数据源实现独立 Adapter（认证、限流、格式转换）
3. 去重增强：跨数据源的内容相似度去重（标题 + 内容哈希）
4. 重要性评估改进：结合数据源权威度和内容分析
5. 数据源健康监控：连接状态、错误率、延迟指标

---

## 5. 预测信号 API 输出 ✅

**目标：** 将 Consensus Engine 的趋势分析结果以结构化 API 形式输出，供外部系统（交易策略、BI 工具、告警系统）消费。

**API 设计：**
```
GET  /api/signals/latest           → 最新信号列表
GET  /api/signals/topic/:topic     → 按 topic 查询信号历史
GET  /api/signals/trends           → 当前活跃趋势摘要
POST /api/signals/subscribe        → 订阅特定 topic 的信号推送（WebSocket）
GET  /api/signals/accuracy         → 预测准确性统计
```

**关键步骤：**
1. 信号标准化格式（JSON Schema 定义）
2. 信号评分：基于 Agent 信誉加权的可信度评分
3. 历史回测：信号与后续真实事件的对照验证
4. 信号聚合：多 topic 交叉分析、板块关联
5. 推送通道：WebSocket 实时推送 + Webhook 回调

---

## 6. Dashboard 增强 ✅

**目标：** 当前 Dashboard 提供基础状态展示。Phase 2 增加实时图表、Agent 详情面板、事件回放等高级功能。

**增强功能：**

### 6.1 实时图表 ✅
- 情绪趋势折线图（按 topic / 全局）
- Agent 活跃度热力图
- 事件传播动画（Social Graph 上的信息流）
- 共识强度仪表盘

### 6.2 Agent 详情面板 ✅
- 单个 Agent 的完整 profile（人格、记忆、历史观点）
- Agent 影响力排名（带趋势变化）
- Agent 关系图谱（以当前 Agent 为中心的子图）
- 历史预测准确性对比

### 6.3 事件回放 ✅
- 时间轴回放：按 tick 逐帧回放世界演化
- 事件级联可视化：从一个事件出发，追踪传播路径
- "假如…" 场景对比：同一初始条件下不同参数的结果对比

### 6.4 运维视图 ✅
- 系统资源监控（CPU、内存、LLM API 用量）
- 成本追踪面板（按 tier 统计 API 调用费用）
- 告警配置界面（异常 tick、Agent 异常死亡等）

---

## 优先级与依赖关系

```
Phase 2.1 — 基础设施层（前置依赖） ✅
  ├── DatabaseAdapter 接口抽象 ✅
  ├── PostgreSQL 驱动实现 ✅
  └── Agent 持久化完善 ✅

Phase 2.2 — 数据增强 ✅
  ├── 实时事件采集增强 ✅
  └── 预测信号 API ✅

Phase 2.3 — 可视化与扩展
  ├── Dashboard 增强 ✅
  └── 水平扩展 ⬜ (唯一未完成的 Phase 2 大项)
```

---

*BeeClaw v2.0 — 从 MVP 到生产级群体智能平台*
