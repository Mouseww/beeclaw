# BeeClaw 运维手册 (Runbook)

> 本手册面向运维人员，覆盖生产环境部署、日常运维、故障排查流程。

---

## 1. 部署架构速览

```
                     ┌────────────────────┐
                     │     Ingress/LB     │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │   Coordinator Pod   │  ← API + 世界引擎 + Tick 调度
                     │   (单副本, :3000)    │
                     └─────────┬──────────┘
                               │ Redis Pub/Sub
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
          ┌──────────┐  ┌──────────┐  ┌──────────┐
          │ Worker-1 │  │ Worker-2 │  │ Worker-N │  ← LLM 执行 (:3001)
          └──────────┘  └──────────┘  └──────────┘
                │              │              │
                └──────────────┼──────────────┘
                               ▼
                     ┌─────────────────────┐
                     │   PostgreSQL + Redis │
                     └─────────────────────┘
```

### 组件职责

| 组件 | 副本数 | 端口 | 职责 |
|------|--------|------|------|
| Coordinator | 1 (不可横向扩展) | 3000 | API 服务、Tick 调度、共识聚合 |
| Worker | 2-20 (HPA) | 3001 (health) | Agent 执行、LLM 调用 |
| PostgreSQL | 1 | 5432 | 持久化 (Agent 状态、世界状态) |
| Redis | 1 | 6379 | 分布式通信、事件广播 |
| Prometheus | 1 | 9090 | 指标采集 |
| Alertmanager | 1 | 9093 | 告警路由 |
| Grafana | 1 | 3001 | 可视化面板 |

---

## 2. 部署方式

### 2.1 Docker Compose (中小规模)

```bash
# 分布式模式 + PostgreSQL + 监控
docker compose \
  --profile distributed --profile postgres \
  -f docker-compose.yml \
  -f deploy/monitoring/docker-compose.monitoring.yml \
  up -d

# 扩展 Worker
docker compose --profile distributed up -d --scale worker=5
```

### 2.2 Kubernetes (生产推荐)

```bash
# Staging
kubectl apply -k deploy/k8s/overlays/staging

# Production
kubectl apply -k deploy/k8s/overlays/production

# 查看状态
kubectl get all -n beeclaw
kubectl get hpa -n beeclaw
```

---

## 3. 健康检查端点

| 端点 | 组件 | 用途 | 正常响应 |
|------|------|------|----------|
| `GET /health` | Coordinator | 基础存活 | `200 {status: "ok", uptime, version, tick}` |
| `GET /healthz/live` | Coordinator | K8s liveness | `200 {status: "alive"}` |
| `GET /healthz/ready` | Coordinator | K8s readiness | `200 {status: "ready"}` — 需引擎运行且有活跃 Agent；否则 `503 {status: "not_ready"}` |
| `GET /healthz/live` | Worker:3001 | K8s liveness | `200 {status: "alive"}` |
| `GET /healthz/ready` | Worker:3001 | K8s readiness | `200 {status: "ready"}` — 需 Redis 连接正常 |
| `GET /metrics` | Coordinator | JSON 指标 | `200` JSON 格式运行时指标 |
| `GET /metrics/prometheus` | 两者 | Prometheus 抓取 | Prometheus text exposition format |

---

## 4. 关键指标与告警

### 4.1 核心指标

| 指标 | 类型 | 含义 | 正常范围 |
|------|------|------|----------|
| `beeclaw_agents_active` | gauge | 活跃 Agent 数 | > 0 |
| `beeclaw_current_tick` | gauge | 当前 Tick 编号 | 持续递增 |
| `beeclaw_tick_avg_duration_ms` | gauge | 平均 Tick 耗时 | < tick_interval × 80% |
| `beeclaw_llm_calls_failed` | counter | LLM 失败次数 | 失败率 < 10% |
| `beeclaw_memory_heap_used_bytes` | gauge | 堆内存使用 | < 1.5GB |
| `beeclaw_cache_hit_rate` | gauge | 缓存命中率 | > 30% |
| `beeclaw_worker_errors_total` | counter | Worker 错误次数 | 接近 0 |

### 4.2 告警响应

| 告警 | 级别 | 响应流程 |
|------|------|----------|
| **BeeclawDown** | Critical | 1. 检查 Pod 状态 `kubectl get pods -n beeclaw` <br> 2. 查看日志 `kubectl logs -n beeclaw deploy/beeclaw-coordinator --tail=100` <br> 3. 检查资源 `kubectl top pods -n beeclaw` <br> 4. 重启 `kubectl rollout restart deploy/beeclaw-coordinator -n beeclaw` |
| **AllWorkersDown** | Critical | 1. 检查 Redis 连通性 <br> 2. 查看 Worker 日志 <br> 3. 确认 LLM 服务可达 <br> 4. `kubectl rollout restart deploy/beeclaw-worker -n beeclaw` |
| **NoActiveAgents** | Critical | 1. 检查 Readiness 探针 <br> 2. 查看 Coordinator 日志中 Agent Spawner 输出 <br> 3. 检查数据库连接 <br> 4. 手动注入测试事件: `curl -X POST http://coordinator:3000/api/events` |
| **HighLLMFailureRate** | Warning | 1. 检查 LLM 服务状态 <br> 2. 查看错误日志中的具体失败原因 <br> 3. 检查 API Key 有效性 <br> 4. 确认 Rate Limit 未触发 |
| **HighTickDuration** | Warning | 1. 检查活跃 Agent 数量是否过多 <br> 2. 检查 LLM 响应延迟 <br> 3. 考虑增加 Worker <br> 4. 检查 PostgreSQL 慢查询 |
| **HighMemoryUsage** | Warning | 1. 检查 Agent 记忆是否膨胀 <br> 2. 确认记忆压缩正常工作 <br> 3. 检查是否存在内存泄漏 <br> 4. 考虑扩大资源限制或减少 Agent |
| **PodCrashLooping** | Critical | 1. `kubectl describe pod <name> -n beeclaw` <br> 2. 查看上一次崩溃日志 `kubectl logs <pod> -n beeclaw --previous` <br> 3. 检查 OOMKilled <br> 4. 检查 startupProbe 是否超时 |

