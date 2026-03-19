# Changelog

## [1.0.51] - 2026-03-19

### 🧪 Tests

- **consensus:** 补齐 `ConsensusEngine` 趋势判定与 `SentimentAggregator` 阈值/零信誉边界测试，锁定当前实现语义并加固共识模块回归保护

---

## [1.0.50] - 2026-03-19

### 🐛 Bug Fixes

- **dashboard:** 保留 API 请求超时的原始 abort error 作为 `cause`，在满足 lint 约束的同时保住调试上下文，便于定位前端请求失败根因

---

## [1.0.49] - 2026-03-19

### 🐛 Bug Fixes

- **coordinator:** 修复 `request_snapshots` 消息中的 `agentIds` 在 Worker 侧被忽略的问题，定向快照请求现在会真正只导出并上报目标 Agent 状态，避免分布式快照协议语义漂移

### 🧪 Tests

- **coordinator:** 新增定向快照回归测试，覆盖直接调用与消息驱动 `request_snapshots` 两条路径，确保目标 Agent 过滤行为稳定

---

## [1.0.48] - 2026-03-19

### 🧪 Tests

- **coordinator:** 补齐 `RuntimeAgentExecutor` 快照导出路径测试，覆盖默认 changedFields、缺失 Agent、批量导出与 activated-only 分支，继续加固分布式协调核心路径回归保护

---

## [1.0.47] - 2026-03-19

### 🧪 Tests

- **event-ingestion:** 补齐 RSS retry backoff 边界测试，覆盖退避时序与失败恢复路径，继续加固事件接入层稳定性

### 🐛 Bug Fixes

- **shared:** 修复 `truncate` 在边界长度下的处理，避免截断逻辑出现异常结果

---

## [1.0.46] - 2026-03-19

### 🧪 Tests

- **event-ingestion:** 补齐 adapter API 流程测试，覆盖创建、查询、校验失败与错误分支，继续加固事件接入层的回归保护

---

## [1.0.45] - 2026-03-19

### 🧪 Tests

- **server:** 继续加固 persistence store 的批量保存与信号查询边界测试，覆盖空批次、覆盖写入、tick 单点范围、反向区间与 latest-per-topic 语义
- **dashboard:** 补齐 API client 超时与异常恢复测试，并同步收敛客户端超时处理逻辑，提升前端请求失败场景稳定性

### 🐛 Bug Fixes

- **dashboard:** 保留 API 请求超时的原始 abort error 作为 `cause`，在满足 lint 约束的同时保住调试上下文，便于定位前端请求失败根因

---

## [1.0.44] - 2026-03-19

### 🧪 Tests

- **server:** 补齐 persistence store 的批量保存与信号查询边界测试，覆盖空批次、覆盖写入、tick 单点范围、反向区间与 latest-per-topic 语义
- **dashboard:** 补齐 API client 超时与异常恢复测试，并同步收敛客户端超时处理逻辑，提升前端请求失败场景稳定性

---

## [1.0.43] - 2026-03-19

### 🧪 Tests

- **consensus:** 补齐 `ConsensusEngine` 信号恢复历史路径测试，覆盖 restoration history 在信号汇总与回溯场景下的稳定性

---

## [1.0.42] - 2026-03-19

### 🧹 Maintenance

- **tests:** 清理测试代码 lint warning，统一若干测试文件中的细节写法，保持发布分支无额外告警

---

## [1.0.41] - 2026-03-19

### 🧪 Tests

- **consensus:** 补齐 `ConsensusEngine` 中 `targetSentiments` 聚合路径测试，覆盖 credibility 加权、标的归一化、排序及空 targets 降级行为

---

## [1.0.40] - 2026-03-18

### 🐛 Bug Fixes

- **docker:** 调整多阶段构建顺序，确保 `@beeclaw/coordinator` 在 `@beeclaw/agent-runtime` 之后构建，匹配真实 workspace 依赖关系并避免 Docker 镜像构建阶段的依赖顺序问题

---

## [1.0.39] - 2026-03-18

### ✨ Features

