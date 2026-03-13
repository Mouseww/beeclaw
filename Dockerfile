# ============================================================================
# BeeClaw — 多阶段 Docker 构建
# 阶段 1: 编译所有 TypeScript 包
# 阶段 2: 构建 Dashboard (vite build)
# 阶段 3: 精简运行时镜像
# ============================================================================

# ── 阶段 1: 构建 TypeScript 包 ──────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# 先复制依赖清单，利用 Docker 缓存
COPY package.json package-lock.json ./
COPY packages/shared/package.json         packages/shared/
COPY packages/world-engine/package.json   packages/world-engine/
COPY packages/agent-runtime/package.json  packages/agent-runtime/
COPY packages/social-graph/package.json   packages/social-graph/
COPY packages/event-bus/package.json      packages/event-bus/
COPY packages/consensus/package.json      packages/consensus/
COPY packages/event-ingestion/package.json packages/event-ingestion/
COPY packages/server/package.json         packages/server/
COPY packages/cli/package.json            packages/cli/
COPY packages/dashboard/package.json      packages/dashboard/

RUN npm ci

# 复制源码和配置
COPY tsconfig.json ./
COPY packages/ packages/

# 构建所有 TypeScript 包（不含 dashboard，dashboard 用 vite 单独构建）
RUN npm run build --workspace=packages/shared \
 && npm run build --workspace=packages/world-engine \
 && npm run build --workspace=packages/agent-runtime \
 && npm run build --workspace=packages/social-graph \
 && npm run build --workspace=packages/event-bus \
 && npm run build --workspace=packages/consensus \
 && npm run build --workspace=packages/event-ingestion \
 && npm run build --workspace=packages/server \
 && npm run build --workspace=packages/cli

# ── 阶段 2: 构建 Dashboard ─────────────────────────────────────────────────
FROM builder AS dashboard-builder

WORKDIR /app/packages/dashboard
RUN npx vite build

# ── 阶段 3: 精简运行时镜像 ─────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

# 安装 better-sqlite3 所需的运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# 复制依赖清单并只安装生产依赖
COPY package.json package-lock.json ./
COPY packages/shared/package.json         packages/shared/
COPY packages/world-engine/package.json   packages/world-engine/
COPY packages/agent-runtime/package.json  packages/agent-runtime/
COPY packages/social-graph/package.json   packages/social-graph/
COPY packages/event-bus/package.json      packages/event-bus/
COPY packages/consensus/package.json      packages/consensus/
COPY packages/event-ingestion/package.json packages/event-ingestion/
COPY packages/server/package.json         packages/server/
COPY packages/cli/package.json            packages/cli/
COPY packages/dashboard/package.json      packages/dashboard/

RUN npm ci --omit=dev && npm cache clean --force

# 清理构建工具（仅用于 native 模块编译）
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

# 从构建阶段复制编译产物
COPY --from=builder /app/packages/shared/dist         packages/shared/dist
COPY --from=builder /app/packages/world-engine/dist   packages/world-engine/dist
COPY --from=builder /app/packages/agent-runtime/dist  packages/agent-runtime/dist
COPY --from=builder /app/packages/social-graph/dist   packages/social-graph/dist
COPY --from=builder /app/packages/event-bus/dist      packages/event-bus/dist
COPY --from=builder /app/packages/consensus/dist      packages/consensus/dist
COPY --from=builder /app/packages/event-ingestion/dist packages/event-ingestion/dist
COPY --from=builder /app/packages/server/dist         packages/server/dist
COPY --from=builder /app/packages/cli/dist            packages/cli/dist

# 从 dashboard 构建阶段复制静态资源
COPY --from=dashboard-builder /app/packages/dashboard/dist packages/dashboard/dist

# 复制配置文件（如果存在）
COPY config/ config/

# 数据目录
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV BEECLAW_PORT=3000
ENV BEECLAW_HOST=0.0.0.0
ENV BEECLAW_DB_PATH=/app/data/beeclaw.db

EXPOSE 3000

# 启动 server
CMD ["node", "packages/server/dist/index.js"]
