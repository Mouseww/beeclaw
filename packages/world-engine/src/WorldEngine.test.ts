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
  });
});
