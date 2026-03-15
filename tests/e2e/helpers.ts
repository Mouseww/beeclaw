// ============================================================================
// BeeClaw E2E 测试 — 共享辅助工具
// 提供 LLM mock、通用构建函数和静默 console
// ============================================================================

import { vi } from 'vitest';
import { WorldEngine, type WorldEngineOptions } from '@beeclaw/world-engine';
import { Agent, ModelRouter, AgentSpawner } from '@beeclaw/agent-runtime';
import { EventBus } from '@beeclaw/event-bus';
import { SocialGraph } from '@beeclaw/social-graph';
import { ConsensusEngine } from '@beeclaw/consensus';
import type { WorldConfig, ModelRouterConfig, AgentPersona, SpawnRule } from '@beeclaw/shared';

// ── LLM Mock 响应池 ──

const MOCK_RESPONSES = [
  '{"opinion":"看好市场走势，预期上涨","action":"speak","emotionalState":0.6,"reasoning":"基于宏观经济分析，利好因素占优"}',
  '{"opinion":"保持谨慎观望","action":"silent","emotionalState":-0.1,"reasoning":"市场波动较大，不宜轻举妄动"}',
  '{"opinion":"趋势向好，值得关注","action":"forward","emotionalState":0.3,"reasoning":"多个指标发出积极信号"}',
  '{"opinion":"需要高度警惕风险","action":"speak","emotionalState":-0.5,"reasoning":"存在系统性风险隐患"}',
  '{"opinion":"中性判断，等待更多数据","action":"silent","emotionalState":0.0,"reasoning":"当前信息不足以做出判断"}',
  '{"opinion":"强势看多","action":"predict","emotionalState":0.8,"reasoning":"技术面与基本面共振向上"}',
];

// ── 配置常量 ──

export const TEST_WORLD_CONFIG: WorldConfig = {
  tickIntervalMs: 50,
  maxAgents: 50,
  eventRetentionTicks: 50,
  enableNaturalSelection: false,
};

export const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock-local', apiKey: 'mock-key', model: 'mock-local-model' },
  cheap: { baseURL: 'http://mock-cheap', apiKey: 'mock-key', model: 'mock-cheap-model' },
  strong: { baseURL: 'http://mock-strong', apiKey: 'mock-key', model: 'mock-strong-model' },
};

// ── Mock ModelRouter ──

/**
 * 创建一个 LLM 调用被完全 mock 的 ModelRouter
 * 按顺序循环返回预设的 Agent 响应 JSON
 */
export function createMockModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  let callCount = 0;

  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
      const idx = callCount % MOCK_RESPONSES.length;
      callCount++;
      return MOCK_RESPONSES[idx]!;
    });
  }

  return router;
}

// ── 快速构建 WorldEngine ──

export interface E2EWorldOptions {
  agentCount?: number;
  worldConfig?: Partial<WorldConfig>;
  engineOptions?: Partial<WorldEngineOptions>;
  spawnRules?: SpawnRule[];
}

/**
 * 构建包含 mock LLM 的完整 WorldEngine 实例
 * 自动孵化指定数量 Agent 并初始化 SocialGraph
 */
export function buildTestWorld(opts: E2EWorldOptions = {}): {
  engine: WorldEngine;
  modelRouter: ModelRouter;
  agents: Agent[];
} {
  const {
    agentCount = 5,
    worldConfig = {},
    engineOptions = {},
    spawnRules = [],
  } = opts;

  const modelRouter = createMockModelRouter();

  const config: WorldConfig = {
    ...TEST_WORLD_CONFIG,
    ...worldConfig,
  };

  const engine = new WorldEngine({
    config,
    modelRouter,
    concurrency: 3,
    ...engineOptions,
  });

  // 添加孵化规则
  for (const rule of spawnRules) {
    engine.spawner.addRule(rule);
  }

  // 孵化初始 Agent
  const agents = engine.spawner.spawnBatch(agentCount, 0);
  engine.addAgents(agents);

  // 初始化随机社交关系
  const agentIds = agents.map(a => a.id);
  engine.getSocialGraph().initializeRandomRelations(agentIds, 3, 0);

  return { engine, modelRouter, agents };
}

// ── 静默 console ──

export function silenceConsole(): void {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

// ── 测试用 Persona ──

export const TEST_PERSONA: AgentPersona = {
  background: '一位在金融行业工作 10 年的资深分析师',
  profession: '金融分析师',
  traits: {
    riskTolerance: 0.6,
    informationSensitivity: 0.8,
    conformity: 0.3,
    emotionality: 0.4,
    analyticalDepth: 0.9,
  },
  expertise: ['金融', '股票', '宏观经济'],
  biases: ['确认偏误', '锚定效应'],
  communicationStyle: '专业、数据驱动、逻辑清晰',
};

// ── RSS Feed 模板（用于 EventIngestion 测试）──

export const MOCK_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>模拟财经新闻</title>
    <link>http://mock-news.example.com</link>
    <description>用于 E2E 测试的模拟新闻源</description>
    <item>
      <title>央行宣布降息25个基点</title>
      <description>中国人民银行决定下调金融机构贷款基准利率</description>
      <guid>mock-news-001</guid>
      <pubDate>Mon, 10 Mar 2026 08:00:00 GMT</pubDate>
      <category>金融</category>
    </item>
    <item>
      <title>科技巨头发布新一代AI芯片</title>
      <description>该芯片性能提升300%，将重塑AI算力格局</description>
      <guid>mock-news-002</guid>
      <pubDate>Mon, 10 Mar 2026 09:00:00 GMT</pubDate>
      <category>科技</category>
    </item>
    <item>
      <title>国际油价创年内新高</title>
      <description>受地缘政治紧张影响，布伦特原油突破90美元</description>
      <guid>mock-news-003</guid>
      <pubDate>Mon, 10 Mar 2026 10:00:00 GMT</pubDate>
      <category>金融</category>
    </item>
  </channel>
</rss>`;
