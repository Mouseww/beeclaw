# Changelog

## [0.7.0] - 2026-03-16

### 🔒 Server 生产加固

- **API 认证中间件** — 支持 Bearer token 认证
  - 环境变量 `BEECLAW_API_KEY` 设置 API key
  - 不设置则不启用认证（开发模式）
  - `/health` 和 `/metrics/prometheus` 不需要认证（给监控用）
  - 认证失败返回 401
- **CORS 中间件** — 基于 `@fastify/cors`
  - 环境变量 `BEECLAW_CORS_ORIGINS` 控制允许的域名（逗号分隔）
  - 默认允许所有来源（开发模式）
- **Rate Limiting** — 基于 `@fastify/rate-limit`
  - 默认 100 req/min
  - 环境变量 `BEECLAW_RATE_LIMIT` 可调整上限
  - `/health` 和 `/metrics/prometheus` 不受限速影响
- **请求日志增强** — 记录请求方法、路径、状态码、耗时
  - 按状态码分级输出（200 → log，4xx → warn，5xx → error）

### 🧪 Testing

- 新增 24 个中间件单元测试，覆盖 auth、CORS、rate-limit、request-logger

### ⚡ Performance

- **基准测试套件** — 新增 5 个基准测试覆盖核心模块
  - `agent-spawner.bench.ts` — Agent 孵化器性能基准
  - `consensus.bench.ts` — 共识引擎聚合性能基准
  - `event-bus.bench.ts` — 事件总线传播性能基准
  - `social-graph.bench.ts` — 社交网络图操作性能基准
  - `world-engine.bench.ts` — 世界引擎 tick 性能基准

### 📦 Dependencies

- 新增 `@fastify/cors` — CORS 跨域支持
- 新增 `@fastify/rate-limit` — 请求频率限制
- 统一 vitest 版本至 v4.1.0（全 workspace 一致）

### 📝 Documentation

- README 新增 CI badges、覆盖率脚本和完整文档链接

## [0.6.1] - 2026-03-16

### 🐛 Bug Fixes

- **修复 EventIngestion 测试不稳定** — 使用 fake timer advancement 替代真实超时

### 🧪 Testing

- 新增 event-ingestion 和 server WebSocket handler 测试
- 改进 metrics、TickScheduler、WorldEngine 测试覆盖率

### 🧹 Code Quality

- 修复 ESLint unused variable 警告
- 添加 `coverage/` 到 ESLint 忽略列表并修复 `no-unsafe-function-type` 错误

## [0.6.0] - 2026-03-16

### 🧪 Testing

- **E2E 集成测试** — 新增 5 个端到端测试套件，覆盖完整仿真流水线
  - `world-engine-tick.test.ts` — 世界引擎 tick 循环集成测试
  - `agent-lifecycle.test.ts` — Agent 全生命周期（孵化→进化→淘汰）集成测试
  - `cli-integration.test.ts` — CLI 命令集成测试
  - `server-api.test.ts` — Server REST API 端到端测试
  - `event-ingestion.test.ts` — 外部事件接入管道集成测试
- **包级测试补全** — 补充 shared、event-bus、server 包的单元测试
  - `shared/logger.test.ts` — 日志工具完整测试覆盖
  - `event-bus/index.test.ts` — 事件总线核心功能测试
  - `server/routes.test.ts` — API 路由处理器测试
- **测试基础设施** — 每个子包独立 `vitest.config.ts`，支持独立运行
- **E2E 测试配置** — 顶层 `vitest.config.e2e.ts` + 测试辅助工具
- 测试覆盖：73 e2e + 280 unit = **353 新增测试**，全项目总计 **~1150+ tests passing**

## [0.5.1] - 2026-03-16

### 📝 Documentation

- 新增 `docs/API.md` — 完整的 REST API 参考文档（所有端点、参数、响应格式）
- 新增 `docs/DEPLOYMENT.md` — 部署指南（Docker、环境变量、生产建议、监控、故障排查）
- 新增 `docs/DEVELOPMENT.md` — 开发者指南（项目结构、包依赖、测试约定、如何添加新包）

### 🧹 Code Quality

- 修复所有 ESLint 警告和错误（lint 全量清理）

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
