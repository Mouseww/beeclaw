# BeeClaw 部署指南

## 目录

- [快速开始](#快速开始)
- [Docker 部署（推荐）](#docker-部署推荐)
- [Kubernetes 部署](#kubernetes-部署)
- [手动部署](#手动部署)
- [环境变量配置](#环境变量配置)
- [LLM 服务配置](#llm-服务配置)
- [数据持久化](#数据持久化)
- [生产环境建议](#生产环境建议)
- [监控](#监控)
- [故障排查](#故障排查)

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/Mouseww/beeclaw.git
cd beeclaw

# 复制环境变量配置
cp .env.example .env
# 编辑 .env，至少配置 LLM 相关变量

# Docker 一键启动
docker compose up -d
```

服务启动后访问：
- Dashboard: http://localhost:3000
- 健康检查: http://localhost:3000/health
- API: http://localhost:3000/api/status

---

## Docker 部署（推荐）

### 前置条件

- Docker 20.10+
- Docker Compose v2+
- 可用的 LLM 服务（Ollama / OpenAI 兼容 API）

### 使用 Docker Compose

#### 默认模式（SQLite）

1. **配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置 LLM 服务地址和模型：

```env
# LLM 配置（必须）
BEECLAW_LLM_BASE_URL=http://host.docker.internal:11434
BEECLAW_LLM_API_KEY=no-key
BEECLAW_LOCAL_MODEL=qwen2.5:7b
BEECLAW_CHEAP_MODEL=qwen2.5:7b
BEECLAW_STRONG_MODEL=qwen2.5:72b

# Server 配置（可选）
BEECLAW_TICK_INTERVAL=30000
BEECLAW_INITIAL_AGENTS=10
BEECLAW_MAX_AGENTS=100
```

> **注意**: 容器内访问宿主机上的 Ollama 时，使用 `host.docker.internal` 代替 `localhost`。

2. **构建并启动**

```bash
# 构建并后台启动
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

3. **验证部署**

```bash
curl http://localhost:3000/health
# 期望：{"status":"ok","uptime":...,"version":"0.1.0","tick":...}
```

#### PostgreSQL 模式

项目使用 Docker Compose [profiles](https://docs.docker.com/compose/profiles/) 支持一键切换到 PostgreSQL。

1. **配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env`，配置 PostgreSQL 相关变量：

```env
# PostgreSQL 配置
POSTGRES_USER=beeclaw
POSTGRES_PASSWORD=your-strong-password   # ⚠️ 生产环境请使用强密码
POSTGRES_DB=beeclaw
POSTGRES_PORT=5432

# LLM 配置
BEECLAW_LLM_BASE_URL=http://host.docker.internal:11434
BEECLAW_LLM_API_KEY=no-key
BEECLAW_LOCAL_MODEL=qwen2.5:7b
```

2. **启动 PostgreSQL 模式**

```bash
# 构建并启动（PostgreSQL + Server）
docker compose --profile postgres up -d --build

# 查看日志
docker compose --profile postgres logs -f

# 停止
docker compose --profile postgres down
```

> `--profile postgres` 会启动 `postgres` 数据库服务和 `server-pg`（PostgreSQL 版 Server）。默认的 `server`（SQLite 版）不会启动，两者互不干扰。

3. **验证**

```bash
# 检查健康状态
curl http://localhost:3000/health

# 检查 PostgreSQL 连接
docker exec beeclaw-postgres pg_isready -U beeclaw
```

4. **数据持久化**

PostgreSQL 数据存储在 `beeclaw-pgdata` Docker 卷中，容器删除后数据不会丢失。

```bash
# 查看卷
docker volume ls | grep beeclaw

# 备份数据库
docker exec beeclaw-postgres pg_dump -U beeclaw beeclaw > beeclaw-backup.sql

# 恢复数据库
cat beeclaw-backup.sql | docker exec -i beeclaw-postgres psql -U beeclaw beeclaw
```

#### 分布式模式

项目使用 `distributed` profile 支持多节点分布式部署，通过 Redis 进行节点间通信，将 Tick 计算分发到多个 Worker 节点。

1. **配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env`，配置分布式相关变量：

```env
# 分布式配置
BEECLAW_DISTRIBUTED=true
BEECLAW_REDIS_URL=redis://redis:6379
BEECLAW_WORKER_COUNT=2

# LLM 配置
BEECLAW_LLM_BASE_URL=http://host.docker.internal:11434
BEECLAW_LLM_API_KEY=no-key
BEECLAW_LOCAL_MODEL=qwen2.5:7b
```

2. **启动分布式模式**

```bash
# 构建并启动（Redis + Coordinator Server + 默认 Worker）
docker compose --profile distributed up -d --build

# 水平扩展 Worker 到 3 个实例
docker compose --profile distributed up -d --scale worker=3

# 查看所有节点状态
docker compose --profile distributed ps

# 查看日志
docker compose --profile distributed logs -f

# 停止
docker compose --profile distributed down
```

> `--profile distributed` 会启动 `redis`、`server-distributed`（协调器节点）和 `worker`（计算节点）。可通过 `--scale worker=N` 按需扩展 Worker 数量。

3. **分布式 + PostgreSQL**

可以同时启用分布式和 PostgreSQL：

```bash
docker compose --profile distributed --profile postgres up -d --build
```

4. **验证**

```bash
# 检查协调器健康状态
curl http://localhost:3000/health

# 检查 Redis 连接
docker exec beeclaw-redis redis-cli ping

# 查看 Worker 数量
docker compose --profile distributed ps worker
```

5. **架构说明**

```
┌─────────────────┐     ┌───────────┐     ┌──────────────┐
│  Coordinator    │────▶│   Redis   │◀────│   Worker 1   │
│  (server-       │     │  (消息总线) │     │  (Agent 计算) │
│   distributed)  │     └───────────┘     ├──────────────┤
│                 │                        │   Worker 2   │
│  - Tick 调度    │                        ├──────────────┤
│  - 任务分发     │                        │   Worker N   │
│  - 结果聚合     │                        │  (--scale)   │
└─────────────────┘                        └──────────────┘
```

- **Coordinator**：负责 Tick 调度、任务分发和结果聚合
- **Worker**：执行具体的 Agent LLM 调用和计算
- **Redis**：作为消息传输层，协调节点间通信

### docker-compose.yml 说明

```yaml
services:
  # 默认 SQLite 模式
  server:
    build: .
    container_name: beeclaw-server
    ports:
      - "${BEECLAW_PORT:-3000}:3000"
    environment:
      - BEECLAW_DB_PATH=/app/data/beeclaw.db
      # ... 其他环境变量
    volumes:
      - beeclaw-data:/app/data       # SQLite 数据持久化

  # PostgreSQL (--profile postgres)
  postgres:
    image: postgres:16-alpine
    profiles: [postgres]
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-beeclaw}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-beeclaw}
      - POSTGRES_DB=${POSTGRES_DB:-beeclaw}
    volumes:
      - beeclaw-pgdata:/var/lib/postgresql/data

  # Server PostgreSQL 版 (--profile postgres)
  server-pg:
    extends: { service: server }
    profiles: [postgres]
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      - BEECLAW_DB_DRIVER=postgres
      - DATABASE_URL=postgresql://...@postgres:5432/beeclaw

  # Redis (--profile distributed)
  redis:
    image: redis:7-alpine
    profiles: [distributed]
    volumes:
      - beeclaw-redis-data:/data

  # Server 分布式版 (--profile distributed)
  server-distributed:
    extends: { service: server }
    profiles: [distributed]
    depends_on:
      redis: { condition: service_healthy }
    environment:
      - BEECLAW_DISTRIBUTED=true
      - BEECLAW_REDIS_URL=redis://redis:6379
      - BEECLAW_NODE_ROLE=coordinator

  # Worker 节点 (--profile distributed, 可 scale)
  worker:
    build: .
    profiles: [distributed]
    depends_on:
      redis: { condition: service_healthy }
    environment:
      - BEECLAW_DISTRIBUTED=true
      - BEECLAW_REDIS_URL=redis://redis:6379
      - BEECLAW_NODE_ROLE=worker
    command: ["node", "packages/coordinator/dist/worker.js"]

volumes:
  beeclaw-data:       # SQLite 数据
  beeclaw-pgdata:     # PostgreSQL 数据
  beeclaw-redis-data: # Redis 持久化数据
```

### Dockerfile 多阶段构建

项目使用三阶段构建优化镜像大小：

1. **builder** — 安装依赖、编译 TypeScript
2. **dashboard-builder** — 构建 React Dashboard（Vite）
3. **runtime** — 精简生产镜像，仅复制 `dist/` 和生产依赖

基础镜像: `node:22-slim`

### 单独构建镜像

```bash
docker build -t beeclaw:latest .
docker run -d \
  --name beeclaw \
  -p 3000:3000 \
  -e BEECLAW_LLM_BASE_URL=http://host.docker.internal:11434 \
  -e BEECLAW_LLM_API_KEY=no-key \
  -v beeclaw-data:/app/data \
  beeclaw:latest
```

---

## 手动部署

### 前置条件

- Node.js >= 20（推荐 22）
- npm >= 9
- 可用的 LLM 服务

### 步骤

```bash
# 1. 安装依赖
npm install

# 2. 构建所有包
npm run build

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env

# 4. 启动 HTTP Server（推荐生产使用）
npm run serve

# 或启动 CLI（纯命令行模式）
npm run start -- --agents 20 --ticks 10 --seed "央行宣布加息"
```

### 使用 PM2 管理进程

```bash
npm install -g pm2

# 启动
pm2 start node --name beeclaw -- packages/server/dist/index.js

# 查看状态
pm2 status

# 查看日志
pm2 logs beeclaw

# 开机自启
pm2 save
pm2 startup
```

---

## 环境变量配置

### LLM 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BEECLAW_LLM_BASE_URL` | `http://localhost:11434` | LLM API 基础 URL（兼容 OpenAI / Ollama） |
| `BEECLAW_LLM_API_KEY` | `no-key` | LLM API Key（本地 Ollama 不需要） |
| `BEECLAW_LOCAL_MODEL` | `qwen2.5:7b` | 本地免费模型（50–60% Agent 使用） |
| `BEECLAW_CHEAP_MODEL` | `qwen2.5:7b` | 低成本云模型（30–40% Agent 使用） |
| `BEECLAW_STRONG_MODEL` | `qwen2.5:72b` | 高能力模型（5–10% Agent 使用） |

### Server 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BEECLAW_PORT` | `3000` | HTTP 服务端口 |
| `BEECLAW_HOST` | `0.0.0.0` | 监听地址 |
| `BEECLAW_TICK_INTERVAL` | `30000` | Tick 间隔（毫秒），生产建议 30000+ |
| `BEECLAW_INITIAL_AGENTS` | `10` | 初始 Agent 数量 |
| `BEECLAW_MAX_AGENTS` | `100` | 世界内允许注册的 Agent 总上限，恢复、初始化和运行时孵化都会受此限制 |
| `BEECLAW_DB_PATH` | _(空=内存)_ | SQLite 数据库文件路径 |
| `BEECLAW_SEED_EVENT` | _(空)_ | 启动时注入的种子事件内容 |
| `BEECLAW_SAVE_INTERVAL` | `5` | 每 N 个 tick 保存一次状态到数据库 |

### 数据库配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BEECLAW_DB_DRIVER` | `sqlite` | 数据库驱动：`sqlite` 或 `postgres` |
| `DATABASE_URL` | _(空)_ | PostgreSQL 连接字符串（仅 postgres 驱动），Docker Compose 自动设置 |
| `POSTGRES_USER` | `beeclaw` | PostgreSQL 用户名（Docker Compose 用） |
| `POSTGRES_PASSWORD` | `beeclaw` | PostgreSQL 密码（Docker Compose 用，生产环境必须修改） |
| `POSTGRES_DB` | `beeclaw` | PostgreSQL 数据库名（Docker Compose 用） |
| `POSTGRES_PORT` | `5432` | PostgreSQL 宿主机映射端口（Docker Compose 用） |

### 安全与访问控制

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BEECLAW_API_KEY` | _(空=不启用)_ | API 认证 Bearer token。设置后所有 API 请求需携带 `Authorization: Bearer <key>`。`/health` 和 `/metrics/prometheus` 不需要认证 |
| `BEECLAW_CORS_ORIGINS` | _(空=允许所有)_ | 允许的 CORS 域名（逗号分隔），例如 `https://dashboard.beeclaw.com,https://admin.beeclaw.com`。不设置则允许所有来源 |
| `BEECLAW_RATE_LIMIT` | `100` | 每分钟最大请求数。`/health` 和 `/metrics/prometheus` 不受限速影响 |

### 日志配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BEECLAW_LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |
| `NODE_ENV` | `development` | `production` 时启用 JSON 格式日志 |

### 分布式配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BEECLAW_DISTRIBUTED` | `false` | 是否启用分布式模式 |
| `BEECLAW_REDIS_URL` | `redis://localhost:6379` | Redis 连接字符串（分布式模式必须） |
| `BEECLAW_REDIS_PORT` | `6379` | Redis 宿主机映射端口（Docker Compose 用） |
| `BEECLAW_REDIS_MAXMEM` | `256mb` | Redis 最大内存限制 |
| `BEECLAW_NODE_ROLE` | _(空)_ | 节点角色：`coordinator`（协调器）或 `worker`（工作节点），Docker Compose 自动设置 |
| `BEECLAW_WORKER_COUNT` | `2` | 期望的 Worker 数量（协调器用于任务分片） |

---

## LLM 服务配置

BeeClaw 使用 OpenAI 兼容 API，支持多种 LLM 后端。

### Ollama（本地推荐）

```bash
# 安装 Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 拉取模型
ollama pull qwen2.5:7b
ollama pull qwen2.5:72b   # 可选，需大内存

# Ollama 默认监听 http://localhost:11434
```

`.env` 配置：

```env
BEECLAW_LLM_BASE_URL=http://localhost:11434
BEECLAW_LLM_API_KEY=no-key
BEECLAW_LOCAL_MODEL=qwen2.5:7b
BEECLAW_CHEAP_MODEL=qwen2.5:7b
BEECLAW_STRONG_MODEL=qwen2.5:72b
```

### OpenAI

```env
BEECLAW_LLM_BASE_URL=https://api.openai.com
BEECLAW_LLM_API_KEY=sk-...
BEECLAW_LOCAL_MODEL=gpt-4o-mini
BEECLAW_CHEAP_MODEL=gpt-4o-mini
BEECLAW_STRONG_MODEL=gpt-4o
```

### 其他兼容服务

任何提供 OpenAI 兼容 `/v1/chat/completions` 接口的服务均可使用，修改 `BEECLAW_LLM_BASE_URL` 即可。

### 运行时动态配置

LLM 配置也可通过 REST API 动态更新，无需重启：

```bash
# 查看当前配置
curl http://localhost:3000/api/config/llm

# 更新单个 tier
curl -X PUT http://localhost:3000/api/config/llm/strong \
  -H 'Content-Type: application/json' \
  -d '{"baseURL":"https://api.openai.com","apiKey":"sk-...","model":"gpt-4o"}'
```

动态更新的配置会持久化到 SQLite 数据库，重启后自动加载。

---

## 数据持久化

### PostgreSQL（生产推荐）

生产环境推荐使用 PostgreSQL 替代 SQLite，获得更好的并发性能和可靠性。

**环境变量：**

| 变量 | 说明 |
|------|------|
| `BEECLAW_POSTGRES_URL` | PostgreSQL 连接字符串，例如 `postgresql://user:pass@localhost:5432/beeclaw` |

当设置了 `BEECLAW_POSTGRES_URL` 时，系统自动使用 PostgreSQL 适配器；否则使用 SQLite。

### 从 SQLite 迁移到 PostgreSQL

如果你已有 SQLite 数据库，可使用内置迁移脚本将数据一键迁移到 PostgreSQL：

**前置条件：**

- 已安装 PostgreSQL 并创建目标数据库
- 已安装项目依赖 (`npm install`)

**迁移步骤：**

```bash
# 1. 创建 PostgreSQL 数据库
createdb beeclaw

# 2. 先用 dry-run 模式检查数据量
npx tsx scripts/migrate-sqlite-to-postgres.ts \
  --sqlite-path ./data/beeclaw.db \
  --postgres-url postgresql://user:pass@localhost:5432/beeclaw \
  --dry-run

# 3. 执行正式迁移
npx tsx scripts/migrate-sqlite-to-postgres.ts \
  --sqlite-path ./data/beeclaw.db \
  --postgres-url postgresql://user:pass@localhost:5432/beeclaw

# 或使用 npm 脚本
npm run migrate:pg -- \
  --sqlite-path ./data/beeclaw.db \
  --postgres-url postgresql://user:pass@localhost:5432/beeclaw
```

**参数说明：**

| 参数 | 必需 | 说明 |
|------|------|------|
| `--sqlite-path` | 是 | SQLite 源数据库文件路径 |
| `--postgres-url` | 是 | PostgreSQL 连接字符串 |
| `--batch-size` | 否 | 每批插入行数，默认 500 |
| `--dry-run` | 否 | 仅统计数据，不执行写入 |

**迁移特性：**

- **事务安全** — 每批次使用独立事务，失败自动回滚
- **冲突跳过** — 已存在的数据自动跳过（ON CONFLICT DO NOTHING）
- **类型适配** — 自动处理 SQLite TEXT→PostgreSQL JSONB、INTEGER(0/1)→BOOLEAN 转换
- **进度显示** — 实时显示迁移进度和统计报告
- **序列重置** — 自增列（如 consensus_signals.id）迁移后自动重置序列值

**迁移覆盖的表：**

world_state, agents, tick_history, consensus_signals, llm_config,
webhook_subscriptions, events, agent_responses, rss_sources, api_keys,
social_nodes, social_edges

**迁移后：**

```bash
# 4. 更新 .env 配置，切换到 PostgreSQL
echo 'BEECLAW_POSTGRES_URL=postgresql://user:pass@localhost:5432/beeclaw' >> .env

# 5. 重启服务
npm run serve
```

### SQLite 数据库

设置 `BEECLAW_DB_PATH` 指定数据库文件路径。不设置时使用内存数据库（重启丢失数据）。

**持久化内容**:

- Agent 状态（人格、记忆、社交关系、影响力等）
- Tick 执行历史
- 共识信号
- LLM 配置

**保存策略**: 每 `BEECLAW_SAVE_INTERVAL` 个 tick 自动保存（默认 5），服务器优雅退出时也会执行最终保存。

### Docker 持久化卷

Docker 部署时，数据通过 `beeclaw-data` 卷挂载到 `/app/data/beeclaw.db`，容器删除后数据不会丢失。

```bash
# 查看持久化卷
docker volume ls | grep beeclaw

# 备份数据库
docker cp beeclaw-server:/app/data/beeclaw.db ./beeclaw-backup.db
```

---

## 生产环境建议

### 资源规划

| Agent 数量 | 推荐内存 | 推荐 Tick 间隔 |
|------------|----------|----------------|
| 10–30 | 512 MB | 30s |
| 30–100 | 1–2 GB | 60s |
| 100–500 | 4+ GB | 120s+ |

> Tick 耗时与 Agent 数量和 LLM 响应速度成正比。如果 tick 耗时超过间隔的 80%，服务器会输出预警日志。

### 安全注意事项

- 生产环境**强烈建议**设置 `BEECLAW_API_KEY`，防止未授权访问
- 设置 `BEECLAW_CORS_ORIGINS` 限制允许的前端域名
- 内置 Rate Limiting 防止滥用（默认 100 req/min，可通过 `BEECLAW_RATE_LIMIT` 调整）
- 使用反向代理（Nginx / Caddy）提供 TLS 和额外的安全层
- LLM API Key 敏感信息通过环境变量传递，不要写入代码或镜像

### Nginx 反向代理示例

> 项目提供了完整的生产级 Nginx 配置，参见 [`deploy/nginx/beeclaw.conf`](../deploy/nginx/beeclaw.conf)。
> 以下为简化示例，完整的 TLS 加固、告警配置、日志轮转、备份策略等请参阅 **[生产运维手册](OPERATIONS.md)**。

```nginx
server {
    listen 443 ssl;
    server_name beeclaw.example.com;

    ssl_certificate     /etc/ssl/certs/beeclaw.pem;
    ssl_certificate_key /etc/ssl/private/beeclaw.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 支持
    location /ws {
        proxy_pass http://127.0.0.1:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

### 优雅退出

服务器接收 `SIGINT`、`SIGTERM`、`SIGHUP` 信号时执行：

1. 停止 tick 循环
2. 保存当前状态到数据库
3. 关闭所有 WebSocket 连接
4. 关闭 HTTP 服务
5. 关闭数据库连接

超时保护：10 秒内未完成优雅退出则强制退出。

---

## Kubernetes 部署

适用于生产环境高可用分布式部署。项目提供 Kustomize 配置，支持 staging 和 production 两套 overlay。

### 前置条件

- Kubernetes 1.27+
- kubectl 已配置集群访问
- (可选) kube-prometheus-stack 已安装（用于 ServiceMonitor / PrometheusRule）
- 容器镜像已推送至 registry

### 目录结构

```
deploy/k8s/
├── base/                          # 基础资源
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml                # 模板，需替换真实密码
│   ├── coordinator-deployment.yaml
│   ├── worker-deployment.yaml
│   ├── services.yaml
│   ├── ingress.yaml
│   ├── postgres-statefulset.yaml
│   ├── redis-statefulset.yaml
│   ├── hpa.yaml                   # Worker 自动扩缩容
│   ├── pdb.yaml                   # Pod 中断预算
│   └── monitoring.yaml            # ServiceMonitor + PrometheusRule
└── overlays/
    ├── production/                # 生产环境 (更大资源, 更多 Worker)
    │   └── kustomization.yaml
    └── staging/                   # 预发布环境
        └── kustomization.yaml
```

### 快速部署

```bash
# Staging 环境
kubectl apply -k deploy/k8s/overlays/staging

# Production 环境
kubectl apply -k deploy/k8s/overlays/production

# 查看状态
kubectl get all -n beeclaw
kubectl get hpa -n beeclaw
```

### 重要事项

1. **Secrets 管理**：`base/secret.yaml` 仅为模板，生产环境请使用 sealed-secrets、external-secrets 或 CI/CD pipeline 注入敏感信息。
2. **Coordinator 单副本**：Coordinator 持有分布式锁，必须单副本运行（Recreate 策略），PDB 禁止驱逐。
3. **Worker 自动扩缩容**：HPA 基于 CPU/内存利用率自动调整 Worker 副本数（生产环境 3-20 个）。
4. **存储**：PostgreSQL 和 Redis 使用 PVC 持久化；生产环境推荐使用托管数据库服务。
5. **监控集成**：如已安装 kube-prometheus-stack，ServiceMonitor 会自动注册抓取目标。

### 部署验证

```bash
# 基础验证
./scripts/verify-deployment.sh --base-url http://beeclaw.example.com

# 完整验证 (含 K8s + 分布式 + 监控)
./scripts/verify-deployment.sh \
  --base-url http://beeclaw.example.com \
  --k8s --namespace beeclaw \
  --distributed --monitoring
```

### 运维手册

详见 [docs/RUNBOOK.md](RUNBOOK.md)，包含：告警响应流程、日常运维操作、灾难恢复、性能调优。

---

## 监控

### 健康检查

```bash
curl http://localhost:3000/health
```

Docker 和 Kubernetes 可直接使用此端点作为存活探针。

### JSON 指标

```bash
curl http://localhost:3000/metrics
```

返回详细的 JSON 格式运行时指标，包含服务器状态、引擎指标、性能数据、内存使用等。

### Prometheus 集成

```bash
curl http://localhost:3000/metrics/prometheus
```

返回 Prometheus text exposition format，可直接配置 Prometheus scrape：

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'beeclaw'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics/prometheus'
    scrape_interval: 30s
```

关键指标：

- `beeclaw_agents_active` — 活跃 Agent 数
- `beeclaw_llm_calls_total` / `beeclaw_llm_calls_failed` — LLM 调用成功/失败
- `beeclaw_tick_avg_duration_ms` — Tick 平均耗时
- `beeclaw_cache_hit_rate` — 缓存命中率
- `beeclaw_memory_heap_used_bytes` — 堆内存使用

### Prometheus + Grafana + Alertmanager 监控栈

项目提供完整的监控栈 Docker Compose 配置：

```bash
# 启动完整监控栈 (需先启动 BeeClaw 主服务)
docker compose \
  -f docker-compose.yml \
  -f deploy/monitoring/docker-compose.monitoring.yml \
  up -d
```

包含：
- **Prometheus** (:9090) — 指标采集，17 条告警规则，30 天数据保留
- **Alertmanager** (:9093) — 告警路由与通知（邮件 / Webhook），分级处理 critical/warning
- **Grafana** (:3001) — 18 个可视化面板，覆盖世界状态、LLM、事件、内存等

配置文件位于 `deploy/monitoring/`：
- `prometheus.yml` — Prometheus 抓取配置（含 Alertmanager 集成）
- `alerting_rules.yml` — 告警规则（服务健康 / LLM / 性能 / 分布式 Worker）
- `alertmanager.yml` — Alertmanager 路由、通知、抑制规则
- `grafana-dashboard.json` — Grafana Dashboard 导入文件

### WebSocket 实时监控

连接 `ws://localhost:3000/ws` 可实时接收：

- `tick` — 每轮 tick 的结果
- `consensus` — 新产生的共识信号
- `event_injected` — API 注入事件的通知

---

## 故障排查

### 常见问题

**Q: 启动后 Agent 无响应**

检查 LLM 服务是否可达：

```bash
curl http://localhost:11434/v1/models  # Ollama
```

确认模型已拉取：

```bash
ollama list
```

**Q: Docker 容器内无法连接宿主机 Ollama**

使用 `host.docker.internal` 代替 `localhost`：

```env
BEECLAW_LLM_BASE_URL=http://host.docker.internal:11434
```

Linux 用户可能需要添加 `--add-host` 参数：

```bash
docker run --add-host=host.docker.internal:host-gateway ...
```

**Q: Tick 执行时间过长**

- 减少 `BEECLAW_INITIAL_AGENTS`
- 增大 `BEECLAW_TICK_INTERVAL`
- 使用更快的 LLM 服务或更小的模型
- 检查 `/metrics` 中的 `recentTicks.avgDurationMs`

**Q: 数据库文件增长过大**

SQLite 数据库会随 tick 历史增长。可定期备份后删除重建：

```bash
# 备份
cp /app/data/beeclaw.db /app/data/beeclaw-backup-$(date +%Y%m%d).db

# 重启服务器将自动创建新数据库
```

**Q: WebSocket 频繁断开**

服务器每 30 秒发送心跳 ping。如果使用反向代理，确保配置了足够的 `proxy_read_timeout`（建议 86400 秒）。
