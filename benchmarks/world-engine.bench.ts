// ============================================================================
// BeeClaw Benchmark — WorldEngine Tick 性能
// 测试 100 / 500 / 1000 Agent 场景下的 tick 执行性能
// ============================================================================

import { bench, describe } from 'vitest';
import { WorldEngine } from '@beeclaw/world-engine';
import { Agent, ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig, ModelTier } from '@beeclaw/shared';

// ── Mock 配置 ──────────────────────────────────────────────────────────────────

const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

const MOCK_LLM_RESPONSE = JSON.stringify({
  opinion: '看好后市发展',
  action: 'speak',
  emotionalState: 0.3,
  reasoning: '基本面向好',
});

function createMockModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    const client = router.getClient(tier);
    (client as unknown as { chatCompletion: () => Promise<string> }).chatCompletion = () =>
      Promise.resolve(MOCK_LLM_RESPONSE);
  }
  return router;
}

function createWorldConfig(maxAgents: number): WorldConfig {
  return {
    tickIntervalMs: 100,
    maxAgents,
    eventRetentionTicks: 50,
    enableNaturalSelection: false,
  };
}

function createAgents(count: number): Agent[] {
  const tiers: ModelTier[] = ['local', 'cheap', 'strong'];
  const agents: Agent[] = [];
  for (let i = 0; i < count; i++) {
    agents.push(
      new Agent({
        id: `agent_${i}`,
        name: `Agent-${i}`,
        modelTier: tiers[i % 3],
        spawnedAtTick: 0,
      }),
    );
  }
  return agents;
}

function setupEngine(agentCount: number): WorldEngine {
  const engine = new WorldEngine({
    config: createWorldConfig(agentCount),
    modelRouter: createMockModelRouter(),
    concurrency: 50,
  });

  const agents = createAgents(agentCount);
  engine.addAgents(agents);

  // 初始化社交关系
  const agentIds = agents.map((a) => a.id);
  engine.socialGraph.initializeRandomRelations(agentIds, Math.min(5, agentCount - 1));

  // 注入一个初始事件以驱动 tick
  engine.injectEvent({
    title: '央行降息',
    content: '央行宣布降息 25 个基点',
    category: 'finance',
    importance: 0.7,
    propagationRadius: 0.5,
    tags: ['金融', '利率'],
  });

  return engine;
}

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('WorldEngine.step() — tick 性能', () => {
  // 静默日志
  const origLog = console.log;
  const origDebug = console.debug;
  beforeAll(() => {
    console.log = () => {};
    console.debug = () => {};
  });
  afterAll(() => {
    console.log = origLog;
    console.debug = origDebug;
  });

  bench(
    '100 Agents — single tick',
    async () => {
      const engine = setupEngine(100);
      await engine.step();
    },
    { iterations: 20, warmupIterations: 2 },
  );

  bench(
    '500 Agents — single tick',
    async () => {
      const engine = setupEngine(500);
      await engine.step();
    },
    { iterations: 10, warmupIterations: 1 },
  );

  bench(
    '1000 Agents — single tick',
    async () => {
      const engine = setupEngine(1000);
      await engine.step();
    },
    { iterations: 5, warmupIterations: 1 },
  );
});