- **forecast:** 完善 direct answer 输出链路，统一 API schema、服务端返回与 Dashboard 展示，提升直接问答型推演结果可用性
- **coordinator:** 新增 Agent 状态快照导出与聚合机制，Worker 执行后的 memory / opinions / credibility 等状态现在可以回传并持久化

### 🐛 Bug Fixes

- **dashboard:** 清理 TimelineReplay 测试中的 React `act()` warning，稳定异步渲染与断言时序

### 🧪 Tests

- **forecast:** 补充 direct answer 回归测试，覆盖 API 与前端展示一致性
- **coordinator:** 新增 AgentStateSnapshot 测试，覆盖快照生成、收集、上报与集成路径

---

## [1.0.38] - 2026-03-18

### ✨ Features

- **coordinator:** 用 `RuntimeAgentExecutor` 替换分布式 worker 中的 stub executor，让 worker 真正执行 Agent 任务而不再只是占位实现
- **coordinator:** 导出 `RuntimeAgentExecutor` 并更新 worker entry，完善分布式运行时的可用性与可测试性

### 🧪 Tests

- **coordinator:** 新增 `RuntimeAgentExecutor` 测试，覆盖真实执行路径与 worker 集成入口

---

# Changelog

### ✨ Features

- **deploy:** 新增完整 Kubernetes 部署清单，覆盖 namespace、configmap、secret、RBAC、API/dashboard/coordinator/worker、ingress 与 PVC，支持更完整的生产环境落地
- **distributed:** 新增独立 worker 入口、K8s probes 与生产监控接入，完善分布式部署运行模型
- **dashboard:** 新增移动端响应式侧边栏、导航打磨，并优化 Forecast 页面体验

### 📝 Documentation

- **ops:** 补充 Alertmanager 配置、RUNBOOK 与 deployment verification，完善生产运维与发布检查文档

---

# Changelog

## [1.0.36] - 2026-03-18

### 📝 Documentation

- **docs(ops):** 新增生产运维指南，补充可执行部署配置，便于上线、巡检与日常运维

---

## [1.0.35] - 2026-03-18

### ✨ Features

- **server:** 新增 `POST /api/forecast` 端点，支持用户输入式推演，自动匹配场景模板（热点事件/产品发布/政策影响/AI圆桌），返回派系分析、风险预警与行动建议
- **dashboard:** 新增 `ForecastPage` 推演页面，含场景选择、轮数滑块、结果展示（阵营/反应/风险/建议）

### 🐛 Bug Fixes

- **server:** forecast API 增加 `try/catch`，引擎运行时异常现在返回 `500` 而非 unhandled rejection
- **dashboard:** `forecastScenario` 客户端改进错误消息，从服务端 JSON body 提取详细错误而非仅返回 HTTP 状态码

### 📝 Documentation

- **docs:** `API.md` 补充完整的 `POST /api/forecast` 端点文档（请求参数、响应结构、错误码）

### 🧪 Tests

- **server:** 新增 forecast API 测试 13 项，覆盖全部场景类型、参数默认值、边界验证与错误处理
- **dashboard:** 新增 Forecast 页面与 API client 测试，覆盖页面渲染、交互、loading、错误处理与路由导航

### 🔧 Types

- **dashboard:** `ForecastResult` 类型补充缺失的 `raw` 字段（`ticks` + `consensus`），与服务端响应对齐

---

## [1.0.34] - 2026-03-18

### ✨ Features

- **server:** 新增 `POST /api/forecast` 端点，支持用户输入式推演，自动匹配场景模板（热点事件/产品发布/政策影响/AI圆桌），返回派系分析、风险预警与行动建议
- **dashboard:** 新增 `ForecastPage` 推演页面，含场景选择、轮数滑块、结果展示（阵营/反应/风险/建议）

### 🐛 Bug Fixes

- **server:** forecast API 增加 `try/catch`，引擎运行时异常现在返回 `500` 而非 unhandled rejection
- **dashboard:** `forecastScenario` 客户端改进错误消息，从服务端 JSON body 提取详细错误而非仅返回 HTTP 状态码

### 📝 Documentation

