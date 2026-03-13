# Changelog

## [0.2.0] - 2026-03-13

### 🚀 New Features

- **Server** — Fastify HTTP API + WebSocket + SQLite 持久化层 (`@beeclaw/server`)
  - RESTful API: agents, events, consensus, status, history, scenario
  - Health/metrics/prometheus 监控端点
  - 结构化 logger
  - WebSocket 实时推送 tick 结果
- **Dashboard** — React 可视化面板 (`@beeclaw/dashboard`)
  - 世界总览 (WorldOverview)
  - Agent 列表 + 详情 (AgentList)
  - 事件时间线 (EventFeed)
  - 共识面板 (ConsensusView)
  - Social Graph D3.js 力导向图可视化
- **Event Ingestion** — 外部事件接入 (`@beeclaw/event-ingestion`)
  - RSS/Atom FeedParser
  - FinanceDataSource (Yahoo Finance 行情)
  - MarketSentiment 市场情绪分析
  - ImportanceEvaluator 事件重要性评估
- **ScenarioRunner** — 场景模板运行器 + CLI `scenario` 命令
- **Performance** — BatchInference / ResponseCache / AgentActivationPool 性能优化
- **Deploy** — Dockerfile + docker-compose.yml + GitHub Actions CI

### 🐛 Bug Fixes

- 修复 NaturalSelection 缺少 lastActiveTick 导致的误淘汰
- 修复 CLI status.ts ESM 下 `__dirname` 未定义
- 修复 FeedParser Atom link 提取和 HTML 实体解码顺序
- 修复 FinanceDataSource getConfig 深拷贝和 poll 失败 lastError 追踪
- 修复 e2e 测试 (getStats + mock 响应)

### 📝 Other

- 架构文档更新 (Phase 2/3 进度标记)
- Agent.fromData 反序列化支持
- AgentSpawner.getRules() 方法
- 默认配置文件
- 全面测试覆盖 (665 tests passing)

## [0.1.0] - 2026-03-12

### Initial Release

- World Engine 核心 tick 主循环
- Agent Runtime (LLM Agent, persona, memory)
- Social Graph (关系网络, 传播算法, 社区发现)
- Event Bus (事件分发, 传播规则)
- Consensus Engine (情绪聚合, 趋势检测)
- CLI 基本命令 (start, inject, status)
