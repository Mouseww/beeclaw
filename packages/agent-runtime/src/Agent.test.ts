// ============================================================================
// @beeclaw/agent-runtime Agent 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from './Agent.js';
import { ModelRouter } from './ModelRouter.js';
import type { AgentPersona, WorldEvent, ModelRouterConfig } from '@beeclaw/shared';

// ── Mock LLM 响应 ──

function createMockModelRouter(responseJson: string = '{"opinion":"看好","action":"speak","emotionalState":0.5,"reasoning":"分析"}') {
  const mockConfig: ModelRouterConfig = {
    local: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock-local' },
    cheap: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock-cheap' },
    strong: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock-strong' },
  };
  const router = new ModelRouter(mockConfig);

  // Mock 所有 client 的 chatCompletion
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    const client = router.getClient(tier);
    vi.spyOn(client, 'chatCompletion').mockResolvedValue(responseJson);
  }

  return router;
}

function createTestEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 'evt_test',
    type: 'external',
    category: 'finance',
    title: '央行降息',
    content: '央行宣布降息 25 个基点',
    source: 'manual',
    importance: 0.7,
    propagationRadius: 0.5,
    tick: 5,
    tags: ['金融', '利率'],
    ...overrides,
  };
}

const TEST_PERSONA: AgentPersona = {
  background: '一位从业10年的金融分析师',
  profession: '金融分析师',
  traits: {
    riskTolerance: 0.6,
    informationSensitivity: 0.7,
    conformity: 0.4,
    emotionality: 0.5,
    analyticalDepth: 0.8,
  },
  expertise: ['金融', '宏观经济'],
  biases: ['确认偏见'],
  communicationStyle: '理性分析型',
};