- **docs:** `API.md` 补充完整的 `POST /api/forecast` 端点文档（请求参数、响应结构、错误码）

### 🧪 Tests

- **server:** 新增 forecast API 测试 13 项，覆盖全部场景类型、参数默认值、边界验证与错误处理

### 🔧 Types

- **dashboard:** `ForecastResult` 类型补充缺失的 `raw` 字段（`ticks` + `consensus`），与服务端响应对齐

---

## [1.0.33] - 2026-03-18

### ✨ Features

- **coordinator:** 新增 `NATSTransportLayer` 高性能传输层，支持基于 NATS 的跨节点消息发布/订阅、请求/响应与主题隔离
- **distributed docs:** 补全 NATS 分布式部署与使用指南，明确 Redis / NATS 的选型对比与集群前缀配置

### 🧪 Tests

- **coordinator:** 新增 `NATSTransportLayer` 全面测试覆盖，验证连接、订阅、请求响应与错误处理场景

---

## [1.0.32] - 2026-03-18

### 🐛 Bug Fixes

- **dashboard:** 修复 Timeline Replay 中事件响应筛选失效问题，按 `eventId` 精确过滤响应列表
- **config:** 对齐默认 `maxAgents` 配置语义，保持与 `v1.0.31` 的上限行为一致

### 🧪 Tests

- **dashboard:** 稳定前端交互测试，修复 `SocialGraphView` / `TimelineReplay` 的交互时序抖动与回归覆盖

---

## [1.0.31] - 2026-03-18

### 🐛 Bug Fixes

- **world-engine:** 在注册边界强制执行 `maxAgents` 上限，避免超配导致世界规模突破配置限制

### 🧪 Tests

- **server:** 提升路由测试稳定性，提前 hoist WebSocket handler mock，消除时序抖动

---

## [1.0.30] - 2026-03-18

### 🐛 Bug Fixes

- **Server Rate Limit:** `BEECLAW_RATE_LIMIT<=0` 现在会显式禁用限速，避免生产环境中将 `0` 误解释为立即触发限流
- **Server Rate Limit:** `BEECLAW_RATE_LIMIT` 非数字值现在会安全回退到默认值 `100 req/min`

### 🧪 Tests

- **Server Middleware:** 新增限速配置边界测试，覆盖 `0`、负数和非数字环境变量场景

---

## [1.0.28] - 2026-03-18

### 🧪 Tests

- **ModelRouter 覆盖增强** — 新增 145 行测试，覆盖 routing 策略边界场景
- **NaturalSelection 测试扩展** — 新增 230 行，覆盖淘汰/进化全流程
- **WorldState 测试** — 新增 70 行状态管理测试
- **CommunityDetection / Propagation** — social-graph 包函数覆盖率优化
- **TransportLayer 测试** — coordinator 包新增 316 行 Redis 传输层测试
- **ResponseCache 测试** — agent-runtime 缓存逻辑全覆盖
- 全项目 **2626 tests** 全部通过（105 测试文件），总覆盖率 **95.31%**

### 📦 Dependencies

- @types/node 25.5.0, typescript-eslint 8.57.1

---

## [1.0.27] - 2026-03-18

### 🧪 Tests

- **函数覆盖率提升** — coordinator、social-graph、world-engine 包函数级覆盖率优化
- **Lint 修复** — 解决所有 `Function` → typed signatures 的 lint 错误
- **SocialGraphView 全面测试** — 新增 1300+ 行、123 项前端组件测试
- **Coordinator 测试** — TickCoordinator + RedisTransport 测试覆盖
- 全项目 **2606 tests** 全部通过（105 测试文件），总覆盖率 **95.24%**

---

## [1.0.26] - 2026-03-18

### 🧪 Tests

- **Server API 测试** — 新增 server API 路由全面测试
- **WorldEngine 分布式测试** — 新增分布式模式初始化、Agent 分配等 11 项测试
- 总计新增 **407 行测试代码**，全项目 **2420 tests 全部通过**（104 测试文件）

---

## [1.0.25] - 2026-03-17

