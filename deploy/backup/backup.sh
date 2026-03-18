#!/usr/bin/env bash
# ============================================================================
# BeeClaw — PostgreSQL 自动备份脚本
#
# 安装:
#   cp deploy/backup/backup.sh /opt/beeclaw/backup.sh
#   chmod +x /opt/beeclaw/backup.sh
#
# 使用:
#   /opt/beeclaw/backup.sh                    # 默认备份
#   BACKUP_DIR=/mnt/nas/backups backup.sh     # 自定义备份目录
#
# Cron 定时任务:
#   0 2 * * * /opt/beeclaw/backup.sh >> /var/log/beeclaw-backup.log 2>&1
# ============================================================================

set -euo pipefail

# ── 配置 ─────────────────────────────────────────────────────────────────────

# 备份存储目录
BACKUP_DIR="${BACKUP_DIR:-/opt/beeclaw/backups}"

# Docker 容器名
PG_CONTAINER="${PG_CONTAINER:-beeclaw-postgres}"

# PostgreSQL 连接参数
PG_USER="${POSTGRES_USER:-beeclaw}"
PG_DB="${POSTGRES_DB:-beeclaw}"

# 备份保留天数
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# 时间戳
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# 备份文件（自定义格式，支持索引查看和选择性恢复）
BACKUP_FILE="${BACKUP_DIR}/beeclaw-${TIMESTAMP}.dump"

# ── 函数 ─────────────────────────────────────────────────────────────────────

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    log "ERROR: $*" >&2
    exit 1
}

# ── 主流程 ────────────────────────────────────────────────────────────────────

log "开始 BeeClaw 数据库备份..."

# 创建备份目录
mkdir -p "${BACKUP_DIR}"

# 检查容器是否运行
if ! docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
    error "PostgreSQL 容器 '${PG_CONTAINER}' 未运行"
fi

# 执行备份（pg_dump 自定义格式）
log "正在导出数据库 '${PG_DB}'..."
if docker exec "${PG_CONTAINER}" pg_dump -U "${PG_USER}" -Fc "${PG_DB}" > "${BACKUP_FILE}"; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    log "备份完成: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
    rm -f "${BACKUP_FILE}"
    error "pg_dump 执行失败"
fi

# 验证备份文件
if ! pg_restore --list "${BACKUP_FILE}" > /dev/null 2>&1; then
    # 尝试在容器内验证
    if ! docker exec -i "${PG_CONTAINER}" pg_restore --list < "${BACKUP_FILE}" > /dev/null 2>&1; then
        log "WARNING: 无法验证备份文件完整性（pg_restore --list 失败）"
    fi
fi

# 清理过期备份
log "清理 ${RETENTION_DAYS} 天前的备份..."
DELETED=$(find "${BACKUP_DIR}" -name "beeclaw-*.dump" -mtime +"${RETENTION_DAYS}" -delete -print | wc -l)
log "已删除 ${DELETED} 个过期备份文件"

# 统计当前备份
TOTAL_BACKUPS=$(find "${BACKUP_DIR}" -name "beeclaw-*.dump" | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
log "当前共 ${TOTAL_BACKUPS} 个备份，占用 ${TOTAL_SIZE}"

log "备份任务完成"
