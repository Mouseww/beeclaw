# BeeClaw 生产运维手册

本文档覆盖 BeeClaw 生产环境的安全加固、监控告警、资源调优、日志管理和备份策略。
有关基础部署步骤，请参阅 [部署指南](DEPLOYMENT.md)。

---

## 目录

- [1. TLS / HTTPS 配置](#1-tls--https-配置)
- [2. 强密码与密钥管理](#2-强密码与密钥管理)
- [3. Prometheus 告警规则](#3-prometheus-告警规则)
- [4. Grafana 告警通知渠道](#4-grafana-告警通知渠道)
- [5. 资源调优](#5-资源调优)
- [6. 日志归档与轮转](#6-日志归档与轮转)
- [7. 数据库备份策略](#7-数据库备份策略)
- [8. 安全检查清单](#8-安全检查清单)

---

## 1. TLS / HTTPS 配置

生产环境**必须**通过 TLS 加密所有外部流量。推荐在 BeeClaw 前面部署 Nginx 反向代理来终止 TLS。

### 1.1 Let's Encrypt（推荐免费方案）

```bash
# 安装 certbot
apt-get install certbot python3-certbot-nginx

# 申请证书（自动配置 Nginx）
certbot --nginx -d beeclaw.example.com

# 验证自动续期
certbot renew --dry-run

# 查看证书状态
certbot certificates
```

证书自动续期通过 systemd timer 或 cron 实现：

```bash
# 检查 systemd timer（certbot 默认安装）
systemctl status certbot.timer

# 或手动添加 crontab
# 0 0,12 * * * certbot renew --quiet --post-hook "systemctl reload nginx"
```

### 1.2 Nginx 反向代理配置

项目预置了参考配置文件 `deploy/nginx/beeclaw.conf`，主要特性：

- HTTP → HTTPS 自动重定向
- TLS 1.2 / 1.3，强密码套件
- WebSocket (`/ws`) 代理支持
- 安全响应头（HSTS、X-Frame-Options、CSP 等）
- Prometheus 指标端点限制为内网访问

```bash
# 部署 Nginx 配置
cp deploy/nginx/beeclaw.conf /etc/nginx/sites-available/beeclaw
ln -s /etc/nginx/sites-available/beeclaw /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 1.3 自签证书（内网/测试）

```bash
# 生成自签证书（仅开发/测试使用）
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/beeclaw.key \
  -out /etc/ssl/certs/beeclaw.pem \
  -subj "/CN=beeclaw.local"
```

### 1.4 Docker + TLS

如果使用 Docker 部署，推荐在宿主机运行 Nginx（或 Caddy），将流量转发到容器端口：

```
宿主机 Nginx (443/TLS) → localhost:3000 (Docker 容器)
```

Caddy 替代方案（自动 HTTPS）：

```caddyfile
beeclaw.example.com {
    reverse_proxy localhost:3000
    # WebSocket 自动处理
}
```

---

## 2. 强密码与密钥管理

### 2.1 密码策略

所有生产密码/密钥必须满足：

| 凭据 | 最低要求 | 环境变量 |
|------|---------|---------|
| PostgreSQL 密码 | 16+ 字符，混合大小写/数字/特殊字符 | `POSTGRES_PASSWORD` |
| API 认证密钥 | 32+ 字符，建议 UUID 或 base64 随机串 | `BEECLAW_API_KEY` |
| Grafana 管理密码 | 12+ 字符，非默认值 | `GRAFANA_ADMIN_PASSWORD` |
| LLM API Key | 由 Provider 提供，存环境变量 | `BEECLAW_LLM_API_KEY` |

### 2.2 生成强密码

```bash
# 方法 1: openssl（推荐）
openssl rand -base64 32

# 方法 2: /dev/urandom
tr -dc 'A-Za-z0-9!@#$%^&*' </dev/urandom | head -c 32; echo

# 方法 3: UUID 作为 API Key
python3 -c "import uuid; print(uuid.uuid4())"
```

### 2.3 密钥管理最佳实践

```bash
# .env 文件权限（仅 owner 可读写）
chmod 600 .env

# 确认 .env 不被 Git 跟踪
grep -q '.env' .gitignore || echo '.env' >> .gitignore
```

**推荐方案分级：**

| 场景 | 方案 |
|------|------|
| 单机 / 小团队 | `.env` 文件 + `chmod 600` |
| Docker Swarm | Docker Secrets |
| Kubernetes | K8s Secrets + Sealed Secrets |
| 大型团队 | HashiCorp Vault / AWS Secrets Manager |

### 2.4 Redis 安全

分布式模式下 Redis 需额外加固：

```bash
# 在 .env 中设置 Redis 密码
BEECLAW_REDIS_URL=redis://:your-strong-password@redis:6379

# docker-compose.yml 中的 Redis 命令追加 --requirepass
command: redis-server --appendonly yes --requirepass your-strong-password --maxmemory 256mb
```

---

## 3. Prometheus 告警规则

项目预置了告警规则文件 `deploy/monitoring/alerting_rules.yml`，涵盖以下场景：

### 3.1 内置告警清单

| 告警名 | 严重级别 | 触发条件 |
|--------|---------|---------|
| `BeeclawDown` | critical | 服务不可达超过 1 分钟 |
| `HighLLMFailureRate` | warning | LLM 调用失败率 > 10%（5 分钟窗口） |
| `LLMCallsStalled` | critical | 5 分钟内无 LLM 调用（引擎可能卡死） |
| `HighTickDuration` | warning | Tick 平均耗时超过间隔的 80% |
| `HighMemoryUsage` | warning | 堆内存 > 1.5 GB |
| `CriticalMemoryUsage` | critical | 堆内存 > 2 GB |
| `LowCacheHitRate` | warning | 缓存命中率 < 30%（10 分钟窗口） |
| `NoActiveAgents` | critical | 活跃 Agent 数为 0 |
| `AgentCountDrop` | warning | Agent 数量 5 分钟内下降 > 50% |
| `HighWebSocketDisconnects` | warning | WebSocket 连接数突降 |
| `WorkerDown` | warning | 分布式 Worker 节点不可达超过 1 分钟 |
| `AllWorkersDown` | critical | 所有 Worker 节点离线 |
| `WorkerHighErrorRate` | warning | Worker 错误率过高 |
| `WorkerTickDurationHigh` | warning | Worker Tick 执行耗时 > 25s |
| `CoordinatorDown` | critical | 分布式 Coordinator 不可达 |

### 3.2 启用告警

更新 Prometheus 配置引入告警规则文件：

```yaml
# deploy/monitoring/prometheus.yml（已预配置）
rule_files:
  - "/etc/prometheus/alerting_rules.yml"
```

挂载规则文件到 Prometheus 容器：

```yaml
# deploy/monitoring/docker-compose.monitoring.yml
services:
  prometheus:
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./alerting_rules.yml:/etc/prometheus/alerting_rules.yml:ro
```

### 3.3 验证告警规则

```bash
# 使用 promtool 校验规则语法
docker exec beeclaw-prometheus promtool check rules /etc/prometheus/alerting_rules.yml

# 查看已加载的告警规则
curl http://localhost:9090/api/v1/rules | python3 -m json.tool

# 查看当前触发的告警
curl http://localhost:9090/api/v1/alerts
```

### 3.4 Alertmanager 集成

Alertmanager 已集成到监控栈中（`deploy/monitoring/docker-compose.monitoring.yml`），
配置文件为 `deploy/monitoring/alertmanager.yml`。启动监控栈时会自动部署。

**默认配置（需修改）：** 默认配置中的 SMTP 和 Webhook 地址为占位符，生产环境需替换为真实值。

```bash
# 修改 Alertmanager 配置
vim deploy/monitoring/alertmanager.yml

# 重新加载配置（无需重启）
curl -X POST http://localhost:9093/-/reload
```

关键配置项：
- `global.smtp_smarthost` — 邮件 SMTP 服务器
- `global.smtp_auth_password` — SMTP 认证密码
- `receivers[].email_configs[].to` — 告警接收邮箱
- `receivers[].webhook_configs[].url` — Webhook 端点（Slack / 钉钉 / 企业微信）

---

## 4. Grafana 告警通知渠道

除了 Prometheus Alertmanager，还可以直接在 Grafana 中配置告警。

### 4.1 配置通知渠道

1. 登录 Grafana（默认 `http://localhost:3001`，账号 `admin`）
2. 进入 **Alerting → Contact points**
3. 添加通知渠道：

| 渠道类型 | 适用场景 |
|---------|---------|
| Slack | 团队实时通知 |
| Email | 正式告警通知 |
| Webhook | 集成第三方系统（PagerDuty、企业微信、钉钉） |
| Telegram | 轻量即时通知 |

### 4.2 配置 Grafana 告警规则

1. 打开 BeeClaw Dashboard
2. 编辑面板 → Alert 选项卡
3. 推荐告警阈值：

| 面板 | 告警条件 | 严重级别 |
|------|---------|---------|
| LLM 调用失败 | 失败率 > 10% 持续 5 分钟 | Warning |
| 内存使用 | heap_used > 1.5 GB 持续 5 分钟 | Warning |
| Tick 执行耗时 | avg_duration > tick_interval * 0.8 | Warning |
| Agent 数量 | active_agents = 0 持续 2 分钟 | Critical |

### 4.3 钉钉 / 企业微信集成

通过 Webhook 方式集成国内 IM：

```
# 钉钉机器人 Webhook
https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN

# 企业微信机器人 Webhook
https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
```

在 Grafana Contact Points 中选择 **Webhook**，填入对应 URL 即可。

---

## 5. 资源调优

### 5.1 Agent 数量 vs 系统资源

| Agent 数量 | 推荐 CPU | 推荐内存 | 推荐 Tick 间隔 | 预估 Tick 耗时 |
|------------|---------|---------|----------------|--------------|
| 10–30 | 1 vCPU | 512 MB–1 GB | 30s | 5–15s |
| 30–100 | 2 vCPU | 1–2 GB | 60s | 15–40s |
| 100–500 | 4 vCPU | 4–8 GB | 120s+ | 40–90s |
| 500–1000 | 8 vCPU | 8–16 GB | 180s+ | 分布式模式 |

> **关键指标:** 监控 `/metrics` 中的 `recentTicks.avgDurationMs`。如果 Tick 耗时超过间隔的 **80%**，服务器会输出预警日志。

### 5.2 Docker 资源限制

```yaml
# docker-compose.yml 中添加资源限制
services:
  server:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 5.3 Node.js 堆内存调优

```bash
# 在 .env 或 Docker 环境变量中设置
NODE_OPTIONS="--max-old-space-size=4096"   # 4 GB 堆内存上限
```

Docker Compose 中设置：

```yaml
services:
  server:
    environment:
      - NODE_OPTIONS=--max-old-space-size=4096
```

### 5.4 LLM 并发调优

```env
# 高并发 Agent 场景下调整
BEECLAW_TICK_INTERVAL=120000       # 增大 Tick 间隔
BEECLAW_MAX_AGENTS=500             # 限制 Agent 上限
```

本地 Ollama 并发建议：

| GPU 显存 | 推荐模型 | 并发限制 |
|---------|---------|---------|
| 8 GB | qwen2.5:7b | 2–4 并发 |
| 24 GB | qwen2.5:7b | 8–16 并发 |
| 24 GB | qwen2.5:72b | 1 并发 |

### 5.5 PostgreSQL 调优

```ini
# postgresql.conf 关键参数 (适用于 4–8 GB 内存服务器)
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 100
checkpoint_completion_target = 0.9
wal_buffers = 64MB
```

---

## 6. 日志归档与轮转

### 6.1 Docker 日志驱动

Docker 默认 `json-file` 驱动无大小限制，生产环境必须配置轮转：

```yaml
# docker-compose.yml — 全局或单服务配置
services:
  server:
    logging:
      driver: json-file
      options:
        max-size: "50m"     # 单个日志文件最大 50 MB
        max-file: "10"      # 保留最近 10 个文件
        compress: "true"    # 归档文件自动压缩
```

或在 Docker daemon 全局配置 `/etc/docker/daemon.json`：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "10",
    "compress": "true"
  }
}
```

### 6.2 手动部署（PM2 + logrotate）

项目预置了 logrotate 配置文件 `deploy/logrotate/beeclaw`：

```bash
# 安装 logrotate 配置
cp deploy/logrotate/beeclaw /etc/logrotate.d/beeclaw

# 测试配置
logrotate -d /etc/logrotate.d/beeclaw

# 手动触发轮转
logrotate -f /etc/logrotate.d/beeclaw
```

配置效果：
- 日志大小超过 50 MB 自动轮转
- 保留最近 14 份归档
- 使用 gzip 压缩
- PM2 日志重新打开信号 (`pm2 reloadLogs`)

### 6.3 结构化日志

BeeClaw 在 `NODE_ENV=production` 时输出 JSON 格式日志，便于 ELK/Loki 等日志平台采集：

```json
{"level":"info","tick":42,"agents":{"active":15,"total":50},"duration":12345,"msg":"tick completed"}
```

推荐日志采集方案：

| 方案 | 适用场景 |
|------|---------|
| Docker + Loki + Grafana | 轻量级，与现有 Grafana 集成 |
| ELK Stack | 全文搜索，大规模日志分析 |
| Fluentd + S3 | 长期归档 |

---

## 7. 数据库备份策略

### 7.1 SQLite 备份

```bash
# 手动备份
cp /app/data/beeclaw.db "/app/data/backup/beeclaw-$(date +%Y%m%d-%H%M%S).db"

# 使用 SQLite 在线备份 API（不会锁定数据库）
sqlite3 /app/data/beeclaw.db ".backup '/app/data/backup/beeclaw-$(date +%Y%m%d).db'"
```

### 7.2 PostgreSQL 备份

项目预置了自动化备份脚本 `deploy/backup/backup.sh`：

```bash
# 安装备份脚本
cp deploy/backup/backup.sh /opt/beeclaw/backup.sh
chmod +x /opt/beeclaw/backup.sh

# 手动执行
/opt/beeclaw/backup.sh

# 添加到 crontab（每日凌晨 2 点执行）
echo "0 2 * * * /opt/beeclaw/backup.sh >> /var/log/beeclaw-backup.log 2>&1" | crontab -
```

Docker 环境下的 PostgreSQL 备份：

```bash
# 完整备份
docker exec beeclaw-postgres pg_dump -U beeclaw -Fc beeclaw > "beeclaw-$(date +%Y%m%d).dump"

# 恢复
docker exec -i beeclaw-postgres pg_restore -U beeclaw -d beeclaw < beeclaw-20260318.dump

# 仅备份结构
docker exec beeclaw-postgres pg_dump -U beeclaw --schema-only beeclaw > schema.sql
```

### 7.3 推荐备份策略

| 策略 | 频率 | 保留 | 说明 |
|------|------|------|------|
| 每日全量 | 每天凌晨 2:00 | 30 天 | `pg_dump -Fc` 自定义格式 |
| WAL 归档 | 实时 | 7 天 | 用于时间点恢复 (PITR) |
| 周度离线 | 每周日 | 90 天 | 传输到异地存储 |

### 7.4 备份验证

```bash
# 验证备份文件完整性
pg_restore --list beeclaw-20260318.dump

# 恢复到测试数据库验证（推荐定期执行）
createdb beeclaw_restore_test
pg_restore -U beeclaw -d beeclaw_restore_test beeclaw-20260318.dump
# 执行验证查询
psql -U beeclaw beeclaw_restore_test -c "SELECT count(*) FROM agents;"
dropdb beeclaw_restore_test
```

### 7.5 Redis 备份（分布式模式）

Redis 已配置 AOF 持久化（`--appendonly yes`），Docker 卷 `beeclaw-redis-data` 包含持久化数据。

```bash
# 触发 RDB 快照
docker exec beeclaw-redis redis-cli BGSAVE

# 备份 RDB 文件
docker cp beeclaw-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

---

## 8. 安全检查清单

生产上线前请逐一确认：

### 网络安全

- [ ] 配置 TLS / HTTPS（Let's Encrypt 或自有证书）
- [ ] 启用 HSTS 响应头
- [ ] 配置防火墙，仅开放必要端口（443、3000 仅内网）
- [ ] Prometheus/Grafana 端口（9090/3001）不暴露到公网
- [ ] 配置 `BEECLAW_CORS_ORIGINS` 限制前端域名

### 认证与凭据

- [ ] 设置 `BEECLAW_API_KEY`（32+ 字符强密钥）
- [ ] 修改 PostgreSQL 默认密码（`POSTGRES_PASSWORD`）
- [ ] 修改 Grafana 默认密码（`GRAFANA_ADMIN_PASSWORD`）
- [ ] Redis 设置认证密码（分布式模式）
- [ ] `.env` 文件权限 `chmod 600`
- [ ] LLM API Key 不写入代码或镜像

### 监控与告警

- [ ] 部署 Prometheus + Grafana 监控栈
- [ ] 加载 `alerting_rules.yml` 告警规则
- [ ] 配置告警通知渠道（Slack / Email / Webhook）
- [ ] 测试告警触发和通知投递

### 资源与性能

- [ ] Docker 配置内存/CPU 资源限制
- [ ] 调整 `NODE_OPTIONS` 堆内存上限
- [ ] Tick 间隔与 Agent 数量匹配服务器规格
- [ ] PostgreSQL 参数调优

### 数据保护

- [ ] 配置数据库自动备份（cron / 脚本）
- [ ] 定期验证备份可恢复性
- [ ] 日志轮转已配置（Docker 或 logrotate）
- [ ] 备份文件异地存储

---

*最后更新：2026-03-18*