### 🐛 Bug Fixes

- **event-ingestion**: 添加 `adapterCount` 到 `getStatus()` 返回值
- **test**: 更新 IngestionStatus 测试包含 adapterCount 字段

### 🧹 Chores

- 修复测试文件中所有 lint 警告

---

## [1.0.24] - 2026-03-17

### 🧪 Tests

- **Coordinator 全面测试** — 新增 EventRelay、RedisTransport、SocialGraphSync 测试套件（+900 行）
- **AgentMemory 测试扩展** — 新增 425 行 AgentMemory 深度测试（记忆检索/压缩/优先级/上下文窗口）
- **Social Graph 测试** — 新增 CommunityDetection、Propagation、SocialGraph 测试（+513 行）
- **TickScheduler 测试** — 新增 105 行调度器测试
- **Webhook 测试修复** — backoff jitter 边界条件修复（<= 替代 <）
- 总计新增约 **1950 行测试代码**，全项目 **2249+ tests 全部通过**

---

## [1.0.23] - 2026-03-17

### ✨ Features

- **Prometheus + Grafana 监控栈** — 预配置的 `deploy/monitoring/` 监控部署，含 Prometheus scrape config、Grafana Dashboard（世界状态/LLM 调用/事件处理/内存/WebSocket 面板）
- **Docker Compose 监控 overlay** — `docker-compose.monitoring.yml` 一键启动完整监控栈

### 🐛 Bug Fixes

- **e2e 测试修复** — 持久化测试中异步 store 方法添加 await
- **Dockerfile 修复** — 添加 coordinator 包到 Docker 构建，支持分布式模式

### 🧪 Tests

- **Coordinator 路由测试** — 新增 `/api/coordinator` 路由测试，验证 v1.0.22 一致性

---

## [1.0.22] - 2026-03-17

### ✨ Features

- **SocialGraphSync 跨节点社交图同步** — coordinator 包新增 SocialGraphSync 模块，支持多节点间社交图数据的实时同步
- **Coordinator 集成** — 将分布式协调器集成到 world-engine、server 和 CLI，完善分布式部署链路

### 🧪 Tests

- **613 行新测试** — 新增 webhook、social-graph、distributed engine、world-engine 综合测试，大幅提升测试覆盖率

### 🐛 Bug Fixes

- **ESLint 全量修复** — 修复 coordinator 包和迁移测试中所有 ESLint 错误和警告

## [1.0.21] - 2026-03-17

### ✨ Features

- **分布式 Tick Coordinator** — 支持多 Worker 进程分布式执行 Tick，Agent 自动分区
- **Redis TransportLayer** — 基于 Redis Pub/Sub 的跨进程通信层
- **Worker 管理** — Worker 注册/心跳/故障转移机制
- **CLI 集成** — `beeclaw start --distributed` 命令支持分布式模式启动
- **Server API** — 新增 `/api/coordinator` 路由，查看 Worker 状态和分区信息

### 🧪 Tests

- TickCoordinator 测试（494 行）覆盖分区、调度、故障恢复
- RedisTransportLayer 测试（363 行）覆盖发布/订阅、连接管理
- WorldEngine 分布式模式集成测试（7 个 case）

## [1.0.20] - 2026-03-17

### 🧪 Tests

- **PostgreSQL Adapter 测试** — 92 个测试覆盖所有 CRUD 操作、事务、连接池管理
- **迁移脚本测试** — 41 个测试覆盖 SQLite → PostgreSQL 迁移全流程
- 导出迁移脚本内部函数以支持依赖注入测试

### 🐛 Bug Fixes

- 跳过空 tick 的广播/持久化（无事件时不做无用功）
- 清理 benchmark 中未使用的 ChatMessage import

## [1.0.19] - 2026-03-17

### ✨ Features

- **PostgreSQL Docker Compose** — 新增 `--profile postgres` 支持一键启动 PostgreSQL 模式
- **SQLite → PostgreSQL 数据迁移脚本** — `scripts/migrate-sqlite-to-postgres.ts` 支持自动数据迁移

### 🧹 Code Quality

