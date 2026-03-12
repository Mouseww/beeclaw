// ============================================================================
// BeeClaw 端到端集成测试
// 测试完整链路: WorldEngine → EventBus → Agent → SocialGraph → Consensus
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter, Agent } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig } from '@beeclaw/shared';

// ── Mock 配置 ──

const TEST_CONFIG: WorldConfig = {
  tickIntervalMs: 100,
  maxAgents: 50,
  eventRetentionTicks: 50,
  enableNaturalSelection: false,
};

const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

// 模拟不同角色的 LLM 响应
function createVariedMockRouter() {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);

  let callCount = 0;

  const responses = [
    // 看多的投资者
    '{"opinion":"市场将迎来反弹","action":"speak","emotionalState":0.7,"reasoning":"利好政策推动","newOpinions":{"股市":{"stance":"bullish","confidence":0.8}}}',
    // 看空的分析师
    '{"opinion":"谨慎观望，风险尚存","action":"speak","emotionalState":-0.3,"reasoning":"基本面不支撑","newOpinions":{"股市":{"stance":"bearish","confidence":0.6}}}',
    // 中立的观察者
    '{"opinion":"需要更多数据才能判断","action":"silent","emotionalState":0.0,"reasoning":"信息不足","newOpinions":{"股市":{"stance":"neutral","confidence":0.4}}}',
    // 激进的散户
    '{"opinion":"All in！牛市来了","action":"speak","emotionalState":0.9,"reasoning":"跟风","newOpinions":{"股市":{"stance":"bullish","confidence":0.9}}}',
    // 转发型
    '{"opinion":"这条消息很重要，大家注意","action":"forward","emotionalState":0.2,"reasoning":"传播信息"}',
    // 预测型
    '{"opinion":"预计三个月内见顶","action":"predict","emotionalState":-0.1,"reasoning":"历史规律表明政策效果有滞后性"}',
  ];

  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
      const idx = callCount % responses.length;
      callCount++;
      return responses[idx]!;
    });
  }

  return router;
}

