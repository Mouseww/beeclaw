# BeeClaw — 分布式 Tick 架构设计

> Phase 2.3 水平扩展基础，支持多 Worker 节点并行执行 Agent Tick

---

## 1. 设计目标

单节点 `WorldEngine` 受 LLM 并发限制，Agent 规模上限约 500-1000。分布式 Tick 架构将 Agent 分片到多个 Worker 节点并行执行，突破单节点瓶颈。

**核心目标：**
- 支持 N 个 Worker 节点并行处理 Agent，线性扩展 LLM 吞吐
- 保证每个 Tick 的全局一致性（所有 Worker 执行同一个 tick 编号）
- 跨节点事件同步，Agent 响应产生的内部事件能传播到其他 Worker
- 共识聚合支持分布式收集（各节点上报局部信号 → Coordinator 汇总）

**设计约束：**
- 先实现 in-process 版本（所有 Worker 在同一进程内），验证协调逻辑正确性
- 通信层通过接口抽象，后续可替换为 Redis/NATS 而不改变业务逻辑
- Leader-Follower 模式，不引入复杂的分布式共识算法

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│                   TickCoordinator                    │
│            (Leader — 协调 Tick 生命周期)               │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │   Tick 状态   │  │ AgentPartitioner│  │ 共识汇总  │  │
│  │   管理        │  │ (分片策略)       │  │          │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
└────────┬──────────────────┬──────────────────┬───────┘
         │                  │                  │
    ┌────┴────┐       ┌─────┴────┐       ┌────┴─────┐
    │ Worker 0│       │ Worker 1 │       │ Worker N │
    │         │       │          │       │          │
    │ Agent   │       │ Agent    │       │ Agent    │
    │ [0..99] │       │ [100..199│       │ [200..N] │
    │         │       │          │       │          │
    │ EventBus│       │ EventBus │       │ EventBus │
    │(本地队列)│       │(本地队列) │       │(本地队列) │
    └────┬────┘       └────┬─────┘       └────┬─────┘
         │                 │                  │
         └────────┬────────┴──────────────────┘
                  │
           ┌──────┴───────┐
           │  EventRelay   │
           │ (跨节点事件中继)│
           └──────────────┘
```

---

## 3. Worker 节点的 Agent 分片策略

### 3.1 分片算法

采用 **ID 范围分片**（Range Partitioning），按 Agent ID 排序后均匀分配到各 Worker。

```typescript
interface PartitionAssignment {
  workerId: string;
  agentIds: string[];
}

// 分片计算
function partition(agentIds: string[], workerCount: number): PartitionAssignment[]
```

**选择 Range Partitioning 的理由：**
- Agent 数量在 tick 间变化不频繁，不需要一致性哈希的复杂度
- 分片结果可预测，便于调试
- 新 Agent 加入时只需追加到尾部 Worker，重分片代价小

### 3.2 再分片时机

- 初始化时：所有 Agent 一次性分配
- 新 Agent 孵化后：由 Coordinator 重新分片并通知 Worker
- Worker 上线/下线：触发全量重分片

### 3.3 分片一致性

在一个 Tick 执行期间，分片不会变更。分片变更只在 Tick 间隙（Tick 完成后、下一个 Tick 开始前）发生。

---

## 4. Tick 协调机制（Leader-Follower）

### 4.1 角色定义

| 角色 | 职责 |
|------|------|
| **Leader (TickCoordinator)** | 推进 tick 编号、分发事件、收集结果、汇总共识 |
| **Follower (Worker)** | 执行分配的 Agent 处理逻辑，上报结果 |

### 4.2 Tick 生命周期

一个完整 Tick 的执行流程：

```
Phase 1: Prepare (Leader)
  ├── 推进 tick 编号
  ├── 收集待处理事件（外部注入 + 上一 tick 的级联事件）
  └── 广播 TickBegin { tick, events } 到所有 Worker

Phase 2: Execute (Worker 并行)
  ├── 接收事件列表
  ├── 计算本地 Agent 激活范围
  ├── 并发调用 Agent.react()
  ├── 收集响应和新产生的内部事件
  └── 上报 WorkerTickResult { responses, newEvents, signals }

Phase 3: Aggregate (Leader)
  ├── 等待所有 Worker 上报完成（或超时）
  ├── 汇总 Agent 响应 → 共识引擎分析
  ├── 收集跨节点内部事件 → 放入下一 tick 的事件队列
  ├── 执行孵化检查、自然选择
  └── 广播 TickComplete { tick, result }
```

### 4.3 超时与容错

- Worker 上报有超时限制（默认 30s），超时的 Worker 本轮结果丢弃
- Leader 记录 Worker 健康状态，连续 3 次超时标记为不健康
- 不健康 Worker 的 Agent 在下次重分片时迁移到其他 Worker

---

## 5. 跨节点事件同步方案

### 5.1 事件分类

| 类型 | 来源 | 同步策略 |
|------|------|---------|
| 外部事件 | EventBus 注入 | Leader 广播到全部 Worker |
| Agent 内部事件 | Agent.react() 产生 | Worker 上报 → Leader 收集 → 下一 tick 广播 |

### 5.2 EventRelay 职责

- 收集各 Worker 产生的内部事件
- 去重（同一事件不重复传播）
- 放入下一 Tick 的事件队列
- 不在当前 Tick 内做级联传播（简化设计，级联在后续 Tick 自然发生）

### 5.3 事件传播简化

单节点 `WorldEngine` 支持同 tick 内 3 层级联传播。分布式模式下简化为：

**当前 Tick 内不做级联**，Agent 产生的内部事件进入下一 Tick 的事件队列。

理由：
- 同 tick 级联需要跨节点实时同步，复杂度高且延迟大
- 回合制仿真中，延迟一个 tick 传播对结果影响极小
- 大幅简化 Coordinator 实现

---

## 6. 共识聚合的分布式方案

### 6.1 二阶段聚合

```
Worker 层 → 局部聚合（对本地 Agent 响应做初步统计）
  ↓
Leader 层 → 全局聚合（合并所有 Worker 局部结果，计算最终共识信号）
```

### 6.2 局部上报数据

每个 Worker 上报：
```typescript
interface WorkerTickResult {
  workerId: string;
  tick: number;
  // Agent 响应记录（含 agentId、观点、情绪等结构化数据）
  responses: AgentResponseRecord[];
  // 本地 Agent 产生的新事件
  newEvents: WorldEvent[];
  // 处理统计
  agentsActivated: number;
  durationMs: number;
}
```

### 6.3 Leader 聚合流程

1. 收集所有 Worker 的 `responses`
2. 按事件分组，合并到一个 `AgentResponseRecord[]`
3. 调用 `ConsensusEngine.analyze()` 生成全局共识信号
4. 结果存入历史 + 推送到 API 层

---

## 7. 通信层抽象

### 7.1 TransportLayer 接口

```typescript
interface TransportLayer {
  // Leader → Worker
  sendToWorker(workerId: string, message: CoordinatorMessage): Promise<void>;
  broadcastToWorkers(message: CoordinatorMessage): Promise<void>;

  // Worker → Leader
  sendToLeader(message: WorkerMessage): Promise<void>;

  // 消息订阅
  onWorkerMessage(workerId: string, handler: (message: CoordinatorMessage) => void): void;
  onLeaderMessage(handler: (message: WorkerMessage) => void): void;

  // Worker 注册
  registerWorker(workerId: string): void;
  unregisterWorker(workerId: string): void;
  getRegisteredWorkerIds(): string[];
}
```

### 7.2 实现策略

| 阶段 | 实现 | 适用场景 |
|------|------|---------|
| v1 | InProcessTransport | 测试、单机多 Worker 模拟 |
| v2 | RedisTransportLayer | 多节点部署，基于 Redis Pub/Sub |
| v3 | NATSTransportLayer | 高性能场景，基于 NATS（更低延迟、更轻量） |

`InProcessTransport` 使用同步回调在同一进程内模拟消息传递，接口与远程实现完全一致。

### 7.3 RedisTransportLayer 使用指南

#### 安装依赖

`ioredis` 已包含在 `@beeclaw/coordinator` 包的依赖中，无需单独安装。

#### 连接配置

```typescript
import { RedisTransportLayer } from '@beeclaw/coordinator';
import type { RedisTransportConfig } from '@beeclaw/coordinator';

const config: RedisTransportConfig = {
  host: '127.0.0.1',   // Redis 主机，默认 127.0.0.1
  port: 6379,           // Redis 端口，默认 6379
  password: 'secret',   // Redis 密码（可选）
  db: 0,                // 数据库编号，默认 0
  prefix: 'beeclaw',    // Channel 前缀，默认 'beeclaw'
};

const transport = new RedisTransportLayer(config);
await transport.connect();
```

#### Channel 设计

| Channel | 格式 | 用途 |
|---------|------|------|
| Worker 专属 | `{prefix}:worker:{workerId}` | Coordinator → 指定 Worker |
| Leader | `{prefix}:leader` | Worker → Leader |
| 广播 | `{prefix}:broadcast` | Coordinator → 所有 Worker |
| Worker 注册表 | `{prefix}:workers` (Redis Set) | 跨进程 Worker 发现 |

#### 多进程启动示例

**Leader 进程 (coordinator.ts):**

```typescript
import { TickCoordinator, RedisTransportLayer } from '@beeclaw/coordinator';

const transport = new RedisTransportLayer({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
});

await transport.connect();

const coordinator = new TickCoordinator(transport, {
  workerTimeoutMs: 30000,
  unhealthyThreshold: 3,
});

// Leader 监听 Worker 消息
transport.onLeaderMessage((message) => {
  coordinator.handleWorkerMessage(message);
});

// 等待 Worker 注册后开始 tick 循环
console.log('[Leader] Waiting for workers...');
```

**Worker 进程 (worker.ts):**

```typescript
import { Worker, RedisTransportLayer } from '@beeclaw/coordinator';

const transport = new RedisTransportLayer({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
});

await transport.connect();

const worker = new Worker(
  { id: `worker-${process.pid}` },
  transport,
  myAgentExecutor,
);

await worker.sendReady();
console.log(`[Worker ${process.pid}] Ready`);
```

**启动命令:**

```bash
# 终端 1 — Leader
REDIS_HOST=localhost node dist/coordinator.js

# 终端 2 — Worker 1
REDIS_HOST=localhost node dist/worker.js

# 终端 3 — Worker 2
REDIS_HOST=localhost node dist/worker.js
```

#### 多集群隔离

通过 `prefix` 配置可在同一 Redis 实例上运行多个独立集群：

```typescript
// 集群 A
const transportA = new RedisTransportLayer({ prefix: 'beeclaw-prod' });

// 集群 B
const transportB = new RedisTransportLayer({ prefix: 'beeclaw-staging' });
```

#### 注意事项

- **两个连接**：ioredis 要求订阅模式下的连接不能执行其它命令，因此 RedisTransportLayer 内部维护独立的 publisher 和 subscriber 连接。
- **连接生命周期**：必须先调用 `connect()` 再使用任何消息方法；退出前调用 `disconnect()` 清理资源。
- **Worker 发现**：`getRegisteredWorkerIds()` 返回本地 handler 集合；`getRegisteredWorkerIdsAsync()` 查询 Redis Set 获取全局列表。
- **序列化**：消息以 JSON 格式序列化，确保所有消息字段可 JSON 序列化。

### 7.4 NATSTransportLayer 使用指南

#### 安装依赖

`nats` 已包含在 `@beeclaw/coordinator` 包的依赖中，无需单独安装。

#### 连接配置

```typescript
import { NATSTransportLayer } from '@beeclaw/coordinator';
import type { NATSTransportConfig } from '@beeclaw/coordinator';

const config: NATSTransportConfig = {
  servers: 'nats://127.0.0.1:4222',  // NATS 服务器，默认 nats://127.0.0.1:4222
  token: 'my-token',                  // 认证 token（可选）
  prefix: 'beeclaw',                  // Subject 前缀，默认 'beeclaw'
};

const transport = new NATSTransportLayer(config);
await transport.connect();
```

#### Subject 设计

| Subject | 格式 | 用途 |
|---------|------|------|
| Worker 专属 | `{prefix}.worker.{workerId}` | Coordinator → 指定 Worker |
| Leader | `{prefix}.leader` | Worker → Leader |
| 广播 | `{prefix}.broadcast` | Coordinator → 所有 Worker |

> 注意：NATS 使用 `.` 作为 subject 层级分隔符（Redis 使用 `:`），支持通配符订阅。

#### 多进程启动示例

**Leader 进程 (coordinator.ts):**

```typescript
import { TickCoordinator, NATSTransportLayer } from '@beeclaw/coordinator';

const transport = new NATSTransportLayer({
  servers: process.env.NATS_URL ?? 'nats://127.0.0.1:4222',
  token: process.env.NATS_TOKEN,
});

await transport.connect();

const coordinator = new TickCoordinator(transport, {
  workerTimeoutMs: 30000,
  unhealthyThreshold: 3,
});

// Leader 监听 Worker 消息
transport.onLeaderMessage((message) => {
  coordinator.handleWorkerMessage(message);
});

console.log('[Leader] Waiting for workers...');
```

**Worker 进程 (worker.ts):**

```typescript
import { Worker, NATSTransportLayer } from '@beeclaw/coordinator';

const transport = new NATSTransportLayer({
  servers: process.env.NATS_URL ?? 'nats://127.0.0.1:4222',
  token: process.env.NATS_TOKEN,
});

await transport.connect();

const worker = new Worker(
  { id: `worker-${process.pid}` },
  transport,
  myAgentExecutor,
);

await worker.sendReady();
console.log(`[Worker ${process.pid}] Ready`);
```

**启动命令:**

```bash
# 启动 NATS 服务器（Docker 方式）
docker run -d --name nats -p 4222:4222 nats:latest

# 终端 1 — Leader
NATS_URL=nats://localhost:4222 node dist/coordinator.js

# 终端 2 — Worker 1
NATS_URL=nats://localhost:4222 node dist/worker.js

# 终端 3 — Worker 2
NATS_URL=nats://localhost:4222 node dist/worker.js
```

#### 多集群隔离

通过 `prefix` 配置可在同一 NATS 服务器上运行多个独立集群：

```typescript
// 集群 A
const transportA = new NATSTransportLayer({ prefix: 'beeclaw-prod' });

// 集群 B
const transportB = new NATSTransportLayer({ prefix: 'beeclaw-staging' });
```

#### NATS vs Redis 对比

| 维度 | Redis Pub/Sub | NATS |
|------|--------------|------|
| 延迟 | 毫秒级 | 微秒级 |
| 依赖 | 需要 Redis 实例 | 轻量级 NATS 服务端 |
| 连接数 | 每客户端需 2 连接（pub + sub） | 单连接 |
| 持久化 | 无（Pub/Sub 不持久化） | 可选 JetStream |
| 集群 | Redis Cluster | 内置集群 + 超级集群 |
| 适用场景 | 已有 Redis 基础设施 | 追求低延迟、高吞吐 |

#### 注意事项

- **单连接**：NATS 客户端只需一个连接即可同时发布和订阅，比 Redis 更简洁。
- **连接生命周期**：必须先调用 `connect()` 再使用任何消息方法；退出前调用 `disconnect()` 清理资源（内部使用 `drain()` 确保消息完整发送）。
- **序列化**：消息以 JSON 格式序列化，通过 `StringCodec` 编解码。
- **Subject 命名**：使用 `.` 分隔层级，便于后续利用 NATS 通配符（`*` / `>`）进行灵活订阅。

---

## 8. 扩展性考虑

### 8.1 Social Graph 查询

当 Agent 分片到不同 Worker 后，Social Graph 的跨节点查询需要处理：

**当前方案（v1）：** 每个 Worker 持有完整 Social Graph 的只读副本。Leader 在 tick 开始时同步图结构变更。

**后续方案：** 集中式 Social Graph 服务，Worker 通过 RPC 查询。

### 8.2 Agent 状态迁移

Worker 下线时，其负责的 Agent 需要迁移到其他 Worker：

1. Agent 状态已持久化到数据库（Phase 2.1 已实现）
2. 新 Worker 从数据库加载 Agent 状态
3. 迁移过程中暂停 Tick 执行

---

*BeeClaw v1.0.33 — 分布式 Tick 架构设计*
