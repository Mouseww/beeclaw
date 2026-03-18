#!/usr/bin/env bash
# ============================================================================
# BeeClaw — 部署验证脚本
#
# 用途: 验证 BeeClaw 部署是否正确运行
# 支持: Docker Compose / Kubernetes / 手动部署
#
# 用法:
#   ./scripts/verify-deployment.sh [OPTIONS]
#
# 选项:
#   --base-url URL    BeeClaw 服务基础 URL (默认: http://localhost:3000)
#   --timeout SECS    等待服务就绪的超时时间 (默认: 120)
#   --k8s             启用 Kubernetes 检查
#   --namespace NS    K8s 命名空间 (默认: beeclaw)
#   --distributed     检查分布式组件 (Worker)
#   --monitoring      检查监控栈 (Prometheus/Grafana)
#   --verbose         显示详细输出
#   --help            显示帮助
# ============================================================================

set -euo pipefail

# ── 默认参数 ──
BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMEOUT=120
K8S_MODE=false
NAMESPACE="beeclaw"
CHECK_DISTRIBUTED=false
CHECK_MONITORING=false
VERBOSE=false

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── 计数器 ──
PASSED=0
FAILED=0
SKIPPED=0

# ── 解析参数 ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --k8s) K8S_MODE=true; shift ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --distributed) CHECK_DISTRIBUTED=true; shift ;;
    --monitoring) CHECK_MONITORING=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    --help)
      head -20 "$0" | tail -17
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── 工具函数 ──
log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_pass()  { echo -e "${GREEN}[PASS]${NC}  $*"; ((PASSED++)); }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $*"; ((FAILED++)); }
log_skip()  { echo -e "${YELLOW}[SKIP]${NC}  $*"; ((SKIPPED++)); }
log_debug() { $VERBOSE && echo -e "       $*" || true; }

check_command() {
  command -v "$1" >/dev/null 2>&1
}

# HTTP 请求（含重试）
http_check() {
  local url="$1"
  local expected_status="${2:-200}"
  local description="$3"

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected_status" ]]; then
    log_pass "$description (HTTP $status)"
    return 0
  else
    log_fail "$description (期望 HTTP $expected_status, 实际 $status)"
    return 1
  fi
}

# HTTP 请求并检查 JSON 字段
http_json_check() {
  local url="$1"
  local jq_filter="$2"
  local expected="$3"
  local description="$4"

  if ! check_command jq; then
    log_skip "$description (jq 未安装)"
    return 0
  fi

  local response
  response=$(curl -s --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "")

  if [[ -z "$response" ]]; then
    log_fail "$description (无响应)"
    return 1
  fi

  local actual
  actual=$(echo "$response" | jq -r "$jq_filter" 2>/dev/null || echo "parse_error")

  if [[ "$actual" == "$expected" ]]; then
    log_pass "$description ($jq_filter = $actual)"
    return 0
  else
    log_fail "$description (期望 $jq_filter = $expected, 实际 $actual)"
    log_debug "响应: $response"
    return 1
  fi
}

# ── 等待服务就绪 ──
wait_for_service() {
  log_info "等待服务就绪 (最长 ${TIMEOUT}s)..."
  local elapsed=0
  while [[ $elapsed -lt $TIMEOUT ]]; do
    if curl -s -o /dev/null --connect-timeout 2 --max-time 5 "$BASE_URL/health" 2>/dev/null; then
      log_pass "服务已就绪 (${elapsed}s)"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log_fail "服务未能在 ${TIMEOUT}s 内就绪"
  return 1
}

# ============================================================================
# 检查项
# ============================================================================

echo ""
echo "=============================================="
echo "  BeeClaw 部署验证"
echo "  URL: $BASE_URL"
echo "=============================================="
echo ""

# ── 1. 基础连通性 ──
log_info "── 1. 基础连通性 ──"
wait_for_service || { echo -e "\n${RED}服务不可达，中止验证${NC}"; exit 1; }

# ── 2. 健康检查端点 ──
log_info "── 2. 健康检查端点 ──"
http_check "$BASE_URL/health" "200" "GET /health"
http_check "$BASE_URL/healthz/live" "200" "GET /healthz/live (liveness)"
http_json_check "$BASE_URL/healthz/live" ".status" "alive" "Liveness 状态"

# readiness 可能需要更长时间（等待 Agent 启动）
sleep 3
http_check "$BASE_URL/healthz/ready" "200" "GET /healthz/ready (readiness)" || true
http_json_check "$BASE_URL/healthz/ready" ".checks.engine" "running" "引擎运行状态" || true

# ── 3. 指标端点 ──
log_info "── 3. 指标端点 ──"
http_check "$BASE_URL/metrics" "200" "GET /metrics (JSON)"
http_check "$BASE_URL/metrics/prometheus" "200" "GET /metrics/prometheus"

# 检查 Prometheus 格式正确性
PROM_RESPONSE=$(curl -s --connect-timeout 5 "$BASE_URL/metrics/prometheus" 2>/dev/null || echo "")
if echo "$PROM_RESPONSE" | grep -q "^beeclaw_uptime_seconds"; then
  log_pass "Prometheus 指标格式正确 (beeclaw_uptime_seconds 存在)"