describe('Agent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── 构造 ──

  describe('构造函数', () => {
    it('应使用默认值创建 Agent', () => {
      const agent = new Agent();
      expect(agent.id).toMatch(/^agent_/);
      expect(agent.name).toBeTruthy();
      expect(agent.persona).toBeDefined();
      expect(agent.modelTier).toBe('cheap');
      expect(agent.status).toBe('active');
      expect(agent.credibility).toBe(0.5);
    });

    it('应使用自定义参数创建 Agent', () => {
      const agent = new Agent({
        id: 'test_001',
        name: '张明',
        persona: TEST_PERSONA,
        modelTier: 'strong',
        spawnedAtTick: 10,
      });
      expect(agent.id).toBe('test_001');
      expect(agent.name).toBe('张明');
      expect(agent.persona.profession).toBe('金融分析师');
      expect(agent.modelTier).toBe('strong');
      expect(agent.spawnedAtTick).toBe(10);
      expect(agent.lastActiveTick).toBe(10);
    });
  });

  // ── 状态管理 ──

  describe('状态管理', () => {
    it('setStatus 应更新状态', () => {
      const agent = new Agent();
      expect(agent.status).toBe('active');
      agent.setStatus('dormant');
      expect(agent.status).toBe('dormant');
      agent.setStatus('dead');
      expect(agent.status).toBe('dead');
    });

    it('addFollower / removeFollower', () => {
      const agent = new Agent();
      agent.addFollower('a1');
      agent.addFollower('a2');
      expect(agent.followers).toEqual(['a1', 'a2']);

      // 重复添加不应增加
      agent.addFollower('a1');
      expect(agent.followers).toEqual(['a1', 'a2']);

      agent.removeFollower('a1');
      expect(agent.followers).toEqual(['a2']);
    });

    it('follow / unfollow', () => {
      const agent = new Agent();
      agent.follow('b1');
      agent.follow('b2');
      expect(agent.following).toEqual(['b1', 'b2']);

      agent.follow('b1'); // 重复
      expect(agent.following).toEqual(['b1', 'b2']);

      agent.unfollow('b1');
      expect(agent.following).toEqual(['b2']);
    });

    it('updateInfluence 应限制在 0~100', () => {
      const agent = new Agent();
      const _initial = agent.influence;
      agent.updateInfluence(200);
      expect(agent.influence).toBe(100);
      agent.updateInfluence(-200);
      expect(agent.influence).toBe(0);
    });

    it('updateCredibility 应限制在 0~1', () => {
      const agent = new Agent();
      agent.updateCredibility(10);
      expect(agent.credibility).toBe(1);
      agent.updateCredibility(-10);
      expect(agent.credibility).toBe(0);
    });
  });

  // ── react（mock LLM）──

  describe('react', () => {
    it('成功解析 LLM 响应应返回结构化结果', async () => {
      const agent = new Agent({ persona: TEST_PERSONA, name: '张明' });
      const router = createMockModelRouter();
      const event = createTestEvent();

      const response = await agent.react(event, router, 5);
      expect(response.opinion).toBe('看好');
      expect(response.action).toBe('speak');
      expect(response.emotionalState).toBe(0.5);
      expect(response.reasoning).toBe('分析');
    });

    it('应更新 lastActiveTick', async () => {
      const agent = new Agent({ spawnedAtTick: 0 });
      const router = createMockModelRouter();
      await agent.react(createTestEvent(), router, 10);
      expect(agent.lastActiveTick).toBe(10);
    });

    it('应将事件记录到记忆中', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const router = createMockModelRouter();
      await agent.react(createTestEvent(), router, 5);
      const memories = agent.memory.getShortTermMemories();
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0]!.content).toContain('央行降息');
    });

    it('LLM 返回无效 JSON 应使用默认响应', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const router = createMockModelRouter('这不是 JSON 格式');
      const response = await agent.react(createTestEvent(), router, 5);
      expect(response.action).toBe('silent');
      expect(response.opinion).toContain(TEST_PERSONA.profession);
    });

    it('LLM 调用抛异常应使用默认响应', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const mockConfig: ModelRouterConfig = {
        local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock' },
        cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock' },
        strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock' },
      };
      const router = new ModelRouter(mockConfig);
      vi.spyOn(router.getClient('cheap'), 'chatCompletion').mockRejectedValue(new Error('网络错误'));

      const response = await agent.react(createTestEvent(), router, 5);
      expect(response.action).toBe('silent');
    });

    it('action 不合法时应默认为 silent', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const router = createMockModelRouter('{"opinion":"ok","action":"invalid_action","emotionalState":0}');
      const response = await agent.react(createTestEvent(), router, 5);
      expect(response.action).toBe('silent');
    });

    it('emotionalState 应被限制在 -1 ~ 1', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const router = createMockModelRouter('{"opinion":"ok","action":"speak","emotionalState":5.0}');
      const response = await agent.react(createTestEvent(), router, 5);
      expect(response.emotionalState).toBeLessThanOrEqual(1);
    });

    it('predict 行为应记录预测', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const router = createMockModelRouter('{"opinion":"预测涨","action":"predict","emotionalState":0.3,"reasoning":"技术分析"}');
      await agent.react(createTestEvent(), router, 5);
      const state = agent.memory.getState();
      expect(state.predictions.length).toBeGreaterThan(0);
      expect(state.predictions[0]!.prediction).toBe('技术分析');
    });
  });

  // ── isInterestedIn ──

  describe('isInterestedIn', () => {
    it('非 active Agent 不感兴趣', () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      agent.setStatus('dormant');
      expect(agent.isInterestedIn(createTestEvent())).toBe(false);
    });

    it('高重要性事件所有人都关注', () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const event = createTestEvent({ importance: 0.9 });
      expect(agent.isInterestedIn(event)).toBe(true);
    });

    it('标签匹配专长时应感兴趣', () => {
      const agent = new Agent({ persona: TEST_PERSONA }); // expertise: ['金融', '宏观经济']
      const event = createTestEvent({ importance: 0.3, tags: ['金融'] });
      expect(agent.isInterestedIn(event)).toBe(true);
    });

    it('标题匹配专长时应感兴趣', () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const event = createTestEvent({ importance: 0.3, tags: [], title: '金融市场波动' });
      expect(agent.isInterestedIn(event)).toBe(true);
    });
  });

  // ── toData ──

  describe('toData', () => {
    it('应返回完整的 BeeAgent 数据', () => {
      const agent = new Agent({
        id: 'test_001',
        name: '张明',
        persona: TEST_PERSONA,
        modelTier: 'strong',
        spawnedAtTick: 5,
      });
      agent.addFollower('f1');
      agent.follow('f2');

      const data = agent.toData();
      expect(data.id).toBe('test_001');
      expect(data.name).toBe('张明');
      expect(data.persona.profession).toBe('金融分析师');
      expect(data.modelTier).toBe('strong');
      expect(data.status).toBe('active');
      expect(data.followers).toEqual(['f1']);
      expect(data.following).toEqual(['f2']);
      expect(data.spawnedAtTick).toBe(5);
      expect(data.modelId).toBe('strong-default');
    });
  });
});