- 清理 dashboard、event-ingestion、server 中的未使用导入和 lint 警告


## [1.0.18] - 2026-03-17

### ✨ Features

- **共识信号持久化恢复** — 重启不再丢失情绪数据，信号自动从 SQLite 恢复
- **Dashboard 实时图表** — 新增情绪趋势和 Agent 活跃度实时可视化图表

### ⚡ Performance

- **Dashboard 代码分割** — 实现路由级 lazy loading 和 vendor chunk 优化（react/d3/recharts 独立分包）

### 🐛 Bug Fixes

- **Dashboard:** 修复 TimelineReplay.tsx 三个 TS 编译错误
- **Event Ingestion:** 修复 Twitter/Reddit/NewsAPI 适配器测试中的多查询计数问题
- **Server:** 修复 9 个 server 测试失败

### 🧪 Tests

- **Dashboard:** 补全页面组件测试文件

## [1.0.17] - 2026-03-17

### ✨ Features

- **情绪系统升级** — Agent 情绪绑定具体标的（subject/target），支持按话题维度的情绪分布
- **Event Ingestion 增强** — 新增 ContentDeduplicator（内容去重）、FinanceAdapter、RssAdapter

### 🐛 Bug Fixes

- **Event Ingestion:** 修复 13 个失败测试
- **Consensus:** 修复全局情绪分布为空 + 增加按话题情绪分布

### 🧪 Tests

- **Server:** 新增 Signals API 综合测试

## [1.0.16] - 2026-03-17

### ✨ Features

- **PostgresAdapter** — Phase 2 PostgreSQL 数据库适配器实现
- **AgentStateRecovery** — Agent 状态恢复服务，多轮增量刷新
- **Signals API** — 新增 `/api/signals` 端点

### 🐛 Bug Fixes

- **Auth:** 修复 `isValidKey` 异步接口对齐
- **Persistence:** 修复 social graph 方法移回 SqliteAdapter 类

### 🧪 Tests

- 新增 AgentStateRecovery 多轮增量刷新周期测试

### 🧹 Code Quality

- 清理 store 和 server 测试格式

## [1.0.15] - 2026-03-17

### ⚡ Performance

- **Benchmarks:** 新增 agent-memory、batch-inference 综合性能基准测试，扩展 world-engine bench

### 🏗️ Architecture

- **DatabaseAdapter:** 新增数据库适配器接口，为 Phase 2 PostgreSQL 支持打基础
- **ROADMAP:** 完整的 Phase 2 路线图（PostgreSQL、Agent 持久化、分布式 Tick、实时 Dashboard 等）

## [1.0.14] - 2026-03-17

### 🧹 Code Quality

- **Lint:** 消除所有 lint 警告 — `any` 替换为 `unknown`，移除未使用的 import

### 📖 Documentation

- **API:** 补全 webhook、ingestion、API Key 端点文档和认证说明

## [1.0.13] - 2026-03-16

### ✨ Features

- **API Key Management:** 完整的 API 密钥管理功能（创建、列表、删除），支持密钥作用域和过期时间
- **Enhanced Auth:** 增强认证中间件，支持 API Key + Bearer Token 双模式认证
- **Tick Persistence:** Tick 事件和 Agent 响应持久化存储，重启后可恢复历史数据

### 🧪 Tests

- **Server:** 补全 API Key 管理路由（`/api/keys`）单元测试，覆盖 POST 创建、GET 列表、DELETE 删除及参数校验
- **Server:** 补全 config、events、health、metrics、prometheus、status 路由单元测试

## [1.0.12] - 2026-03-16

### 🧪 Tests

- **Server:** 补全 agents、consensus、scenario、history 路由单元测试

## [1.0.11] - 2026-03-16

### 🧪 Tests

- **Store Persistence:** 补全 events、responses、tick history 持久化存储测试

### 🧹 Code Quality

- **CLI:** 修复 `scenario.test.ts` lint warning（移除无效初始赋值），lint 零问题

## [1.0.10] - 2026-03-16

### 🧪 Tests

