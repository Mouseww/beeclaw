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

      // 重复添加不应增加（Set 语义）
      agent.addFollower('a1');
      expect(agent.followers).toHaveLength(2);
      expect(agent.followerCount).toBe(2);

      // hasFollower 检查
      expect(agent.hasFollower('a1')).toBe(true);
      expect(agent.hasFollower('nonexistent')).toBe(false);

      agent.removeFollower('a1');
      expect(agent.followers).toEqual(['a2']);
      expect(agent.followerCount).toBe(1);
    });

    it('follow / unfollow', () => {
      const agent = new Agent();
      agent.follow('b1');
      agent.follow('b2');
      expect(agent.following).toEqual(['b1', 'b2']);

      agent.follow('b1'); // 重复
      expect(agent.following).toHaveLength(2);
      expect(agent.followingCount).toBe(2);

      // isFollowing 检查
      expect(agent.isFollowing('b1')).toBe(true);
      expect(agent.isFollowing('nonexistent')).toBe(false);

      agent.unfollow('b1');
      expect(agent.following).toEqual(['b2']);
      expect(agent.followingCount).toBe(1);
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

  // ── normalizeResponse targets 过滤 ──

  describe('normalizeResponse targets 处理', () => {
    it('应正确过滤和规范化 targets', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const responseWithTargets = JSON.stringify({
        opinion: '看好股市',
        action: 'speak',
        emotionalState: 0.3,
        targets: [
          { name: 'AAPL', category: 'stock', stance: 0.8, confidence: 0.9, reasoning: '技术面良好' },
          { name: 'TSLA', category: 'stock', stance: 1.5, confidence: 1.2 }, // stance/confidence 越界
          { name: '', category: 'stock', stance: 0.5, confidence: 0.5 }, // 空名称，应过滤
          { name: 'BTC', category: 'invalid', stance: 0.6, confidence: 0.7 }, // 无效 category
        ],
      });
      const router = createMockModelRouter(responseWithTargets);
      const response = await agent.react(createTestEvent(), router, 5);

      expect(response.targets).toBeDefined();
      expect(response.targets!.length).toBe(3); // 空名称被过滤
      expect(response.targets![0]!.name).toBe('AAPL');
      expect(response.targets![1]!.stance).toBe(1); // clamp to 1
      expect(response.targets![1]!.confidence).toBe(1); // clamp to 1
      expect(response.targets![2]!.category).toBe('other'); // invalid -> other
    });

    it('targets 超过 5 个时应截断', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const targets = Array.from({ length: 10 }, (_, i) => ({
        name: `Stock${i}`,
        category: 'stock',
        stance: 0.5,
        confidence: 0.5,
      }));
      const responseWithManyTargets = JSON.stringify({
        opinion: '分析',
        action: 'speak',
        emotionalState: 0,
        targets,
      });
      const router = createMockModelRouter(responseWithManyTargets);
      const response = await agent.react(createTestEvent(), router, 5);

      expect(response.targets).toBeDefined();
      expect(response.targets!.length).toBe(5); // 最多 5 个
    });

    it('targets 缺少必要字段时应过滤', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const responseWithBadTargets = JSON.stringify({
        opinion: '观点',
        action: 'speak',
        emotionalState: 0,
        targets: [
          { name: 'Valid', stance: 0.5, confidence: 0.5 }, // 有效
          { name: 'NoStance', confidence: 0.5 }, // 缺 stance
          { stance: 0.5, confidence: 0.5 }, // 缺 name
        ],
      });
      const router = createMockModelRouter(responseWithBadTargets);
      const response = await agent.react(createTestEvent(), router, 5);

      expect(response.targets).toBeDefined();
      expect(response.targets!.length).toBe(1); // 只有第一个有效
    });
  });

  // ── newOpinions 更新 ──

  describe('newOpinions 更新', () => {
    it('应将 newOpinions 更新到 Agent 记忆', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const responseWithOpinions = JSON.stringify({
        opinion: '央行政策偏鸽',
        action: 'speak',
        emotionalState: 0.2,
        newOpinions: {
          '利率走势': { stance: -0.5, confidence: 0.8 },
          '股市前景': { stance: 0.3, confidence: 0.6 },
        },
      });
      const router = createMockModelRouter(responseWithOpinions);
      await agent.react(createTestEvent(), router, 5);

      const memories = agent.memory.getState();
      expect(memories.opinions['利率走势']).toBeDefined();
      expect(memories.opinions['利率走势']!.stance).toBe(-0.5);
      expect(memories.opinions['股市前景']).toBeDefined();
      expect(memories.opinions['股市前景']!.confidence).toBe(0.6);
    });
  });

  // ── 记忆上下文为空 ──

  describe('记忆上下文', () => {
    it('新 Agent 无记忆时不应注入记忆上下文消息', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      const mockConfig: ModelRouterConfig = {
        local: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock' },
        cheap: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock' },
        strong: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock' },
      };
      const router = new ModelRouter(mockConfig);
      const chatSpy = vi.spyOn(router.getClient('cheap'), 'chatCompletion').mockResolvedValue(
        '{"opinion":"ok","action":"silent","emotionalState":0}'
      );

      await agent.react(createTestEvent(), router, 1);

      // 新 Agent 没有记忆，消息应该只有 system + user(event)
      const callArgs = chatSpy.mock.calls[0]![0];
      expect(callArgs.length).toBe(2); // system + event prompt
      expect(callArgs[0]!.role).toBe('system');
      expect(callArgs[1]!.role).toBe('user');
      expect(callArgs[1]!.content).toContain('世界事件');
    });

    it('有记忆的 Agent 应注入记忆上下文', async () => {
      const agent = new Agent({ persona: TEST_PERSONA });
      // 先添加一些记忆
      agent.memory.remember(1, 'event', '之前的事件', 0.5, 0.1);
      agent.memory.updateOpinion('测试话题', 0.5, 0.8, '原因', 1);

      const mockConfig: ModelRouterConfig = {
        local: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock' },
        cheap: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock' },
        strong: { baseURL: 'http://mock:8000', apiKey: 'mock', model: 'mock' },
      };
      const router = new ModelRouter(mockConfig);
      const chatSpy = vi.spyOn(router.getClient('cheap'), 'chatCompletion').mockResolvedValue(
        '{"opinion":"ok","action":"silent","emotionalState":0}'
      );

      await agent.react(createTestEvent(), router, 2);

      // 有记忆时应该有 4 条消息：system + memory context + assistant ack + event
      const callArgs = chatSpy.mock.calls[0]![0];
      expect(callArgs.length).toBe(4);
      expect(callArgs[1]!.content).toContain('记忆上下文');
      expect(callArgs[2]!.role).toBe('assistant');
    });
  });

  // ── fromData ──

  describe('fromData', () => {
    it('应从序列化数据完整恢复 Agent', () => {
      // 先创建一个有状态的 Agent
      const original = new Agent({
        id: 'restore_test',
        name: '李华',
        persona: TEST_PERSONA,
        modelTier: 'strong',
        spawnedAtTick: 10,
      });
      original.setStatus('dormant');
      original.addFollower('follower_1');
      original.addFollower('follower_2');
      original.follow('following_1');
      original.updateInfluence(20);
      original.updateCredibility(0.3);
      original.memory.remember(10, 'event', '测试记忆', 0.5, 0.2);
      original.memory.updateOpinion('市场', 0.6, 0.7, '乐观', 10);

      // 序列化
      const data = original.toData();
      // 修改序列化数据中的 lastActiveTick 模拟持久化场景
      data.lastActiveTick = 15;

      // 反序列化
      const restored = Agent.fromData(data);

      // 验证所有状态恢复
      expect(restored.id).toBe('restore_test');
      expect(restored.name).toBe('李华');
      expect(restored.persona.profession).toBe('金融分析师');
      expect(restored.modelTier).toBe('strong');
      expect(restored.status).toBe('dormant');
      expect(restored.spawnedAtTick).toBe(10);
      expect(restored.lastActiveTick).toBe(15);
      expect(restored.influence).toBe(original.influence);
      expect(restored.credibility).toBe(original.credibility);
      expect(restored.followers).toEqual(['follower_1', 'follower_2']);
      expect(restored.following).toEqual(['following_1']);

      // 验证记忆恢复
      const memories = restored.memory.getShortTermMemories();
      expect(memories.length).toBe(1);
      expect(memories[0]!.content).toBe('测试记忆');

      const state = restored.memory.getState();
      expect(state.opinions['市场']).toBeDefined();
      expect(state.opinions['市场']!.stance).toBe(0.6);
    });
  });

  // ── isInterestedIn 低重要性随机分支 ──

  describe('isInterestedIn 随机决策', () => {
    it('低重要性无专长匹配事件应基于敏感度随机决策', () => {
      // 创建超高敏感度 Agent
      const highSensitivityPersona: AgentPersona = {
        ...TEST_PERSONA,
        expertise: ['完全不相关领域'],
        traits: { ...TEST_PERSONA.traits, informationSensitivity: 1.0 },
      };
      const agent = new Agent({ persona: highSensitivityPersona });

      // 低重要性、不相关的事件
      const event = createTestEvent({
        importance: 0.5,
        tags: ['娱乐'],
        title: '明星八卦',
        content: '娱乐新闻',
      });

      // 敏感度 1.0 * importance 0.5 = 0.5，约 50% 概率感兴趣
      // 多次测试应该有混合结果
      let interestedCount = 0;
      for (let i = 0; i < 100; i++) {
        if (agent.isInterestedIn(event)) interestedCount++;
      }
      // 概率测试：应该在 20-80 范围内（给足够宽松度）
      expect(interestedCount).toBeGreaterThan(10);
      expect(interestedCount).toBeLessThan(90);
    });

    it('极低敏感度 Agent 对低重要性事件几乎不感兴趣', () => {
      const lowSensitivityPersona: AgentPersona = {
        ...TEST_PERSONA,
        expertise: ['完全不相关领域'],
        traits: { ...TEST_PERSONA.traits, informationSensitivity: 0.01 },
      };
      const agent = new Agent({ persona: lowSensitivityPersona });

      const event = createTestEvent({
        importance: 0.1, // 低重要性
        tags: ['娱乐'],
        title: '八卦',
        content: '无关内容',
      });

      // 敏感度 0.01 * importance 0.1 = 0.001，几乎不会感兴趣
      let interestedCount = 0;
      for (let i = 0; i < 100; i++) {
        if (agent.isInterestedIn(event)) interestedCount++;
      }
      expect(interestedCount).toBeLessThan(5); // 几乎都不感兴趣
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
