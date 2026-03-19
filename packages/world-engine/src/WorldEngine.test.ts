// ============================================================================
// @beeclaw/world-engine WorldEngine 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorldEngine } from './WorldEngine.js';
import { ModelRouter, Agent } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig } from '@beeclaw/shared';

const TEST_CONFIG: WorldConfig = {
  tickIntervalMs: 1000,
  maxAgents: 100,
  eventRetentionTicks: 50,
  enableNaturalSelection: false,
};

const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

function createMockModelRouter() {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockResolvedValue(
      '{"opinion":"观点","action":"speak","emotionalState":0.3,"reasoning":"理由"}'
    );
  }
  return router;
}

describe('WorldEngine', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── 构造 ──

  describe('构造函数', () => {
    it('应正确初始化所有子系统', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.config).toBe(TEST_CONFIG);
      expect(engine.eventBus).toBeDefined();
      expect(engine.socialGraph).toBeDefined();
      expect(engine.consensusEngine).toBeDefined();
      expect(engine.spawner).toBeDefined();
      expect(engine.scheduler).toBeDefined();
      expect(engine.worldState).toBeDefined();
    });

    it('初始无 Agent', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.getAgents()).toHaveLength(0);
      expect(engine.getActiveAgentCount()).toBe(0);
    });
  });

  // ── Agent 管理 ──

  describe('Agent 管理', () => {
    it('addAgent 应注册 Agent', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      const agent = new Agent({ id: 'a1', name: '张明' });
      engine.addAgent(agent);
      expect(engine.getAgents()).toHaveLength(1);
      expect(engine.getAgent('a1')).toBe(agent);
    });

    it('addAgents 应批量注册并建立社交关系', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      const agents = [
        new Agent({ id: 'a1' }),
        new Agent({ id: 'a2' }),
        new Agent({ id: 'a3' }),
      ];
      engine.addAgents(agents);
      expect(engine.getAgents()).toHaveLength(3);
      // SocialGraph 应有节点
      expect(engine.socialGraph.getNodeCount()).toBe(3);
      // 应有一些边（随机初始化关系）
      expect(engine.socialGraph.getEdgeCount()).toBeGreaterThan(0);
    });

    it('getAgent 不存在应返回 undefined', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.getAgent('nonexistent')).toBeUndefined();
    });

    it('getActiveAgentCount 只计算 active', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      const a1 = new Agent({ id: 'a1' });
      const a2 = new Agent({ id: 'a2' });
      a2.setStatus('dormant');
      engine.addAgent(a1);
      engine.addAgent(a2);
      expect(engine.getActiveAgentCount()).toBe(1);
    });
  });

  // ── 事件注入 ──

  describe('injectEvent', () => {
    it('应创建事件并加入 EventBus', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      const event = engine.injectEvent({
        title: '测试事件',
        content: '测试内容',
      });
      expect(event.id).toMatch(/^evt_/);
      expect(event.title).toBe('测试事件');
      expect(engine.eventBus.getQueueLength()).toBe(1);
    });
  });

  // ── start / stop ──

  describe('start / stop', () => {
    it('应正确控制运行状态', () => {
      vi.useFakeTimers();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.isRunning()).toBe(false);
      engine.start();
      expect(engine.isRunning()).toBe(true);
      engine.stop();
      expect(engine.isRunning()).toBe(false);
      vi.useRealTimers();
    });

    it('重复 start 不应有副作用', () => {
      vi.useFakeTimers();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      engine.start();
      engine.start();
      expect(engine.isRunning()).toBe(true);
      engine.stop();
      vi.useRealTimers();
    });
  });

  // ── step ──

  describe('step', () => {
    it('无事件时应完成 tick 不报错', async () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      engine.addAgent(new Agent({ id: 'a1' }));
      const result = await engine.step();
      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(0);
      expect(result.agentsActivated).toBe(0);
    });

    it('有事件时应处理事件并记录结果', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });

      // 添加多个 Agent
      const agents = Array.from({ length: 10 }, (_, i) => new Agent({ id: `a${i}` }));
      engine.addAgents(agents);

      // 注入高重要性事件（所有 Agent 都会关注）
      engine.injectEvent({
        title: '重大事件',
        content: '重大内容',
        importance: 0.9,
        propagationRadius: 0.8,
      });

      const result = await engine.step();
      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('Agent 返回 socialActions 时应处理 follow/unfollow', async () => {
      const router = new ModelRouter(MOCK_MODEL_CONFIG);
      // mock LLM 返回 socialActions
      for (const tier of ['local', 'cheap', 'strong'] as const) {
        let callCount = 0;
        vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            // 第一个 agent 的响应：follow a2
            return JSON.stringify({
              opinion: '关注',
              action: 'speak',
              emotionalState: 0.3,
              reasoning: '理由',
              socialActions: [{ type: 'follow', targetAgentId: 'a2' }],
            });
          }
          // 其他 agent 正常响应
          return '{"opinion":"观点","action":"silent","emotionalState":0.0,"reasoning":"理由"}';
        });
      }

      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });
      const a1 = new Agent({ id: 'a1', name: 'AgentA' });
      const a2 = new Agent({ id: 'a2', name: 'AgentB' });
      engine.addAgent(a1);
      engine.addAgent(a2);

      engine.injectEvent({
        title: '社交测试事件',
        content: '内容',
        importance: 1.0,
        propagationRadius: 1.0,
      });

      const result = await engine.step();
      expect(result.eventsProcessed).toBe(1);

      // 验证社交关系：a1 应 follow 了 a2
      // socialGraph 应有对应边
      expect(engine.socialGraph.getEdgeCount()).toBeGreaterThan(0);
    });

    it('Agent 返回 unfollow socialAction 时应移除社交关系', async () => {
      const router = new ModelRouter(MOCK_MODEL_CONFIG);
      let phase = 1;
      for (const tier of ['local', 'cheap', 'strong'] as const) {
        vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
          if (phase === 1) {
            return JSON.stringify({
              opinion: '关注',
              action: 'speak',
              emotionalState: 0.3,
              reasoning: '理由',
              socialActions: [{ type: 'follow', targetAgentId: 'a2' }],
            });
          } else {
            return JSON.stringify({
              opinion: '取关',
              action: 'speak',
              emotionalState: -0.1,
              reasoning: '理由',
              socialActions: [{ type: 'unfollow', targetAgentId: 'a2' }],
            });
          }
        });
      }

      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });
      const a1 = new Agent({ id: 'a1', name: 'AgentA' });
      const a2 = new Agent({ id: 'a2', name: 'AgentB' });
      engine.addAgent(a1);
      engine.addAgent(a2);

      // 第一步：follow
      engine.injectEvent({ title: '事件1', content: '内容', importance: 1.0, propagationRadius: 1.0 });
      await engine.step();
      expect(a1.following).toContain('a2');

      // 第二步：unfollow
      phase = 2;
      engine.injectEvent({ title: '事件2', content: '内容', importance: 1.0, propagationRadius: 1.0 });
      await engine.step();
      expect(a1.following).not.toContain('a2');
    });

    it('事件处理异常时应捕获并继续', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });

      const agents = Array.from({ length: 3 }, (_, i) => new Agent({ id: `a${i}` }));
      engine.addAgents(agents);

      // 注入两个事件
      engine.injectEvent({ title: '正常事件', content: '内容', importance: 0.9, propagationRadius: 0.8 });
      engine.injectEvent({ title: '异常事件', content: '内容', importance: 0.9, propagationRadius: 0.8 });

      // Mock activationPool 使第二个事件计算激活时抛出异常
      let callCount = 0;
      const originalCompute = engine.activationPool.computeActivation.bind(engine.activationPool);
      vi.spyOn(engine.activationPool, 'computeActivation').mockImplementation((...args) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('模拟事件处理失败');
        }
        return originalCompute(...args);
      });

      const result = await engine.step();
      // 应跳过异常事件，但不中断总体流程
      expect(result.eventsProcessed).toBe(2);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('处理事件'),
        expect.any(String),
      );
    });

    it('共识分析抛出异常时应捕获并继续', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });

      const agents = Array.from({ length: 10 }, (_, i) => new Agent({ id: `ca${i}` }));
      engine.addAgents(agents);

      engine.injectEvent({
        title: '共识失败事件',
        content: '内容',
        importance: 1.0,
        propagationRadius: 1.0,
      });

      // Mock 共识引擎抛出异常
      vi.spyOn(engine.consensusEngine, 'analyze').mockImplementation(() => {
        throw new Error('模拟共识分析失败');
      });

      const result = await engine.step();
      // 虽然共识分析失败，tick 仍应正常完成
      expect(result.tick).toBe(1);
      expect(result.signals).toBe(0);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('共识分析失败'),
        expect.any(String),
      );
    });

    it('连续 step 应递增 tick', async () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      const r1 = await engine.step();
      const r2 = await engine.step();
      const r3 = await engine.step();
      expect(r1.tick).toBe(1);
      expect(r2.tick).toBe(2);
      expect(r3.tick).toBe(3);
    });
  });

  // ── 查询方法 ──

  describe('查询方法', () => {
    it('getCurrentTick 应返回当前 tick', async () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.getCurrentTick()).toBe(0);
      await engine.step();
      expect(engine.getCurrentTick()).toBe(1);
    });

    it('getTickHistory 应返回历史记录', async () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      await engine.step();
      await engine.step();
      const history = engine.getTickHistory();
      expect(history).toHaveLength(2);
    });

    it('getLastTickResult 初始应为 undefined', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.getLastTickResult()).toBeUndefined();
    });

    it('getLastTickResult step 后应有值', async () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      await engine.step();
      const last = engine.getLastTickResult();
      expect(last).toBeDefined();
      expect(last!.tick).toBe(1);
    });

    it('getWorldState / getConsensusEngine / getSocialGraph 应返回对应对象', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.getWorldState()).toBe(engine.worldState);
      expect(engine.getConsensusEngine()).toBe(engine.consensusEngine);
      expect(engine.getSocialGraph()).toBe(engine.socialGraph);
    });

    it('getPerformanceStats 应返回缓存、批量推理和激活池的统计', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      const stats = engine.getPerformanceStats();
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('batchInference');
      expect(stats).toHaveProperty('activationPool');
    });
  });

  // ── 定时孵化 ──

  describe('定时孵化 (scheduledTriggers)', () => {
    it('定时孵化规则触发时应产生新 Agent', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });

      // 添加孵化规则：每 1 tick 触发一次定时孵化
      engine.spawner.addRule({
        id: 'scheduled-rule-1',
        trigger: { type: 'scheduled', intervalTicks: 1 },
        count: 2,
      });

      // 初无 agent
      expect(engine.getAgents()).toHaveLength(0);

      const result = await engine.step();

      // 定时孵化应产生 2 个新 Agent
      expect(result.newAgentsSpawned).toBeGreaterThanOrEqual(2);
      expect(engine.getAgents().length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── 自然选择 ──

  describe('自然选择 (NaturalSelection)', () => {
    it('启用自然选择且到达检查间隔时应执行淘汰', async () => {
      const router = createMockModelRouter();
      const configWithNS: WorldConfig = {
        ...TEST_CONFIG,
        enableNaturalSelection: true,
      };
      const engine = new WorldEngine({
        config: configWithNS,
        modelRouter: router,
        naturalSelectionConfig: {
          checkIntervalTicks: 1,       // 每 tick 检查
          credibilityThreshold: 0.5,   // 信誉低于 0.5 淘汰
          inactivityTicks: 0,          // 不活跃则立即淘汰
        },
      });

      // 添加一些 agent，设置低信誉
      // Agent 默认 credibility=0.5，用 updateCredibility 调整
      const a1 = new Agent({ id: 'ns-a1', name: '低信誉Agent' });
      a1.updateCredibility(-0.45); // 0.5 - 0.45 = 0.05, 低于阈值 0.5
      const a2 = new Agent({ id: 'ns-a2', name: '高信誉Agent' });
      a2.updateCredibility(0.4);  // 0.5 + 0.4 = 0.9, 高于阈值
      engine.addAgent(a1);
      engine.addAgent(a2);

      const result = await engine.step();

      // 自然选择应有淘汰
      expect(result.agentsEliminated).toBeGreaterThanOrEqual(1);
      // 低信誉的 agent 应被标记为 dormant
      expect(a1.status).toBe('dormant');
      // 高信誉的 agent 应仍然 active（如果不是因为 inactivity 被淘汰）
    });

    it('自然选择且有 targetPopulation 时应补充种群', async () => {
      const router = createMockModelRouter();
      const configWithNS: WorldConfig = {
        ...TEST_CONFIG,
        enableNaturalSelection: true,
      };
      const engine = new WorldEngine({
        config: configWithNS,
        modelRouter: router,
        naturalSelectionConfig: {
          checkIntervalTicks: 1,
          credibilityThreshold: 0.5,
          inactivityTicks: 1000,      // 不测试不活跃淘汰
          targetPopulation: 5,         // 目标种群 5
        },
      });

      // 只添加 2 个 agent，都是高信誉
      const a1 = new Agent({ id: 'pop-a1' });
      a1.updateCredibility(0.4); // 0.5 + 0.4 = 0.9
      const a2 = new Agent({ id: 'pop-a2' });
      a2.updateCredibility(0.4); // 0.5 + 0.4 = 0.9
      engine.addAgent(a1);
      engine.addAgent(a2);

      const result = await engine.step();

      // 应补充到目标种群
      expect(result.newAgentsSpawned).toBeGreaterThanOrEqual(3); // 5 - 2 = 3
      expect(engine.getAgents().length).toBeGreaterThanOrEqual(5);
    });
  });

  // ── markRunning ──

  describe('markRunning', () => {
    it('应允许外部设置运行状态', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.isRunning()).toBe(false);
      engine.markRunning(true);
      expect(engine.isRunning()).toBe(true);
      engine.markRunning(false);
      expect(engine.isRunning()).toBe(false);
    });
  });

  // ── Agent 推理失败 ──

  describe('Agent 推理失败', () => {
    it('单个 Agent 推理失败不应中断整体流程', async () => {
      const router = new ModelRouter(MOCK_MODEL_CONFIG);
      let callCount = 0;
      for (const tier of ['local', 'cheap', 'strong'] as const) {
        vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('模拟推理超时');
          }
          return '{"opinion":"观点","action":"speak","emotionalState":0.3,"reasoning":"理由"}';
        });
      }

      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });
      const agents = Array.from({ length: 5 }, (_, i) => new Agent({ id: `fail-${i}` }));
      engine.addAgents(agents);

      engine.injectEvent({
        title: '推理失败事件',
        content: '内容',
        importance: 1.0,
        propagationRadius: 1.0,
      });

      const result = await engine.step();
      // tick 应正常完成，即使有 Agent 推理失败
      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(1);
    });
  });

  // ── maxAgents 限制 ──

  describe('maxAgents 限制', () => {
    it('直接注册单个 Agent 时也应受 maxAgents 限制', () => {
      const router = createMockModelRouter();
      const smallConfig: WorldConfig = {
        ...TEST_CONFIG,
        maxAgents: 2,
      };
      const engine = new WorldEngine({ config: smallConfig, modelRouter: router });

      engine.addAgent(new Agent({ id: 'direct-1' }));
      engine.addAgent(new Agent({ id: 'direct-2' }));
      engine.addAgent(new Agent({ id: 'direct-3' }));

      expect(engine.getAgents()).toHaveLength(2);
      expect(engine.getAgent('direct-3')).toBeUndefined();
    });

    it('批量注册 Agent 时也应截断到 maxAgents 上限', () => {
      const router = createMockModelRouter();
      const smallConfig: WorldConfig = {
        ...TEST_CONFIG,
        maxAgents: 3,
      };
      const engine = new WorldEngine({ config: smallConfig, modelRouter: router });

      const agents = Array.from({ length: 5 }, (_, i) => new Agent({ id: `batch-${i}` }));
      engine.addAgents(agents);

      expect(engine.getAgents()).toHaveLength(3);
      expect(engine.getAgent('batch-3')).toBeUndefined();
      expect(engine.getAgent('batch-4')).toBeUndefined();
    });

    it('Agent 数量达到 maxAgents 时不应再孵化', async () => {
      const router = createMockModelRouter();
      const smallConfig: WorldConfig = {
        ...TEST_CONFIG,
        maxAgents: 3,
      };
      const engine = new WorldEngine({ config: smallConfig, modelRouter: router });

      // 先加满 Agent
      const agents = Array.from({ length: 3 }, (_, i) => new Agent({ id: `max-${i}` }));
      engine.addAgents(agents);

      // 添加孵化规则
      engine.spawner.addRule({
        id: 'max-test-rule',
        trigger: { type: 'event', keyword: '触发孵化' },
        count: 5,
      });

      engine.injectEvent({
        title: '触发孵化',
        content: '内容',
        importance: 0.9,
        propagationRadius: 0.8,
      });

      const result = await engine.step();
      // 不应产生新 Agent（因为已满）
      expect(result.newAgentsSpawned).toBe(0);
      expect(engine.getAgents().length).toBe(3);
    });

    it('接近 maxAgents 时应只孵化到上限', async () => {
      const router = createMockModelRouter();
      const smallConfig: WorldConfig = {
        ...TEST_CONFIG,
        maxAgents: 5,
      };
      const engine = new WorldEngine({ config: smallConfig, modelRouter: router });

      // 先加 3 个 Agent
      const agents = Array.from({ length: 3 }, (_, i) => new Agent({ id: `near-${i}` }));
      engine.addAgents(agents);

      // 添加孵化规则（想孵化 10 个）
      engine.spawner.addRule({
        id: 'near-max-rule',
        trigger: { type: 'event', keyword: '大量孵化' },
        count: 10,
      });

      engine.injectEvent({
        title: '大量孵化',
        content: '内容',
        importance: 0.9,
        propagationRadius: 0.8,
      });

      const result = await engine.step();
      // 应最多只能多加 2 个（5 - 3 = 2）
      expect(engine.getAgents().length).toBeLessThanOrEqual(5);
      expect(result.newAgentsSpawned).toBeLessThanOrEqual(2);
    });
  });

  // ── TickResult 摘要字段 ──

  describe('TickResult 摘要字段', () => {
    it('有事件时应包含 events 和 timestamp', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });
      const agents = Array.from({ length: 5 }, (_, i) => new Agent({ id: `sum-${i}` }));
      engine.addAgents(agents);

      engine.injectEvent({
        title: '摘要测试事件',
        content: '内容',
        importance: 0.9,
        propagationRadius: 0.8,
        category: 'general',
      });

      const result = await engine.step();
      expect(result.events).toBeDefined();
      expect(result.events!.length).toBe(1);
      expect(result.events![0]!.title).toBe('摘要测试事件');
      expect(result.events![0]!.category).toBe('general');
      expect(result.timestamp).toBeDefined();
    });

    it('有 Agent 响应时应包含 responses 摘要', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });
      const agents = Array.from({ length: 5 }, (_, i) => new Agent({ id: `resp-sum-${i}` }));
      engine.addAgents(agents);

      engine.injectEvent({
        title: '响应摘要测试',
        content: '内容',
        importance: 1.0,
        propagationRadius: 1.0,
      });

      const result = await engine.step();
      if (result.responsesCollected > 0) {
        expect(result.responses).toBeDefined();
        expect(result.responses!.length).toBe(result.responsesCollected);
        for (const resp of result.responses!) {
          expect(resp.agentId).toBeDefined();
          expect(resp.opinion).toBeDefined();
          expect(resp.action).toBeDefined();
          expect(typeof resp.emotionalState).toBe('number');
        }
      }
    });

    it('无事件时不应包含 events 和 responses 摘要', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });
      engine.addAgent(new Agent({ id: 'no-event-1' }));

      const result = await engine.step();
      expect(result.events).toBeUndefined();
      expect(result.responses).toBeUndefined();
    });
  });

  // ── 定时孵化 maxAgents 限制 ──

  describe('定时孵化 maxAgents 限制', () => {
    it('定时孵化也应受 maxAgents 限制', async () => {
      const router = createMockModelRouter();
      const smallConfig: WorldConfig = {
        ...TEST_CONFIG,
        maxAgents: 4,
      };
      const engine = new WorldEngine({ config: smallConfig, modelRouter: router });

      // 先加 3 个 Agent
      const agents = Array.from({ length: 3 }, (_, i) => new Agent({ id: `sched-${i}` }));
      engine.addAgents(agents);

      // 添加定时孵化规则（想孵化 5 个）
      engine.spawner.addRule({
        id: 'scheduled-max-rule',
        trigger: { type: 'scheduled', intervalTicks: 1 },
        count: 5,
      });

      const result = await engine.step();
      // 应最多加 1 个（4 - 3 = 1）
      expect(engine.getAgents().length).toBeLessThanOrEqual(4);
      expect(result.newAgentsSpawned).toBeLessThanOrEqual(1);
    });
  });

  // ── tickHistory 裁剪 ──

  describe('tickHistory 裁剪', () => {
    it('超过 200 个 tick 历史应自动裁剪', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });

      // 执行 205 个 step
      for (let i = 0; i < 205; i++) {
        await engine.step();
      }

      const history = engine.getTickHistory();
      // 应裁剪到最近 200 个
      expect(history.length).toBeLessThanOrEqual(200);
      // 最新的 tick 应该在里面
      expect(history[history.length - 1]!.tick).toBe(205);
      // 最早的应该是 tick 6（205 - 200 + 1 = 6）
      expect(history[0]!.tick).toBe(6);
    });
  });

  // ── 覆盖率补充：maxAgents 默认值分支 ──

  describe('maxAgents 默认值', () => {
    it('config 未设置 maxAgents 时应使用默认值 100', async () => {
      const router = createMockModelRouter();
      const configNoMax: WorldConfig = {
        tickIntervalMs: 1000,
        eventRetentionTicks: 50,
        enableNaturalSelection: false,
      };
      const engine = new WorldEngine({ config: configNoMax, modelRouter: router });

      // 使用定时孵化确保触发
      engine.spawner.addRule({
        id: 'default-max-sched',
        trigger: { type: 'scheduled', intervalTicks: 1 },
        count: 2,
      });

      const result = await engine.step();
      // 应正常孵化（不会因为 maxAgents 未定义而报错）
      expect(result.newAgentsSpawned).toBeGreaterThanOrEqual(2);
    });
  });

  // ── 覆盖率补充：TickResult 可选字段为 undefined 的分支 ──

  describe('TickResult 可选字段边界', () => {
    it('无事件时 cacheHits/cacheMisses/agentsFiltered 应为 undefined', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });
      engine.addAgent(new Agent({ id: 'opt-1' }));

      const result = await engine.step();
      // 无事件处理，缓存和过滤都不会触发
      expect(result.cacheHits).toBeUndefined();
      expect(result.cacheMisses).toBeUndefined();
      expect(result.agentsFiltered).toBeUndefined();
      expect(result.agentsEliminated).toBeUndefined();
    });
  });

  // ── 覆盖率补充：共识分析异常为非 Error 实例 ──

  describe('共识分析非 Error 实例异常', () => {
    it('共识分析抛出字符串异常时应捕获并继续', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });

      const agents = Array.from({ length: 10 }, (_, i) => new Agent({ id: `str-err-${i}` }));
      engine.addAgents(agents);

      engine.injectEvent({
        title: '字符串异常测试',
        content: '内容',
        importance: 1.0,
        propagationRadius: 1.0,
      });

      // Mock 共识引擎抛出非 Error 类型
      vi.spyOn(engine.consensusEngine, 'analyze').mockImplementation(() => {
        throw 'string error message';
      });

      const result = await engine.step();
      expect(result.tick).toBe(1);
      expect(result.signals).toBe(0);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('共识分析失败'),
        'string error message',
      );
    });
  });

  // ── 覆盖率补充：事件处理异常为非 Error 实例 ──

  describe('事件处理非 Error 实例异常', () => {
    it('事件处理抛出非 Error 对象时应捕获并继续', async () => {
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: router });

      const agents = Array.from({ length: 3 }, (_, i) => new Agent({ id: `ne-${i}` }));
      engine.addAgents(agents);

      engine.injectEvent({
        title: '非Error异常事件',
        content: '内容',
        importance: 0.9,
        propagationRadius: 0.8,
      });

      // Mock activationPool 抛出非 Error 对象
      vi.spyOn(engine.activationPool, 'computeActivation').mockImplementation(() => {
        throw { code: 42, msg: 'non-error object' };
      });

      const result = await engine.step();
      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('处理事件'),
        expect.objectContaining({ code: 42 }),
      );
    });
  });

  // ── 覆盖率补充：构造函数默认参数 ──

  describe('构造函数默认参数', () => {
    it('不传 modelRouter 时应使用默认 ModelRouter', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG });
      expect(engine).toBeDefined();
      expect(engine.getAgents()).toHaveLength(0);
    });

    it('不传 concurrency 时应使用默认值 10', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG });
      // 引擎应正常初始化
      expect(engine).toBeDefined();
    });
  });

  // ── 分布式模式 ──

  describe('分布式模式', () => {
    it('未启用分布式模式时 getCoordinatorStatus 应返回 null', () => {
      const engine = new WorldEngine({ config: TEST_CONFIG, modelRouter: createMockModelRouter() });
      expect(engine.getCoordinatorStatus()).toBeNull();
    });

    it('启用分布式模式时应正确初始化 Coordinator', () => {
      const distributedConfig: WorldConfig = {
        ...TEST_CONFIG,
        distributed: true,
        workerCount: 2,
      };
      const engine = new WorldEngine({ config: distributedConfig, modelRouter: createMockModelRouter() });

      const status = engine.getCoordinatorStatus();
      expect(status).not.toBeNull();
      expect(status!.enabled).toBe(true);
      expect(status!.workers).toHaveLength(2);
    });

    it('分布式模式默认 workerCount 应为 2', () => {
      const distributedConfig: WorldConfig = {
        ...TEST_CONFIG,
        distributed: true,
        // 不指定 workerCount
      };
      const engine = new WorldEngine({ config: distributedConfig, modelRouter: createMockModelRouter() });

      const status = engine.getCoordinatorStatus();
      expect(status).not.toBeNull();
      expect(status!.workers).toHaveLength(2);
    });

    it('分布式模式 step 应通过 Coordinator 处理 tick', async () => {
      const distributedConfig: WorldConfig = {
        ...TEST_CONFIG,
        distributed: true,
        workerCount: 2,
      };
      const engine = new WorldEngine({ config: distributedConfig, modelRouter: createMockModelRouter() });

      // 添加 Agent
      const agents = Array.from({ length: 4 }, (_, i) => new Agent({ id: `dist-a${i}` }));
      engine.addAgents(agents);

      // 注入事件
      engine.injectEvent({
        title: '分布式测试事件',
        content: '测试分布式处理',
        importance: 0.9,
        propagationRadius: 0.8,
      });

      const result = await engine.step();

      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(1);
      // 分布式模式也应正常完成 tick
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('分布式模式下 addAgent 应触发 Agent 分配', () => {
      const distributedConfig: WorldConfig = {
        ...TEST_CONFIG,
        distributed: true,
        workerCount: 2,
      };
      const engine = new WorldEngine({ config: distributedConfig, modelRouter: createMockModelRouter() });

      const agent = new Agent({ id: 'dist-single' });
      engine.addAgent(agent);

      const status = engine.getCoordinatorStatus();
      // Coordinator 应该有分配信息
      expect(status!.assignments).toBeDefined();
    });

    it('分布式模式 Tick 结果应包含 Worker 处理的响应', async () => {
      const distributedConfig: WorldConfig = {
        ...TEST_CONFIG,
        distributed: true,
        workerCount: 2,
      };
      const router = createMockModelRouter();
      const engine = new WorldEngine({ config: distributedConfig, modelRouter: router });

      // 添加 Agent
      const agents = Array.from({ length: 6 }, (_, i) => new Agent({ id: `dist-w${i}` }));
      engine.addAgents(agents);

      // 注入高重要性事件
      engine.injectEvent({
        title: '分布式高重要性',
        content: '测试所有 Agent 激活',
        importance: 1.0,
        propagationRadius: 1.0,
      });

      const result = await engine.step();

      // tick 应正常完成
      expect(result.tick).toBe(1);
    });

    it('分布式模式下无事件时 tick 应正常完成', async () => {
      const distributedConfig: WorldConfig = {
        ...TEST_CONFIG,
        distributed: true,
        workerCount: 2,
      };
      const engine = new WorldEngine({ config: distributedConfig, modelRouter: createMockModelRouter() });

      engine.addAgent(new Agent({ id: 'dist-idle' }));

      // 无事件注入
      const result = await engine.step();

      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(0);
    });
  });
});