- **CLI:** 补全 `inject`、`scenario`、`status` 命令测试，覆盖参数解析、错误处理、输出格式
- **Agent Runtime:** 补全 `LLMClient` 单元测试，覆盖重试逻辑、超时处理、模型路由

## [1.0.9] - 2026-03-16

### 🚀 New Features

- **Server:** RSS 数据源 CRUD 持久化 — POST/PUT/DELETE `/api/ingestion/sources` 同步写入 SQLite 数据库

### 🧪 Tests

- **Ingestion API:** 补全 POST/PUT/DELETE 路由测试，覆盖正常 CRUD、参数校验（400）、源不存在（404）、无实例（503）等场景
- 验证 `store.saveRssSource` / `store.deleteRssSource` 被正确调用
- 验证 `ingestion.addSource` / `ingestion.removeSource` 调用顺序

## [1.0.8] - 2026-03-16

### 🐛 Bug Fixes

- **World Engine:** 导出 `TickEventSummary` 和 `TickResponseSummary` 类型，修复 server 包构建失败

## [1.0.7] - 2026-03-16

### 🐛 Bug Fixes

- **E2E Tests:** 修复 WebSocket 测试超时和连接数断言问题

### 🧹 Code Quality

- 移除 e2e 测试中未使用的 `beforeEach` import，lint 零警告

## [1.0.6] - 2026-03-16

### 🧹 Code Quality & Bug Fixes

- **Consensus & Ingestion API:** 替换 `any` 为正确类型定义，修复 lint 警告
- **Dashboard:** 对齐 EventFeed 测试文本与实际组件输出
- **Dashboard:** 同步 TickResult 类型定义与 world-engine（添加缺失字段）

## [1.0.5] - 2026-03-16

### 🧹 Code Quality

- **Dashboard:** 清除 AgentList 测试文件中的未使用 import (`within`, `userEvent`)，lint 零警告

## [1.0.4] - 2026-03-16

### 🐛 Bug Fixes

- **Dashboard:** 页面加载时从 REST API 预加载 tick 历史记录 (`91833e8`)
- **Event Ingestion:** 替换已被封锁的 Reuters RSS 源，改用 WSJ + CNBC (`88f0bb8`)

### 🧹 Code Quality

- 修复测试文件中的 lint 警告（未使用的 import、no-explicit-any）(`d571ea7`)

## [1.0.3] - 2026-03-16

### 🚀 New Features

- **Ingestion 状态 API** — `GET /api/ingestion` + `GET /api/ingestion/:sourceId`，返回 RSS/金融数据源实时运行指标 (`3fd2bc6`)
- **Dashboard 事件接入页** — 新增 `/ingestion` 监控页面，展示所有数据源状态、抓取量、发射量及错误信息，每 10 秒自动刷新 (`9b969dc`)

### 🧪 Tests

- 19 个新测试覆盖 Ingestion 状态查询逻辑和 API 路由

## [1.0.2] - 2026-03-16

### 🚀 New Features

- **RSS Event Ingestion 集成** — Server 启动时自动接入 5 个 RSS 源：Reuters (World/Tech/Business)、CNBC Top News、Hacker News Best (`73b59ad`)
- **智能重要性匹配** — 高/中优先级关键词自动识别，事件按重要性分级注入世界
- **混合模型层级 Agent** — 默认 Agent 配比：60% cheap、25% local、15% strong，更贴近真实群体
- **默认 Agent 数量提升** — 从 10 → 20，提供更丰富的群体动力学

### ⚙️ Configuration

- EventIngestion tick 与 WorldEngine 同步
- 优雅关闭时清理 EventIngestion 资源

## [1.0.1] - 2026-03-16

### 🚀 New Features

- **WebSocket 实时推送增强** — Tick 广播中流式传输 event/response 详细信息 (`4d06663`)
- **并发翻倍** — WorldEngine 并发从 5 提升到 10，提高 tick 吞吐 (`3fc63b4`)
- **markRunning API** — WorldEngine 新增 `markRunning()` 方法，Server 外部 tick 循环可正确管理引擎状态 (`3fc63b4`)

### 🐛 Bug Fixes