---

## 5. 日常运维操作

### 5.1 滚动升级

```bash
# Docker Compose
docker compose pull && docker compose up -d

# Kubernetes
kubectl set image deployment/beeclaw-coordinator coordinator=ghcr.io/mouseww/beeclaw:v2.1.0 -n beeclaw
kubectl set image deployment/beeclaw-worker worker=ghcr.io/mouseww/beeclaw:v2.1.0 -n beeclaw
kubectl rollout status deployment/beeclaw-coordinator -n beeclaw
kubectl rollout status deployment/beeclaw-worker -n beeclaw
```

### 5.2 回滚

```bash
# 查看历史版本
kubectl rollout history deployment/beeclaw-coordinator -n beeclaw

# 回滚到上一版本
kubectl rollout undo deployment/beeclaw-coordinator -n beeclaw
kubectl rollout undo deployment/beeclaw-worker -n beeclaw
```

### 5.3 手动扩缩容

```bash
# 调整 Worker 副本数
kubectl scale deployment/beeclaw-worker --replicas=8 -n beeclaw

# 查看 HPA 状态
kubectl get hpa beeclaw-worker-hpa -n beeclaw
```

### 5.4 数据库维护

```bash
# 进入 PostgreSQL
kubectl exec -it statefulset/beeclaw-postgres -n beeclaw -- psql -U beeclaw -d beeclaw

# 常用查询
SELECT count(*) FROM agents WHERE status = 'active';
SELECT tick, duration_ms FROM tick_history ORDER BY tick DESC LIMIT 10;

# 备份
kubectl exec beeclaw-postgres-0 -n beeclaw -- \
  pg_dump -U beeclaw -d beeclaw -Fc > backup_$(date +%Y%m%d_%H%M).dump
```

### 5.5 查看日志

```bash
# Coordinator 日志 (JSON 格式，可配合 jq)
kubectl logs -f deploy/beeclaw-coordinator -n beeclaw | jq .

# Worker 日志
kubectl logs -f deploy/beeclaw-worker -n beeclaw --all-containers

# 查看特定 Worker
kubectl logs -f <worker-pod-name> -n beeclaw
```

---

## 6. 灾难恢复

### 6.1 Coordinator 崩溃

Coordinator 是单点，崩溃后 Tick 停滞。K8s 会自动重启。

1. Pod 重启后自动从 PostgreSQL 恢复世界状态
2. Worker 会自动重连 (Redis reconnect)
3. 检查 Tick 是否恢复递增：`curl http://coordinator:3000/api/status`

### 6.2 Worker 全部崩溃

Tick 会因为缺少 Worker 超时。

1. 检查 Redis 连通性
2. 检查 LLM 服务可达
3. 重启所有 Worker：`kubectl rollout restart deploy/beeclaw-worker -n beeclaw`
4. 等待 Worker Ready 后 Coordinator 自动恢复调度

### 6.3 PostgreSQL 数据丢失

1. 停止 Coordinator：`kubectl scale deploy/beeclaw-coordinator --replicas=0 -n beeclaw`
2. 恢复备份：`pg_restore -U beeclaw -d beeclaw backup.dump`
3. 重启 Coordinator：`kubectl scale deploy/beeclaw-coordinator --replicas=1 -n beeclaw`

### 6.4 Redis 故障

Redis 丢失不影响持久化数据，仅中断分布式通信。

1. 重启 Redis：`kubectl rollout restart statefulset/beeclaw-redis -n beeclaw`
2. Coordinator 和 Worker 的 RedisTransportLayer 会自动重连
3. 可能丢失当前 Tick 正在传输的消息（下一 Tick 自动恢复）

---

## 7. 性能调优清单

- [ ] **Agent 数量 vs Worker 数量**：每个 Worker 建议负载 50-200 个 Agent
- [ ] **LLM 并发**：Worker 内部已有批量推理，确保 LLM 服务端并发足够
- [ ] **PostgreSQL 连接池**：默认 20 连接，高负载可提高到 50-100
- [ ] **Redis maxmemory**：默认 512MB，千级 Agent 建议 1GB+
- [ ] **Node.js 堆内存**：默认无限制，可设置 `--max-old-space-size=4096`
- [ ] **Tick 间隔**：根据 Agent 数量和 LLM 响应时间调整
- [ ] **缓存策略**：监控 `beeclaw_cache_hit_rate`，低于 30% 需调优

---

*BeeClaw Ops Runbook — BeeQueen 集团 SRE 团队*
