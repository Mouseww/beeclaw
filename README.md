# BeeClaw 🐝🔮

[![CI](https://github.com/Mouseww/beeclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/Mouseww/beeclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

> **BeeClaw** (又名 BeeWorld / 蜂蜂大世界) — 由完整 LLM Agent 组成的群体智能仿真引擎

一个持续运行的平行世界，数百到数千个**完整 LLM Agent** 在其中生活、交互、演化，通过群体行为涌现来预测现实世界的趋势。

## 核心特性

- 🧠 **完整 LLM Agent** — 每个 Agent 都有独立人格、记忆、社交关系和决策能力
- 🌍 **持续演化** — 不是跑一次就停的仿真，而是持续运行的平行世界
- 🐣 **动态孵化** — 新事件触发新 Agent 自动生成，模拟真实社会参与者涌入
- 🕸️ **社交网络** — Agent 之间的关系动态形成和演化，信息沿网络传播
- 📊 **共识提取** — 从群体分歧中提取趋势信号和预测
- 💰 **成本可控** — 模型分层 + 选择性激活 + 批量异步，架构层面控制开销

## 架构

```
外部事件 → World Engine → Event Bus → Agent Pool (完整 LLM)
              ↓                          ↓
         Tick 调度          Social Graph 传播
              ↓                          ↓
         Consensus Engine ← Agent 响应聚合
              ↓
         预测信号 / API 输出
```

## 六大核心模块

| 模块 | 职责 |
|------|------|
| **World Engine** | 回合制世界时钟，推进仿真主循环 |
| **Agent Runtime** | 完整 LLM Agent，含人格、记忆、观点系统 |
| **Agent Spawner** | 动态孵化，事件触发自动生成相关角色 |
| **Social Graph** | 动态社交网络，关系自然形成和演化 |
| **Event Bus** | 事件传播：外部注入 + Agent 产生 + 级联传播 |
| **Consensus Engine** | 从群体行为中提取趋势信号 |

## 安装

```bash
# 克隆仓库
git clone https://github.com/Mouseww/beeclaw.git
cd beeclaw

# 安装依赖（npm workspaces monorepo）
npm install

# 构建所有包
npm run build

# 运行测试
npm test
```

**环境要求：** Node.js >= 20（推荐 22），npm >= 9

## 快速开始

```bash
# 启动世界（10 个 Agent，默认配置）
npm run start

# 启动世界（指定 Agent 数量）
npm run start -- --agents 50

# 带种子事件启动
npm run start -- --agents 20 --ticks 5 --seed "央行宣布降息50个基点"

# 注入外部事件
npm run inject -- --event "央行宣布降息50个基点"

# 查看世界状态
npm run status
```

## CLI 用法

```
🐝 BeeClaw — 群体智能仿真引擎 CLI

用法:
  npm run start -- [选项]

选项:
  -a, --agents <数量>      初始 Agent 数量 (默认: 10)
  -i, --interval <毫秒>    Tick 间隔时间 (默认: 30000ms)
  -t, --ticks <数量>       最大运行 tick 数 (默认: 0=无限)
  -s, --seed <事件内容>    注入种子事件启动仿真
  -h, --help              显示帮助信息
```

**示例：**

```bash
# 运行 5 个 tick，20 个 Agent，注入金融事件
npm run start -- --agents 20 --ticks 5 --seed "美联储宣布加息25个基点"

# 无限运行模式（Ctrl+C 优雅停止）
npm run start -- --agents 100 --interval 60000
```

## 配置

复制 `.env.example` 为 `.env` 并根据需要修改：

```bash
cp .env.example .env
```

主要配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `BEECLAW_LLM_BASE_URL` | LLM API 地址 | `http://localhost:11434` |
| `BEECLAW_LLM_API_KEY` | LLM API Key | `no-key` |
| `BEECLAW_LOCAL_MODEL` | 本地模型 | `qwen2.5:7b` |
| `BEECLAW_STRONG_MODEL` | 强模型 | `qwen2.5:72b` |
| `BEECLAW_PORT` | Server 端口 | `3000` |
| `BEECLAW_DB_PATH` | SQLite 路径 | 空（内存模式） |

## Server & Dashboard

```bash
# 启动 HTTP API + WebSocket 服务
npm run serve

# 启动 Dashboard 开发模式
cd packages/dashboard && npm run dev
```

Server 提供：
- RESTful API — agents, events, consensus, status, scenario
- WebSocket — 实时推送 tick 结果
- Health check / Prometheus metrics — `/health`, `/metrics`

## Docker

```bash
# 构建镜像
docker build -t beeclaw .

# 默认模式 (SQLite)
docker compose up -d

# PostgreSQL 模式
docker compose --profile postgres up -d
```

### PostgreSQL 部署

使用 Docker Compose profiles 可一键切换到 PostgreSQL：

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 POSTGRES_PASSWORD 等

# 2. 启动 (PostgreSQL + Server)
docker compose --profile postgres up -d

# 3. 验证
curl http://localhost:3000/health

# 4. 查看日志
docker compose --profile postgres logs -f

# 5. 停止
docker compose --profile postgres down
```

> **注意**: `--profile postgres` 启动的是 `server-pg` 服务（自动连接 PostgreSQL），默认的 `server` 服务使用 SQLite。两者不会同时运行。

## 包结构

```
packages/
  shared/          - 共享类型、工具函数
  world-engine/    - 世界引擎（主循环、Tick 调度、世界状态、场景运行器）
  agent-runtime/   - Agent 运行时（人格、记忆、LLM 调用、孵化器、模型路由）
  social-graph/    - 社交网络（图结构、传播算法、社区发现）
  event-bus/       - 事件总线（事件分发、传播规则）
  consensus/       - 共识引擎（情绪聚合、趋势检测）
  event-ingestion/ - 外部事件接入（RSS/Atom、Yahoo Finance、市场情绪）
  server/          - HTTP API + WebSocket 服务（Fastify）
  dashboard/       - React 可视化面板（Vite + D3.js）
  cli/             - CLI 工具（启动、注入事件、查看状态、场景运行）
```

## 成本控制

不靠阉割 Agent，靠架构：

- **模型分层** — 50-60% 本地免费模型，30-40% 便宜云模型，5-10% 强模型
- **选择性激活** — 1000 Agent 每 tick 只唤醒 50-100 个
- **批量异步** — 并发请求，不需实时

## 变现场景

- 📈 金融市场情绪预测
- 📢 产品舆论推演
- 🏛️ 政策影响评估
- 🎯 营销策略测试

## 技术栈

- **语言：** TypeScript + Node.js（ES2022）
- **构建：** npm workspaces monorepo
- **存储：** SQLite（MVP，后期迁移 PostgreSQL）
- **LLM：** OpenAI 兼容 API（支持任意 provider）
- **测试：** Vitest

## 开发

```bash
# 安装依赖
npm install

# 构建所有包
npm run build

# 运行所有测试
npm test
```

## 文档

- [架构设计](docs/ARCHITECTURE.md)
- [API 参考](docs/API.md)
- [部署指南](docs/DEPLOYMENT.md)
- [生产运维手册](docs/OPERATIONS.md) — TLS、告警、备份、日志轮转、资源调优
- [开发者指南](docs/DEVELOPMENT.md)
- [更新日志](CHANGELOG.md)

## Monitoring（Prometheus + Grafana）

项目内置 Prometheus 指标端点 (`/metrics/prometheus`)，并提供预配置的监控栈：

```bash
# 启动监控栈（Prometheus + Grafana）
docker compose -f docker-compose.yml -f deploy/monitoring/docker-compose.monitoring.yml up -d
```

启动后访问：
- **Prometheus:** `http://localhost:9090`（指标查询 & 告警规则）
- **Grafana:** `http://localhost:3001`（默认账号 `admin` / `beeclaw`）

Grafana Dashboard 预置面板：

| 面板 | 指标 |
|------|------|
| 世界运行状态 | `beeclaw_current_tick`, `beeclaw_agents_total`, `beeclaw_agents_active`, `beeclaw_agents_by_status` |
| LLM 调用量与延迟 | `beeclaw_llm_calls_total`, `beeclaw_llm_calls_succeeded/failed`, `beeclaw_llm_avg_duration_ms` |
| 事件处理量 | `beeclaw_events_processed_total`, `beeclaw_responses_collected_total`, `beeclaw_events_active` |
| 内存使用 | `beeclaw_memory_rss_bytes`, `beeclaw_memory_heap_used_bytes`, `beeclaw_memory_heap_total_bytes` |
| WebSocket 连接 | `beeclaw_ws_connections` |
| 缓存性能 | `beeclaw_cache_hits_total`, `beeclaw_cache_misses_total`, `beeclaw_cache_hit_rate` |

配置文件位于 `deploy/monitoring/`：
- `prometheus.yml` — Prometheus 抓取配置 + 告警规则引用
- `alerting_rules.yml` — Prometheus 告警规则（服务可用性、LLM 失败率、内存、Tick 耗时等）
- `grafana-dashboard.json` — Grafana Dashboard 模板
- `docker-compose.monitoring.yml` — 监控服务编排
- `provisioning/` — Grafana 自动配置（数据源 + Dashboard Provider）

## Production Deployment

### 推荐架构

```
                    ┌─────────────┐
                    │  Nginx/LB   │  ← TLS 终止、反向代理
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         beeclaw-1    beeclaw-2    beeclaw-N   ← 分布式 Worker
              │            │            │
              └────────────┼────────────┘
                           ▼
                    ┌─────────────┐
                    │  PostgreSQL  │  ← 共享持久化
                    └─────────────┘
                    ┌─────────────┐
                    │    Redis     │  ← 分布式协调
                    └─────────────┘
         ┌──────────────────────────────────┐
         │  Prometheus → Grafana            │  ← 监控
         └──────────────────────────────────┘
```

### 部署步骤

```bash
# 1. PostgreSQL + 分布式模式 + 监控
docker compose \
  --profile postgres \
  --profile distributed \
  -f docker-compose.yml \
  -f deploy/monitoring/docker-compose.monitoring.yml \
  up -d --scale worker=3

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置：
#   POSTGRES_PASSWORD — 数据库密码
#   BEECLAW_API_KEY — API 认证密钥
#   BEECLAW_LLM_API_KEY — LLM Provider API Key
#   GRAFANA_ADMIN_PASSWORD — Grafana 管理密码

# 3. 验证服务健康
curl http://localhost:3000/health
curl http://localhost:9090/-/healthy
curl http://localhost:3001/api/health
```

### 生产检查清单

- [ ] 配置 TLS（反向代理或 Let's Encrypt）→ 参考 [`deploy/nginx/beeclaw.conf`](deploy/nginx/beeclaw.conf)
- [ ] 设置强密码（PostgreSQL / Grafana / API Key）→ 参考 [运维手册 §2](docs/OPERATIONS.md#2-强密码与密钥管理)
- [ ] 配置 Prometheus 告警规则 → 已预置 [`deploy/monitoring/alerting_rules.yml`](deploy/monitoring/alerting_rules.yml)
- [ ] 配置 Grafana 告警通知渠道（Slack / Email / Webhook）→ 参考 [运维手册 §4](docs/OPERATIONS.md#4-grafana-告警通知渠道)
- [ ] 调整 Agent 数量和 Tick 间隔适配服务器资源 → 参考 [运维手册 §5](docs/OPERATIONS.md#5-资源调优)
- [ ] 配置日志归档和轮转 → 已预置 [`deploy/logrotate/beeclaw`](deploy/logrotate/beeclaw)
- [ ] 设置数据库备份策略 → 已预置 [`deploy/backup/backup.sh`](deploy/backup/backup.sh)

> 详细生产运维指南请阅读 **[docs/OPERATIONS.md](docs/OPERATIONS.md)**

## 许可证

[MIT](LICENSE)

---

**BeeQueen 集团出品** 🐝