- 修复 store.ts 中 timestamp 类型转换错误 (`5cae621`)
- 修复 health 端点测试以匹配 v1.0.0 预期 (`54ee355`)
- 修复 Dashboard tick 显示中缺失时间戳的问题，并在 store 中添加时间戳映射 (`cefefd1`)

### ⚙️ Configuration

- 默认 tick 间隔从 30s 调整为 60s，提高稳定性 (`3fc63b4`)

### 🧹 Code Quality

- 清理 benchmarks 和 e2e 测试中未使用的变量 (`dee1a68`)

## [1.0.0] - 2026-03-16

### 🎉 首个正式版本发布

BeeClaw v1.0.0 标志着 **Phase 1-3 全部完成**，系统已具备完整的群体智能仿真能力。

### ✅ Phase 1 — 核心引擎

- **World Engine** — Tick 驱动的世界主循环，回合制状态管理
- **Agent Runtime** — 完整 LLM Agent，独立人格（AgentPersona）、短期/长期记忆（AgentMemory）、观点立场系统
- **Social Graph** — 动态社交网络，关系形成/传播算法/社区发现
- **Event Bus** — 事件分发与传播规则，手动注入 + Agent 响应级联
- **Consensus Engine** — 情绪聚合、趋势检测、多空比例分析
- **CLI** — 启动世界、注入事件、查看状态
- **Agent Spawner** — 模板孵化、事件触发/定时/手动生成

### ✅ Phase 2 — 可视化与进化

- **Event Ingestion** — 外部事件自动接入（RSS/Atom FeedParser、Yahoo Finance 行情、市场情绪推断）
- **Model Router** — 多模型分层路由（local/cheap/strong）
- **Dashboard** — React 可视化面板（世界总览、Agent 列表/详情、事件时间线、共识面板）
- **Social Graph 可视化** — D3.js 力导向图
- **记忆压缩** — LLM 驱动的长期记忆摘要
- **自然选择** — 信誉淘汰机制

### ✅ Phase 3 — 生产就绪

- **Server API** — Fastify REST API + WebSocket 实时推送 + SQLite 持久化
- **金融数据源** — Yahoo Finance + 加密货币 + 市场情绪分析
- **场景模板** — ScenarioRunner 多场景运行器（金融、舆论、产品测试）
- **性能优化** — BatchInference、ResponseCache、AgentActivationPool
- **生产加固** — API 认证（Bearer token）、CORS、Rate Limiting、请求日志增强
- **监控** — Health check、Prometheus metrics、结构化日志
- **OpenAPI Schema Validation** — 全路由 JSON Schema 校验 + Swagger UI 文档
- **部署** — Dockerfile + docker-compose.yml + GitHub Actions CI

### 🧪 测试

- 1150+ 测试通过（单元测试 + E2E 集成测试 + 基准测试）
- 5 个核心模块基准测试套件

### 🐛 Bug Fixes（自 v0.8.0）

- 修复 `setErrorHandler` 回调缺少 `FastifyError` 类型注解
- 修复 AgentDetail 测试 + webhook/schema 改进

## [0.8.0] - 2026-03-16

### 🚀 New Features

- **OpenAPI Schema Validation** — 为所有 API 路由添加 OpenAPI JSON Schema 校验
  - 集中定义所有端点的 request/response schema (`api/schemas.ts`)
  - Fastify 自动校验请求参数和响应格式
  - Swagger UI 文档自动生成 (`/docs`)
  - 覆盖 agents、events、consensus、history、scenario、config、webhooks、monitoring 等全部路由
- **Agent 详情页 (Dashboard)** — 新增 AgentDetail 页面，展示 Agent 完整信息
  - Persona（人格背景、性格特征、专业领域）
  - 记忆系统（短期记忆、长期记忆、观点立场）
  - 情绪状态与信誉度
  - 社交连接（粉丝/关注）
  - 从 Agent 列表页可点击进入详情

### 🧪 Testing

- 新增 AgentDetail 页面渲染测试
- 新增 App.tsx 路由测试（`/agents/:id`）

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
