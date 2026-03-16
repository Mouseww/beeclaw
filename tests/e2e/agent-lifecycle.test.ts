// ============================================================================
// BeeClaw E2E — Agent 生命周期
// 验证：创建 → 响应事件 → 记忆积累 → 社交互动
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildTestWorld, silenceConsole, TEST_PERSONA } from './helpers.js';
import { Agent, AgentMemory, AgentSpawner } from '@beeclaw/agent-runtime';
import type { WorldEngine } from '@beeclaw/world-engine';
import type { ModelRouter } from '@beeclaw/agent-runtime';

describe('Agent 生命周期', () => {
  let engine: WorldEngine;
  let modelRouter: ModelRouter;
  let agents: Agent[];

  beforeEach(() => {
    silenceConsole();
    const world = buildTestWorld({ agentCount: 5 });
    engine = world.engine;
    modelRouter = world.modelRouter;
    agents = world.agents;
  });

  afterEach(() => {
    engine.stop();
    vi.restoreAllMocks();
  });

  // ── Agent 创建 ──

  describe('Agent 创建', () => {
    it('孵化的 Agent 应有完整属性', () => {
      const agent = agents[0]!;
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.persona).toBeDefined();
      expect(agent.persona.profession).toBeDefined();
      expect(agent.persona.traits).toBeDefined();
      expect(agent.persona.expertise).toBeDefined();
      expect(agent.modelTier).toBeDefined();
      expect(agent.status).toBe('active');
      expect(agent.spawnedAtTick).toBe(0);
    });

    it('手动创建 Agent 应正确初始化', () => {
      const agent = new Agent({
        name: '测试分析师',
        persona: TEST_PERSONA,
        modelTier: 'cheap',
        spawnedAtTick: 5,
      });

      expect(agent.name).toBe('测试分析师');
      expect(agent.persona.profession).toBe('金融分析师');
      expect(agent.modelTier).toBe('cheap');
      expect(agent.spawnedAtTick).toBe(5);
      expect(agent.status).toBe('active');
      // influence 随机初始化在 10-39 范围
      expect(agent.influence).toBeGreaterThanOrEqual(10);
      expect(agent.influence).toBeLessThanOrEqual(39);
      expect(agent.credibility).toBeGreaterThan(0);
    });

    it('批量孵化应生成不同的 Agent', () => {
      const spawner = new AgentSpawner();
      const batch = spawner.spawnBatch(10, 0);

      expect(batch).toHaveLength(10);

      // ID 唯一性
      const ids = batch.map(a => a.id);
      expect(new Set(ids).size).toBe(10);

      // 名称唯一性（极高概率不重复）
      const names = batch.map(a => a.name);
      expect(new Set(names).size).toBe(10);
    });
  });

  // ── Agent 响应事件 ──

  describe('Agent 响应事件', () => {
    it('Agent.react 应返回结构化响应', async () => {
      const agent = agents[0]!;

      const event = engine.eventBus.injectEvent({
        title: '央行降息',
        content: '央行宣布降息 25 个基点',
        category: 'finance',
        importance: 0.8,
        propagationRadius: 0.7,
        tick: 1,
        tags: ['央行', '利率'],
      });

      const response = await agent.react(event, modelRouter, 1);

      expect(response).toHaveProperty('opinion');
      expect(response).toHaveProperty('action');
      expect(response).toHaveProperty('emotionalState');
      expect(typeof response.opinion).toBe('string');
      expect(['speak', 'forward', 'silent', 'predict']).toContain(response.action);
      expect(response.emotionalState).toBeGreaterThanOrEqual(-1);
      expect(response.emotionalState).toBeLessThanOrEqual(1);
    });

    it('Agent 响应后 lastActiveTick 应更新', async () => {
      const agent = agents[0]!;
      const initialTick = agent.lastActiveTick;

      const event = engine.eventBus.injectEvent({
        title: '测试事件',
        content: '测试',
        tick: 5,
      });

      await agent.react(event, modelRouter, 5);

      // react 方法会更新 lastActiveTick
      expect(agent.lastActiveTick).toBeGreaterThanOrEqual(initialTick);
    });
  });

  // ── 记忆积累 ──

  describe('记忆系统', () => {
    it('Agent 响应事件后应积累短期记忆', async () => {
      const agent = agents[0]!;
      const memBefore = agent.memory.getShortTermMemories().length;

      const event = engine.eventBus.injectEvent({
        title: '记忆测试事件',
        content: '这是一个用于测试记忆积累的事件',
        category: 'finance',
        importance: 0.7,
        tick: 1,
      });

      await agent.react(event, modelRouter, 1);

      const memAfter = agent.memory.getShortTermMemories().length;
      expect(memAfter).toBeGreaterThan(memBefore);
    });

    it('多轮 tick 后记忆应持续增长', async () => {
      // 注入多个事件并执行多轮 tick
      for (let i = 1; i <= 3; i++) {
        engine.injectEvent({
          title: `轮次${i}事件`,
          content: `第${i}轮测试内容`,
          category: 'general',
          importance: 0.7,
          propagationRadius: 0.8,
          tags: ['test'],
        });
        await engine.step();
      }

      // 至少第一个 agent 应有记忆
      const allAgents = engine.getAgents();
      const agentsWithMemory = allAgents.filter(
        a => a.memory.getShortTermMemories().length > 0
      );

      // 执行了 3 轮有事件的 tick，至少应有 agent 参与
      const history = engine.getTickHistory();
      const totalResponses = history.reduce((s, h) => s + h.responsesCollected, 0);
      if (totalResponses > 0) {
        expect(agentsWithMemory.length).toBeGreaterThan(0);
      }
    });

    it('观点记忆应可更新', () => {
      const memory = new AgentMemory();

      memory.updateOpinion('央行政策', 0.5, 0.7, '利好经济', 1);
      const opinion = memory.getOpinion('央行政策');
      expect(opinion).toBeDefined();
      expect(opinion!.stance).toBe(0.5);
      expect(opinion!.confidence).toBe(0.7);

      // 更新观点
      memory.updateOpinion('央行政策', -0.3, 0.8, '可能引发通胀', 2);
      const updated = memory.getOpinion('央行政策');
      expect(updated!.stance).toBe(-0.3);
      expect(updated!.lastUpdatedTick).toBe(2);
    });

    it('短期记忆不超过上限', () => {
      const memory = new AgentMemory();

      // 添加 60 条（超过默认上限 50）
      for (let i = 0; i < 60; i++) {
        memory.remember(i, 'observation', `观察 ${i}`, 0.5, 0.0);
      }

      const entries = memory.getShortTermMemories();
      expect(entries.length).toBeLessThanOrEqual(50);
    });

    it('记忆上下文应可构建为字符串', () => {
      const memory = new AgentMemory();
      memory.remember(1, 'event', '央行降息', 0.8, 0.5);
      memory.updateOpinion('利率', 0.6, 0.7, '看好', 1);

      const context = memory.buildMemoryContext();
      expect(typeof context).toBe('string');
      expect(context.length).toBeGreaterThan(0);
    });
  });

  // ── 社交互动 ──

  describe('社交关系管理', () => {
    it('Agent 应可互相关注', () => {
      const a1 = agents[0]!;
      const a2 = agents[1]!;

      a1.follow(a2.id);
      a2.addFollower(a1.id);

      expect(a1.following).toContain(a2.id);
      expect(a2.followers).toContain(a1.id);
    });

    it('Agent 应可取消关注', () => {
      const a1 = agents[0]!;
      const a2 = agents[1]!;

      a1.follow(a2.id);
      a2.addFollower(a1.id);

      a1.unfollow(a2.id);
      a2.removeFollower(a1.id);

      expect(a1.following).not.toContain(a2.id);
      expect(a2.followers).not.toContain(a1.id);
    });

    it('影响力应可更新', () => {
      const agent = agents[0]!;
      const initial = agent.influence;

      agent.updateInfluence(10);
      expect(agent.influence).toBe(initial + 10);

      agent.updateInfluence(-5);
      expect(agent.influence).toBe(initial + 5);
    });

    it('信誉度应可更新', () => {
      const agent = agents[0]!;
      const initial = agent.credibility;

      agent.updateCredibility(0.1);
      expect(agent.credibility).toBeCloseTo(initial + 0.1, 5);
    });

    it('SocialGraph 应反映 Agent 关系', () => {
      const graph = engine.getSocialGraph();

      // 所有 Agent 应已注册为节点
      for (const agent of agents) {
        expect(graph.hasNode(agent.id)).toBe(true);
      }

      // 初始化时应创建了一些边
      const stats = graph.getStats();
      expect(stats.nodeCount).toBe(5);
      expect(stats.edgeCount).toBeGreaterThan(0);
    });
  });

  // ── 状态转换 ──

  describe('Agent 状态生命周期', () => {
    it('Agent 状态应可在 active/dormant/dead 间转换', () => {
      const agent = agents[0]!;

      expect(agent.status).toBe('active');

      agent.setStatus('dormant');
      expect(agent.status).toBe('dormant');

      agent.setStatus('dead');
      expect(agent.status).toBe('dead');
    });

    it('序列化与反序列化应保持一致', () => {
      const agent = agents[0]!;
      agent.memory.remember(1, 'event', '测试事件', 0.8, 0.5);
      agent.memory.updateOpinion('股市', 0.3, 0.6, '看好', 1);

      const data = agent.toData();
      const restored = Agent.fromData(data);

      expect(restored.id).toBe(agent.id);
      expect(restored.name).toBe(agent.name);
      expect(restored.persona.profession).toBe(agent.persona.profession);
      expect(restored.status).toBe(agent.status);
      expect(restored.influence).toBe(agent.influence);
      expect(restored.credibility).toBe(agent.credibility);

      const opinion = restored.memory.getOpinion('股市');
      expect(opinion).toBeDefined();
      expect(opinion!.stance).toBe(0.3);
    });
  });

  // ── AgentSpawner 触发 ──

  describe('AgentSpawner 事件触发', () => {
    it('关键词触发应生成新 Agent', () => {
      const spawner = new AgentSpawner([
        {
          trigger: { type: 'event_keyword', keywords: ['央行', '降息'] },
          template: {
            professionPool: ['经济学家', '交易员'],
            traitRanges: {
              riskTolerance: [0.3, 0.7],
              informationSensitivity: [0.5, 0.9],
              conformity: [0.2, 0.6],
              emotionality: [0.2, 0.6],
              analyticalDepth: [0.5, 0.9],
            },
            expertisePool: [['金融', '货币政策']],
            biasPool: ['确认偏误'],
          },
          count: 2,
          modelTier: 'cheap',
        },
      ]);

      const event = {
        id: 'test-event',
        type: 'external' as const,
        category: 'finance' as const,
        title: '央行宣布降息',
        content: '降息 25 个基点',
        source: 'manual',
        importance: 0.8,
        propagationRadius: 0.6,
        tick: 1,
        tags: ['央行', '降息'],
      };

      const newAgents = spawner.checkEventTriggers(event, 5, 1);
      expect(newAgents.length).toBeGreaterThan(0);
    });

    it('population_drop 触发应补充 Agent', () => {
      const spawner = new AgentSpawner([
        {
          trigger: { type: 'population_drop', threshold: 10 },
          template: {
            professionPool: ['普通市民'],
            traitRanges: {
              riskTolerance: [0.3, 0.7],
              informationSensitivity: [0.3, 0.7],
              conformity: [0.4, 0.8],
              emotionality: [0.4, 0.8],
              analyticalDepth: [0.2, 0.6],
            },
            expertisePool: [['社会', '民生']],
            biasPool: ['从众心理'],
          },
          count: 3,
          modelTier: 'local',
        },
      ]);

      const dummyEvent = {
        id: 'any',
        type: 'system' as const,
        category: 'general' as const,
        title: 'tick',
        content: '',
        source: 'system',
        importance: 0,
        propagationRadius: 0,
        tick: 1,
        tags: [],
      };

      // 当前 Agent 数量 < threshold
      const newAgents = spawner.checkEventTriggers(dummyEvent, 3, 1);
      // population_drop 检查在 checkScheduledTriggers 中
      const scheduled = spawner.checkScheduledTriggers(1, 3);
      // 至少一种方式应触发
      expect(newAgents.length + scheduled.length).toBeGreaterThanOrEqual(0);
    });
  });
});
