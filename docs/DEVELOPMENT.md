# BeeClaw 开发者指南

## 目录

- [项目概述](#项目概述)
- [开发环境搭建](#开发环境搭建)
- [项目结构](#项目结构)
- [包依赖关系](#包依赖关系)
- [各包职责说明](#各包职责说明)
- [构建与运行](#构建与运行)
- [测试](#测试)
- [代码规范](#代码规范)
- [如何添加新包](#如何添加新包)
- [核心概念](#核心概念)
- [开发工作流](#开发工作流)

---

## 项目概述

BeeClaw（蜂蜂大世界）是一个群体智能仿真引擎。核心理念是让数百到数千个**完整 LLM Agent** 组成持续演化的平行世界，通过群体涌现预测现实趋势。

关键设计决策：
- Agent 是**完整的 LLM Agent**而非轻量状态机，每个 Agent 有独立的人格、记忆和社交关系
- 世界是**回合制**的（tick-based），不是实时的
- 事件通过 Social Graph 计算传播路径
- 三层模型策略（local/cheap/strong）控制 LLM 成本

---

## 开发环境搭建

### 前置条件

- Node.js >= 20（推荐 22）
- npm >= 9
- LLM 服务（开发推荐使用 [Ollama](https://ollama.ai/) 本地运行）

### 初始化

```bash
# 克隆仓库
git clone https://github.com/Mouseww/beeclaw.git
cd beeclaw

# 安装所有包的依赖（npm workspaces 会自动处理）
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少配置 LLM 服务地址

# 构建所有包
npm run build

# 运行测试
npm run test
```

### 推荐的 Ollama 配置

```bash
ollama pull qwen2.5:7b   # 开发足够用
```

---

## 项目结构

```
beeclaw/
├── package.json              # monorepo 根配置
├── tsconfig.base.json        # TypeScript 基础配置（ES2022 + Node16）
├── eslint.config.js          # ESLint 配置
├── .prettierrc               # Prettier 配置
├── .env.example              # 环境变量模板
├── Dockerfile                # 多阶段 Docker 构建
├── docker-compose.yml        # Docker Compose 配置
├── config/
│   └── default.yaml          # 默认配置文件
├── docs/
│   ├── ARCHITECTURE.md       # 详细架构设计文档
│   ├── API.md                # REST API 参考
│   ├── DEPLOYMENT.md         # 部署指南
│   └── DEVELOPMENT.md        # （本文件）
├── CHANGELOG.md              # 版本变更记录
└── packages/
    ├── shared/               # 共享类型和工具函数
    ├── agent-runtime/        # Agent 运行时
    ├── social-graph/         # 社交网络
    ├── event-bus/            # 事件总线
    ├── consensus/            # 共识引擎
    ├── world-engine/         # 世界引擎（主循环）
    ├── event-ingestion/      # 外部事件接入
    ├── server/               # Fastify HTTP 服务
    ├── cli/                  # 命令行工具
    └── dashboard/            # React 可视化面板
```

---

## 包依赖关系

```
shared (基础层，无外部依赖)
  ├── social-graph
  ├── consensus
  ├── agent-runtime
  └── event-bus → social-graph
        └── event-ingestion → event-bus
              └── world-engine → (agent-runtime, event-bus, social-graph, consensus)
                    ├── server → (world-engine + Fastify + SQLite)
                    ├── cli → (world-engine)
                    └── dashboard → (React + Vite, 独立前端)
```

构建必须遵循依赖顺序。`npm run build` 脚本已按正确顺序编排。

---

## 各包职责说明

### `@beeclaw/shared`

共享类型定义和工具函数。所有 interface/type 的来源。

关键文件：
- `types.ts` — 全局类型定义（`AgentPersona`, `WorldConfig`, `TickResult`, `ConsensusSignal` 等）
- `utils.ts` — 通用工具函数
- `logger.ts` — 日志工具

### `@beeclaw/agent-runtime`

Agent 核心运行时，负责 Agent 的人格、记忆和 LLM 交互。

关键文件：
- `Agent.ts` — Agent 核心类（每个 Agent 有独立 system prompt）
- `AgentMemory.ts` — 记忆系统（短期/长期/观点/预测）
- `AgentPersona.ts` — 人格生成
- `AgentSpawner.ts` — 动态孵化器
- `ModelRouter.ts` — 多模型路由（三层模型分配策略）
- `LLMClient.ts` — LLM 调用客户端（OpenAI 兼容）
- `BatchInference.ts` — 批量推理优化（减少 API 调用开销）
- `ResponseCache.ts` — 响应缓存

### `@beeclaw/social-graph`

社交网络图结构，管理 Agent 之间的关系。

功能：图结构存储、信息传播算法、社区发现。

### `@beeclaw/event-bus`

事件分发引擎，管理事件的注入、传播和生命周期。

功能：事件注入、基于 Social Graph 的传播路径计算、传播规则。

### `@beeclaw/consensus`

共识引擎，从 Agent 群体响应中提取趋势信号。

功能：情绪聚合、趋势检测、共识信号生成。

### `@beeclaw/world-engine`

世界引擎，协调所有子系统的主循环。

关键文件：
- `WorldEngine.ts` — 主循环引擎（tick 调度）
- `WorldState.ts` — 世界状态管理
- `TickScheduler.ts` — 回合调度器
- `ScenarioRunner.ts` — 场景推演运行器
- `AgentActivationPool.ts` — Agent 激活池（性能优化，选择性激活）
- `NaturalSelection.ts` — 自然选择 / 淘汰机制

### `@beeclaw/event-ingestion`

外部事件自动接入模块。

功能：RSS/Atom 解析、Yahoo Finance 数据源、市场情绪分析、事件重要性评估。

### `@beeclaw/server`

Fastify HTTP 服务，提供 REST API、WebSocket 和 Dashboard 托管。

结构：
- `api/` — REST 路由（agents, events, consensus, status, history, scenario, config, metrics, health, prometheus）
- `ws/` — WebSocket 处理（实时推送 + 心跳检测）
- `persistence/` — SQLite 持久化层

### `@beeclaw/cli`

命令行接口，用于快速启动仿真、注入事件、查看状态。

命令：
- `beeclaw` — 启动仿真主循环
- `beeclaw-inject` — 注入事件
- `beeclaw-status` — 系统状态检查
- `beeclaw-scenario` — 场景模板管理

### `@beeclaw/dashboard`

React 前端可视化面板。

技术栈：React 18 + Vite + TypeScript + TailwindCSS + D3.js + React Router

页面：世界总览、Agent 列表/详情、事件时间线、共识面板、Social Graph 力导向图。

---

## 构建与运行

### 构建

```bash
# 构建所有包（按依赖顺序）
npm run build

# 构建单个包
npm run build --workspace=packages/shared
npm run build --workspace=packages/agent-runtime

# 清理所有构建产物
npm run clean
```

### 运行

```bash
# 启动 HTTP Server（包含 Dashboard + API + WebSocket）
npm run serve

# 启动 CLI 模式
npm run start -- --agents 20 --ticks 5 --seed "央行宣布加息"

# 注入事件
npm run inject -- "某科技公司发布重大产品" --category tech --tags 科技,新品

# 系统状态检查
npm run status
```

### 代码质量

```bash
# ESLint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix

# Prettier 格式化
npm run format

# Prettier 格式检查
npm run format:check
```

---

## 测试

项目使用 [Vitest](https://vitest.dev/) 作为测试框架，当前覆盖 799+ 测试用例。

### 运行测试

```bash
# 运行所有包的测试
npm run test

# 运行单个包的测试
npm run test --workspace=packages/shared
npm run test --workspace=packages/agent-runtime

# 监听模式（开发时使用）
npx vitest --workspace=packages/agent-runtime
```

### 测试配置

- 后端包：使用默认 Vitest 配置（Node 环境）
- Dashboard 包：使用独立的 `vitest.config.ts`（jsdom 环境 + React plugin），搭配 `@testing-library/react`

### 测试约定

1. 测试文件与源码同目录，命名为 `*.test.ts`（或 `*.test.tsx`）
2. 使用 `describe` / `it` 组织测试
3. Mock 外部依赖（LLM 调用、数据库等）
4. 每个新功能或 bug 修复都应附带测试

---

## 代码规范

### TypeScript 配置

- Target: **ES2022**
- Module: **Node16**（ESM）
- 严格模式（`strict: true`）
- 启用 composite 模式（monorepo 项目引用）
- 声明文件生成（`declaration: true`）

### 编码约定

- 所有 `interface` / `type` 定义在 `shared` 包或各包的 `types.ts`
- 异步操作统一用 `async/await`
- 错误处理要完整，不要 swallow errors
- 日志当前使用 `console`（后期可替换为 winston/pino）
- 代码注释保持与现有代码库注释语言一致（主要为中文）

### Prettier 配置

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100
}
```

---

## 如何添加新包

1. **创建包目录**

```bash
mkdir -p packages/my-package/src
```

2. **初始化 package.json**

```json
{
  "name": "@beeclaw/my-package",
  "version": "0.5.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run"
  },
  "dependencies": {
    "@beeclaw/shared": "workspace:*"
  }
}
```

3. **创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

4. **创建入口文件**

```bash
touch packages/my-package/src/index.ts
```

5. **更新根构建脚本**

在根 `package.json` 的 `build` 脚本中，按依赖顺序添加新包的构建命令。

6. **安装依赖**

```bash
npm install
```

workspace 引用会自动被 npm 处理。

7. **别忘了**
   - 更新 `Dockerfile` 添加新包的 `COPY` 和 `RUN build` 行
   - 如果有测试，确认 `npm run test` 能正确运行

---

## 核心概念

### Tick（回合）

世界引擎以固定间隔推进回合。每个 tick 内：

1. 激活池筛选本轮应激活的 Agent
2. 传播当前活跃事件到被激活的 Agent
3. Agent 调用 LLM 生成响应（观点 + 情绪 + 行为）
4. 共识引擎分析所有响应，生成信号
5. 更新世界状态

### Agent 三层模型

根据 Agent 的角色和影响力分配不同层级的 LLM：

| 层级 | 占比 | 典型用途 |
|------|------|----------|
| `local` | 50–60% | 本地免费模型，普通 Agent |
| `cheap` | 30–40% | 低成本云模型，中等 Agent |
| `strong` | 5–10% | 高能力模型，高影响力 Agent |

### 事件传播

事件注入后，通过 Social Graph 的关系网络传播：

1. 事件根据 `propagationRadius` 确定传播范围
2. 传播路径由 Social Graph 计算
3. 信息沿着关系链逐 tick 扩散

### 共识信号

共识引擎从 Agent 群体的响应中提取：

- 情绪分布（bullish / bearish / neutral）
- 趋势方向
- 共识度
- 预警信号

---

## 开发工作流

### 日常开发

1. 在对应包的 `src/` 下修改代码
2. 构建受影响的包 `npm run build --workspace=packages/<name>`
3. 运行测试 `npm run test --workspace=packages/<name>`
4. 使用 CLI 或 Server 验证功能

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
feat: 新增 Agent 情绪衰减机制
fix: 修复 EventBus 事件传播死循环
docs: 更新 API 文档
chore: 更新依赖版本
refactor: 重构 ModelRouter 配置加载逻辑
test: 补充 ConsensusEngine 边界测试
```

### 分支策略

- `master` — 主分支，保持可发布状态
- 功能开发在 feature 分支进行，完成后合并到 master
