# BeeClaw 🐝🔮

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

## 成本控制

不靠阉割 Agent，靠架构：

- **模型分层** — 50-60% 本地免费模型，30-40% 便宜云模型，5-10% 强模型
- **选择性激活** — 1000 Agent 每 tick 只唤醒 50-200 个
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

## 许可证

[MIT](LICENSE)

---

**BeeQueen 集团出品** 🐝
