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

## 快速开始

```bash
# 安装依赖
npm install

# 构建
npm run build

# 启动世界（50 个 Agent，默认金融场景）
npm run start -- --agents 50 --scenario financial

# 注入事件
npm run inject -- --event "央行宣布降息50个基点"

# 查看世界状态
npm run status
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

- TypeScript (Node.js)
- PostgreSQL + Redis
- Ollama / vLLM (本地 LLM)
- OpenAI 兼容 API (云 LLM)
- React + D3.js (可视化)
- Docker Compose

## 文档

- [架构设计](docs/ARCHITECTURE.md)

---

**BeeQueen 集团出品** 🐝
