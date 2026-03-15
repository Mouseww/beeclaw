// ============================================================================
// BeeClaw Benchmark — 辅助工具
// 提供 Mock 对象工厂、测试数据生成器和格式化输出
// ============================================================================

import { Agent, AgentSpawner, ModelRouter, LLMClient } from '@beeclaw/agent-runtime';
import { SocialGraph, calculatePropagation } from '@beeclaw/social-graph';
import { EventBus } from '@beeclaw/event-bus';
import { ConsensusEngine } from '@beeclaw/consensus';
import type {
  WorldConfig,
  WorldEvent,
  ModelRouterConfig,
  AgentResponseRecord,
  AgentPersona,
  AgentTemplate,
  ModelTier,
} from '@beeclaw/shared';

// ── Mock 配置 ──────────────────────────────────────────────────────────────────

export const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

export const TEST_WORLD_CONFIG: WorldConfig = {
  tickIntervalMs: 100,
  maxAgents: 10000,
  eventRetentionTicks: 50,
  enableNaturalSelection: false,
};

// ── Mock LLM 响应 ─────────────────────────────────────────────────────────────

const MOCK_LLM_RESPONSE = JSON.stringify({
  opinion: '看好后市发展',
  action: 'speak',
  emotionalState: 0.3,
  reasoning: '基本面向好',
});

// ── 工厂函数 ──────────────────────────────────────────────────────────────────

export function createTestEvent(tick: number, overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: `evt_bench_${tick}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'external',
    category: 'finance',
    title: '央行降息 25 个基点',
    content: '央行宣布降息 25 个基点，市场预期后续将持续宽松',
    source: 'benchmark',
    importance: 0.7,
    propagationRadius: 0.5,
    tick,
    tags: ['金融', '利率'],
    ...overrides,
  };
}

export function createBullishRecord(agentId: string, credibility = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent-${agentId}`,
    credibility,
    response: {
      opinion: '看好后市',
      action: 'speak',
      emotionalState: 0.6,
      reasoning: '基本面向好',
    },
  };
}

export function createBearishRecord(agentId: string, credibility = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent-${agentId}`,
    credibility,
    response: {
      opinion: '看空后市',
      action: 'speak',
      emotionalState: -0.5,
      reasoning: '经济下行压力增大',
    },
  };
}

export function createNeutralRecord(agentId: string, credibility = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent-${agentId}`,
    credibility,
    response: {
      opinion: '保持观望',
      action: 'silent',
      emotionalState: 0.0,
      reasoning: '信息不充分',
    },
  };
}

/**
 * 生成 N 条混合情绪的 AgentResponseRecord
 */
export function generateMixedResponses(count: number): AgentResponseRecord[] {
  const records: AgentResponseRecord[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const id = `agent_${i}`;
    const credibility = 0.2 + Math.random() * 0.6;
    if (r < 0.4) {
      records.push(createBullishRecord(id, credibility));
    } else if (r < 0.75) {
      records.push(createBearishRecord(id, credibility));
    } else {
      records.push(createNeutralRecord(id, credibility));
    }
  }
  return records;
}

/**
 * 批量生成 Agent 实例
 */
export function createAgents(count: number, tick = 0): Agent[] {
  const agents: Agent[] = [];
  for (let i = 0; i < count; i++) {
    agents.push(
      new Agent({
        id: `agent_${i}`,
        name: `Agent-${i}`,
        modelTier: (['local', 'cheap', 'strong'] as ModelTier[])[i % 3],
        spawnedAtTick: tick,
      }),
    );
  }
  return agents;
}

/**
 * 构建带有随机关系的 SocialGraph
 */
export function buildSocialGraph(agentIds: string[], maxFollow = 5): SocialGraph {
  const graph = new SocialGraph();
  for (const id of agentIds) {
    graph.addNode(id);
  }
  graph.initializeRandomRelations(agentIds, maxFollow);
  return graph;
}

/**
 * 创建 Mock ModelRouter（所有 tier 返回固定 JSON）
 */
export function createMockModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  // 覆盖每个 tier 的 chatCompletion 方法，返回固定响应
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    const client = router.getClient(tier);
    // 替换原型方法
    (client as unknown as { chatCompletion: () => Promise<string> }).chatCompletion = () =>
      Promise.resolve(MOCK_LLM_RESPONSE);
  }
  return router;
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────────

export function formatBenchResult(name: string, durationMs: number, ops?: number): string {
  const opsStr = ops !== undefined ? `${ops.toFixed(2)} ops/sec` : '';
  const timeStr = durationMs < 1 ? `${(durationMs * 1000).toFixed(2)} μs` : `${durationMs.toFixed(2)} ms`;
  return `  ${name.padEnd(50)} ${timeStr.padStart(15)} ${opsStr.padStart(20)}`;
}

/**
 * 测量函数执行时间，返回 [结果, 耗时ms]
 */
export async function measure<T>(fn: () => T | Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  return [result, elapsed];
}

/**
 * 多次执行取平均值
 */
export async function benchmark(
  fn: () => void | Promise<void>,
  iterations: number = 100,
): Promise<{ avgMs: number; totalMs: number; opsPerSec: number; minMs: number; maxMs: number }> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const opsPerSec = 1000 / avgMs;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);

  return { avgMs, totalMs, opsPerSec, minMs, maxMs };
}

export function printHeader(title: string): void {
  console.log('');
  console.log('='.repeat(90));
  console.log(`  ${title}`);
  console.log('='.repeat(90));
  console.log(`  ${'Benchmark'.padEnd(50)} ${'Time'.padStart(15)} ${'Throughput'.padStart(20)}`);
  console.log('-'.repeat(90));
}

export function printResult(
  name: string,
  result: { avgMs: number; opsPerSec: number; minMs: number; maxMs: number },
): void {
  const timeStr =
    result.avgMs < 1 ? `${(result.avgMs * 1000).toFixed(2)} μs` : `${result.avgMs.toFixed(2)} ms`;
  const minStr =
    result.minMs < 1 ? `${(result.minMs * 1000).toFixed(2)} μs` : `${result.minMs.toFixed(2)} ms`;
  const maxStr =
    result.maxMs < 1 ? `${(result.maxMs * 1000).toFixed(2)} μs` : `${result.maxMs.toFixed(2)} ms`;
  const opsStr =
    result.opsPerSec > 1000
      ? `${(result.opsPerSec / 1000).toFixed(2)}k ops/sec`
      : `${result.opsPerSec.toFixed(2)} ops/sec`;

  console.log(`  ${name.padEnd(50)} ${timeStr.padStart(15)} ${opsStr.padStart(20)}`);
  console.log(`  ${''.padEnd(50)} ${`min=${minStr} max=${maxStr}`.padStart(36)}`);
}

export function printFooter(): void {
  console.log('='.repeat(90));
  console.log('');
}
