# Changelog

## [0.5.0] - 2026-03-16

### 🔧 Robustness & Reliability

- **WebSocket:** 广播容错 — `send()` 失败自动清理断联客户端，不再静默忽略异常
- **WebSocket:** 心跳检测 — 30s 间隔 ping/pong 机制，自动淘汰无响应连接
- **WebSocket:** 优雅退出时关闭所有 WebSocket 连接
- **Dashboard:** WebSocket 重连改为指数退避策略（1s → 30s），限制最大重连 20 次
- **Dashboard:** WebSocket 消息解析失败记录 warn 日志而非完全静默
- **Server:** tick 循环防堆积 — 上一个 tick 未完成时跳过本轮，避免 `setInterval` 累积
- **Server:** tick 耗时超过间隔 80% 时输出预警日志
- **Server/CLI:** 优雅退出增加 10s 超时保护，防止 shutdown 卡死
- **Server/CLI:** 增加 SIGHUP 信号处理
- **EventIngestion:** RSS/Atom 网络请求增加指数退避重试（最多 3 次，1s → 4s）
- **EventIngestion:** 请求超时从 30s 调整为 20s
- **FinanceDataSource:** Yahoo Finance API 请求增加指数退避重试（最多 3 次）
- **WorldEngine:** `processTick` 单个事件处理失败不再中断整个 tick，记录错误后继续
- **WorldEngine:** 共识引擎分析失败增加 try-catch 保护

### 🧹 Code Quality

- 代码质量审查：错误处理完善、类型安全检查
- 全量测试覆盖 799+ tests passing

## [0.4.0] - 2026-03-15

### 🐛 Bug Fixes

- **Dashboard:** 修复 useWebSocket 测试的 WebSocket mock 问题
- **Dashboard:** 分离 vitest.config.ts 解决 jsdom 环境不被识别问题
- **Dashboard:** 使用 vite defineConfig + react plugin 修复 jsdom 测试环境
- **Server:** 注册 config route 到主应用引导流程

### 📝 Other

- Server 持久化层测试文件跟踪 (database.test.ts, store.test.ts, api helpers)
- 全量测试覆盖 799 tests passing

## [0.3.0] - 2026-03-13

### 🚀 New Features

- **ModelRouter** — 多模型路由支持，按 Agent 角色/场景选择不同 LLM provider
- **PersistenceStore 增强** — 持久化层改进 + config API 端点
- **Dashboard 集成** — Server 内置 Dashboard 静态文件服务 + SPA fallback (@fastify/static)

### 🐛 Bug Fixes

- 修复 Docker Compose LLM 环境变量名与 ModelRouter 实际读取不一致
- 修复 Dockerfile 构建问题 (tsconfig 路径、tsbuildinfo 缓存、依赖顺序)
- 修复 Dashboard 前端测试 (vitest/globals 类型引用、未使用 import)
- 修复 Docker 构建优化 + WorldState 类型
- 修复 vitest workspace 配置 + WebSocket 重连测试

### 📝 Other

- 添加 .env.example 环境变量配置模板
- 更新 README (server/dashboard/docker/配置文档)
- Dashboard vitest + jsdom 测试配置
- 全面测试覆盖 (750 tests passing)

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