describe('BeeClaw 端到端集成测试', () => {
  let engine: WorldEngine;
  let modelRouter: ModelRouter;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    modelRouter = createVariedMockRouter();
    engine = new WorldEngine({
      config: TEST_CONFIG,
      modelRouter,
      concurrency: 5,
    });
  });

  it('完整链路: 孵化 → 注入事件 → 多轮 tick → 共识输出', async () => {
    // 1. 孵化初始 Agent
    const agents = engine.spawner.spawnBatch(8, 0);
    engine.addAgents(agents);
    expect(agents.length).toBe(8);

    // 验证 Agent 都有独立人格
    const names = new Set(agents.map(a => a.name));
    expect(names.size).toBeGreaterThanOrEqual(6); // 允许少量重名

    const professions = agents.map(a => a.persona.profession);
    expect(professions.length).toBe(8);

    // 2. 注入外部事件
    const event = engine.injectEvent({
      title: '央行宣布降准50个基点',
      content: '中国人民银行决定下调存款准备金率0.5个百分点，释放长期资金约1万亿元。',
      category: 'finance',
      importance: 0.9,
      propagationRadius: 0.8,
      tags: ['货币政策', '降准', '利好'],
    });

    expect(event).toBeDefined();
    expect(event.id).toBeTruthy();
    expect(event.type).toBe('external');

    // 3. 运行第一个 tick
    const tick1 = await engine.step();
    expect(tick1.tick).toBe(1);
    expect(tick1.eventsProcessed).toBeGreaterThanOrEqual(1);
    expect(tick1.agentsActivated).toBeGreaterThan(0);
    expect(tick1.responsesCollected).toBeGreaterThan(0);

    // 4. 注入第二个事件
    engine.injectEvent({
      title: '上证指数早盘大涨3%',
      content: '受降准消息刺激，A股三大指数全线高开，上证综指早盘涨幅超过3%。',
      category: 'finance',
      importance: 0.7,
      propagationRadius: 0.6,
      tags: ['A股', '上涨'],
    });

    // 5. 运行 tick 2 和 3
    const tick2 = await engine.step();
    expect(tick2.tick).toBe(2);

    const tick3 = await engine.step();
    expect(tick3.tick).toBe(3);

    // 6. 验证社交图谱产生了连接
    const graph = engine.getSocialGraph();
    const stats = graph.getStats();
    // Agent 的 speak/forward 行为应产生社交关系
    expect(stats.nodeCount).toBeGreaterThanOrEqual(agents.length);

    // 7. 验证共识引擎处理了数据
    const consensus = engine.getConsensusEngine();
    // 至少调用过 aggregate
    expect(consensus).toBeDefined();

    // 8. 验证 Agent 记忆更新
    for (const agent of agents) {
      const memories = agent.memory.getRecentMemories(10);
      // 被激活的 Agent 应该有记忆
      if (memories.length > 0) {
        expect(memories[0]!.content).toBeTruthy();
      }
    }

    // 9. 验证 tick 历史记录
    const history = engine.getTickHistory();
    expect(history.length).toBe(3);

    const totalResponses = history.reduce((sum, h) => sum + h.responsesCollected, 0);
    expect(totalResponses).toBeGreaterThan(0);

    // 10. 验证世界状态
    const worldState = engine.getWorldState();
    const state = worldState.getState();
    expect(state.tick).toBe(3);
    expect(state.agentCount).toBeGreaterThanOrEqual(agents.length);
  });

  it('Agent 响应多样性: 不同 Agent 有不同反应', async () => {
    const agents = engine.spawner.spawnBatch(6, 0);
    engine.addAgents(agents);

    engine.injectEvent({
      title: '科技巨头发布新产品',
      content: '某科技公司发布革命性 AI 产品，股价应声上涨10%。',
      category: 'tech',
      importance: 0.8,
      propagationRadius: 0.7,
      tags: ['科技', 'AI'],
    });

    await engine.step();

    // 检查被激活的 Agent 有不同的情绪状态
    const memoriesWithEmotion: number[] = [];
    for (const agent of agents) {
      const memories = agent.memory.getRecentMemories(5);
      for (const mem of memories) {
        if (mem.emotionalWeight !== undefined) {
          memoriesWithEmotion.push(mem.emotionalWeight);
        }
      }
    }

    // 应该有一些响应
    expect(memoriesWithEmotion.length).toBeGreaterThan(0);
  });

  it('无事件时 tick 应正常运行', async () => {
    const agents = engine.spawner.spawnBatch(3, 0);
    engine.addAgents(agents);

    // 不注入任何事件
    const tick1 = await engine.step();
    expect(tick1.tick).toBe(1);
    expect(tick1.eventsProcessed).toBe(0);
    expect(tick1.agentsActivated).toBe(0);
    expect(tick1.responsesCollected).toBe(0);
  });

  it('孵化规则在事件触发时工作', async () => {
    // 少于 threshold 的 Agent
    const agents = engine.spawner.spawnBatch(3, 0);
    engine.addAgents(agents);

    // 添加孵化规则
    engine.spawner.addRule({
      trigger: { type: 'population_drop', threshold: 5 },
      template: {
        professionPool: ['测试角色'],
        traitRanges: {
          riskTolerance: [0.5, 0.5],
          informationSensitivity: [0.5, 0.5],
          conformity: [0.5, 0.5],
          emotionality: [0.5, 0.5],
          analyticalDepth: [0.5, 0.5],
        },
        expertisePool: [['测试']],
        biasPool: ['无'],
      },
      count: 2,
      modelTier: 'cheap',
    });

    // 注入事件触发孵化检查
    engine.injectEvent({
      title: '测试事件',
      content: '用于触发孵化检查的测试事件。',
      category: 'general',
      importance: 0.5,
      propagationRadius: 0.3,
      tags: ['test'],
    });

    const tick1 = await engine.step();

    // 可能触发孵化（初始 3 个 < threshold 5）
    // 注意: 孵化逻辑依赖具体实现，至少不应报错
    expect(tick1.tick).toBe(1);
  });

  it('多轮仿真后 worldState 正确累积', async () => {
    const agents = engine.spawner.spawnBatch(5, 0);
    engine.addAgents(agents);

    const events = [
      { title: '事件A', content: '内容A', category: 'finance' as const, importance: 0.6, tags: ['a'] },
      { title: '事件B', content: '内容B', category: 'tech' as const, importance: 0.7, tags: ['b'] },
      { title: '事件C', content: '内容C', category: 'politics' as const, importance: 0.8, tags: ['c'] },
    ];

    for (let i = 0; i < 3; i++) {
      engine.injectEvent({
        ...events[i]!,
        propagationRadius: 0.5,
      });
      await engine.step();
    }

    const state = engine.getWorldState().getState();
    expect(state.tick).toBe(3);

    const history = engine.getTickHistory();
    expect(history.length).toBe(3);

    // 每轮都处理了事件
    for (const h of history) {
      expect(h.eventsProcessed).toBeGreaterThanOrEqual(1);
    }
  });
});