else
  log_fail "Prometheus 指标格式异常 (缺少 beeclaw_uptime_seconds)"
fi

if echo "$PROM_RESPONSE" | grep -q "^beeclaw_agents_total"; then
  log_pass "Agent 指标存在 (beeclaw_agents_total)"
else
  log_fail "Agent 指标缺失"
fi

if echo "$PROM_RESPONSE" | grep -q "^beeclaw_memory_rss_bytes"; then
  log_pass "内存指标存在 (beeclaw_memory_rss_bytes)"
else
  log_fail "内存指标缺失"
fi

# ── 4. API 功能 ──
log_info "── 4. API 功能 ──"
http_check "$BASE_URL/api/status" "200" "GET /api/status"
http_check "$BASE_URL/api/agents" "200" "GET /api/agents"
http_check "$BASE_URL/api/events" "200" "GET /api/events"

# ── 5. Kubernetes 检查 ──
if $K8S_MODE; then
  log_info "── 5. Kubernetes 检查 ──"
  if check_command kubectl; then
    # Namespace
    if kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
      log_pass "命名空间 $NAMESPACE 存在"
    else
      log_fail "命名空间 $NAMESPACE 不存在"
    fi

    # Coordinator Pod
    COORD_READY=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/component=coordinator \
      -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "")
    if [[ "$COORD_READY" == "True" ]]; then
      log_pass "Coordinator Pod Ready"
    else
      log_fail "Coordinator Pod 不 Ready (status=$COORD_READY)"
    fi

    # Worker Pods
    WORKER_COUNT=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/component=worker \
      --field-selector status.phase=Running -o name 2>/dev/null | wc -l)
    if [[ "$WORKER_COUNT" -gt 0 ]]; then
      log_pass "Worker Pods 运行中 (${WORKER_COUNT} 个)"
    else
      log_fail "无运行中的 Worker Pod"
    fi

    # Services
    for svc in beeclaw-coordinator beeclaw-worker beeclaw-postgres beeclaw-redis; do
      if kubectl get svc "$svc" -n "$NAMESPACE" >/dev/null 2>&1; then
        log_pass "Service $svc 存在"
      else
        log_fail "Service $svc 缺失"
      fi
    done

    # PDB
    PDB_COUNT=$(kubectl get pdb -n "$NAMESPACE" -o name 2>/dev/null | wc -l)
    if [[ "$PDB_COUNT" -gt 0 ]]; then
      log_pass "PodDisruptionBudget 已配置 (${PDB_COUNT} 个)"
    else
      log_skip "PodDisruptionBudget 未配置"
    fi

    # HPA
    if kubectl get hpa beeclaw-worker-hpa -n "$NAMESPACE" >/dev/null 2>&1; then
      log_pass "HPA beeclaw-worker-hpa 已配置"
    else
      log_skip "HPA 未配置"
    fi
  else
    log_skip "kubectl 未安装，跳过 K8s 检查"
  fi
else
  log_skip "── 5. Kubernetes 检查 (未启用 --k8s) ──"
fi

# ── 6. 分布式组件 ──
if $CHECK_DISTRIBUTED; then
  log_info "── 6. 分布式组件 ──"
  # Worker 健康检查（默认端口 3001）
  WORKER_URL="${BASE_URL%:*}:3001"
  http_check "$WORKER_URL/healthz/live" "200" "Worker liveness (:3001)" || true
  http_check "$WORKER_URL/metrics/prometheus" "200" "Worker Prometheus 指标 (:3001)" || true
else
  log_skip "── 6. 分布式组件 (未启用 --distributed) ──"
fi

# ── 7. 监控栈 ──
if $CHECK_MONITORING; then
  log_info "── 7. 监控栈 ──"
  PROM_URL="${PROMETHEUS_URL:-http://localhost:9090}"
  GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"

  http_check "$PROM_URL/-/healthy" "200" "Prometheus 健康" || true
  http_check "$GRAFANA_URL/api/health" "200" "Grafana 健康" || true

  # 检查 Prometheus targets
  if check_command jq; then
    TARGETS=$(curl -s "$PROM_URL/api/v1/targets" 2>/dev/null | jq -r '.data.activeTargets | length' 2>/dev/null || echo "0")
    if [[ "$TARGETS" -gt 0 ]]; then
      log_pass "Prometheus 有 ${TARGETS} 个活跃 target"
    else
      log_fail "Prometheus 无活跃 target"
    fi
  fi
else
  log_skip "── 7. 监控栈 (未启用 --monitoring) ──"
fi

# ============================================================================
# 总结
# ============================================================================

echo ""
echo "=============================================="
echo "  验证结果"
echo "=============================================="
echo -e "  ${GREEN}通过: $PASSED${NC}"
echo -e "  ${RED}失败: $FAILED${NC}"
echo -e "  ${YELLOW}跳过: $SKIPPED${NC}"
echo "=============================================="
echo ""

if [[ $FAILED -gt 0 ]]; then
  echo -e "${RED}部署验证未完全通过，请检查上述失败项。${NC}"
  exit 1
else
  echo -e "${GREEN}部署验证全部通过！${NC}"
  exit 0
fi
