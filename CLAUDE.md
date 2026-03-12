# CLAUDE.md - BeeClaw 项目指南

## 项目概述
BeeClaw (BeeWorld / 蜂蜂大世界) 是一个群体智能仿真引擎。
核心理念：数百到数千个**完整 LLM Agent** 组成持续演化的平行世界，通过群体涌现预测现实趋势。

## 架构文档
详细设计见 `docs/ARCHITECTURE.md`，务必先读。

## 技术栈
- TypeScript + Node.js（ES2022, Node16 模块）
- npm workspaces monorepo
- 存储暂用 SQLite（后期迁移 PostgreSQL）
- LLM 调用通过 OpenAI 兼容 API（支持任意 provider）
- 测试：vitest

## 包结构
```
packages/
  shared/        - 共享类型、工具函数
  world-engine/  - 世界引擎（主循环、Tick 调度、世界状态）
  agent-runtime/ - Agent 运行时（人格、记忆、LLM 调用、孵化器）
  social-graph/  - 社交网络（图结构、传播算法、社区发现）
  event-bus/     - 事件总线（事件分发、外部接入、传播规则）
  consensus/     - 共识引擎（情绪聚合、趋势检测）
  cli/           - CLI 工具（启动、注入事件、查看状态）
```

## 编码规范
- 每个包有自己的 `package.json` 和 `tsconfig.json`
- 包之间通过 workspace 依赖引用
- 所有 interface/type 定义在 `shared` 包或各包的 `types.ts`
- 异步操作统一用 async/await
- 错误处理要完整，不要 swallow errors
- 日志用 console（后期可替换为 winston/pino）

## 构建
```bash
npm install        # 安装所有依赖
npm run build      # 构建所有包
npm run test       # 运行所有测试
```

## MVP 目标
Phase 1：跑通核心链路
1. World Engine 基本 tick 主循环
2. Agent 定义 + LLM 调用（OpenAI 兼容 API）
3. Agent 短期记忆 + 观点记忆
4. Event Bus 事件注入和传播
5. 基本 Social Graph
6. Consensus Engine 情绪聚合
7. CLI 启动/注入/查看
8. Agent Spawner 基本孵化

## 重要约定
- Agent 必须是完整 LLM Agent，不要做轻量状态机
- 每个 Agent 有独立 system prompt（基于 persona 生成）
- LLM 调用结果要解析为结构化响应（opinion + action + emotion）
- 世界是回合制（tick-based），不是实时的
- 事件传播通过 Social Graph 计算路径
- 完成后用 git commit 提交，写清楚 commit message

## GitHub
- 仓库：Mouseww/beeclaw
- 推送到 master 分支
