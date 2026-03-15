# BeeClaw 部署指南

## 目录

- [快速开始](#快速开始)
- [Docker 部署（推荐）](#docker-部署推荐)
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

### docker-compose.yml 说明

```yaml
services:
  server:
    build: .
    container_name: beeclaw-server
    restart: unless-stopped
    ports:
      - "${BEECLAW_PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
      - BEECLAW_DB_PATH=/app/data/beeclaw.db
      # ... 其他环境变量
    volumes:
      - beeclaw-data:/app/data       # SQLite 数据持久化
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

volumes:
  beeclaw-data:
    driver: local
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
| `BEECLAW_DB_PATH` | _(空=内存)_ | SQLite 数据库文件路径 |
| `BEECLAW_SEED_EVENT` | _(空)_ | 启动时注入的种子事件内容 |
| `BEECLAW_SAVE_INTERVAL` | `5` | 每 N 个 tick 保存一次状态到数据库 |

### 日志配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BEECLAW_LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |
| `NODE_ENV` | `development` | `production` 时启用 JSON 格式日志 |

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

- 当前所有 API 端点**无认证**，不要直接暴露到公网
- 使用反向代理（Nginx / Caddy）提供 TLS 和访问控制
- LLM API Key 敏感信息通过环境变量传递，不要写入代码或镜像

### Nginx 反向代理示例

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
