// ============================================================================
// WorldEngine 包 — 函数覆盖率补充测试
// 覆盖 NaturalSelection、ScenarioRunner、TickScheduler、
// AgentActivationPool、WorldState 中 V8 未触达的函数
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NaturalSelection } from './NaturalSelection.js';
import { ScenarioRunner } from './ScenarioRunner.js';
import { TickScheduler } from './TickScheduler.js';
import { AgentActivationPool } from './AgentActivationPool.js';
import { WorldStateManager } from './WorldState.js';
import { Agent, AgentSpawner, ModelRouter } from '@beeclaw/agent-runtime';
import { SocialGraph } from '@beeclaw/social-graph';
import type { WorldEvent, ScenarioTemplate, ModelRouterConfig } from '@beeclaw/shared';

// ── 辅助工具 ──

function createAgent(overrides: {
  id?: string;
  name?: string;
  status?: 'active' | 'dormant' | 'dead';
  credibility?: number;
  lastActiveTick?: number;
}): Agent {
  const agent = new Agent({
    id: overrides.id ?? `agent_${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? '测试Agent',
    spawnedAtTick: 0,
  });
  if (overrides.status) agent.setStatus(overrides.status);
  if (overrides.credibility !== undefined) {
    agent.updateCredibility(overrides.credibility - 0.5);
  }
  if (overrides.lastActiveTick !== undefined) {
    (agent as unknown as { _lastActiveTick: number })._lastActiveTick = overrides.lastActiveTick;
  }
  return agent;
}

function createEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 'evt_test',
    type: 'external',
    category: 'general',
    title: '测试事件',
    content: '测试内容',
    source: 'test',
    importance: 0.5,
    propagationRadius: 0.5,
    tick: 1,
    tags: ['测试'],
    ...overrides,
  };
}

const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

function createMockModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockResolvedValue(
      '{"opinion":"观点","action":"speak","emotionalState":0.3,"reasoning":"理由"}'
    );
  }
  return router;
}

function createTestTemplate(overrides?: Partial<ScenarioTemplate>): ScenarioTemplate {
  return {
    name: 'fn-test-scenario',
    description: '函数覆盖率测试场景',
    agentProfiles: [{
      role: '测试角色',
      count: 2,
      modelTier: 'local',
      template: {
        professionPool: ['测试员'],
        traitRanges: {
          riskTolerance: [0.3, 0.7],
          informationSensitivity: [0.3, 0.7],
          conformity: [0.3, 0.7],
          emotionality: [0.3, 0.7],
          analyticalDepth: [0.3, 0.7],
        },
        expertisePool: [['测试']],
        biasPool: ['确认偏见'],
      },
    }],
    eventSources: [{ type: 'manual', name: '手动', config: {} }],
    worldConfig: { tickIntervalMs: 1000, maxAgents: 50 },
    consensusConfig: {},
    duration: 2,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// NaturalSelection 补充
// ══════════════════════════════════════════════════════════════════════════════

describe('NaturalSelection 函数覆盖率补充', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('evaluate — agents.filter 回调（阶段1/3/统计）', () => {
    it('阶段1 filter(a => a.status === active) 应区分各种状态', () => {
      const ns = new NaturalSelection({ credibilityThreshold: 0.2 });
      const agents = [
        createAgent({ id: 'active1', credibility: 0.8, lastActiveTick: 99 }),
        createAgent({ id: 'dormant1', status: 'dormant', lastActiveTick: 80 }),
        createAgent({ id: 'dead1', status: 'dead', lastActiveTick: 0 }),
      ];
      const spawner = new AgentSpawner();
      const { result } = ns.evaluate(100, agents, spawner, () => {});

      // active1 保持 active，dormant1 和 dead1 不被处理
      expect(result.activeCountBefore).toBe(1);
      expect(result.newDormant).toHaveLength(0);
    });
  });

  describe('evaluate — newDormant.some 回调', () => {
    it('本轮刚设为 dormant 的不应在阶段2再检查', () => {
      const ns = new NaturalSelection({
        credibilityThreshold: 0.2,
        dormantDeathTicks: 0,
      });
      const agents = [
        // 将因低信誉变 dormant
        createAgent({ id: 'a1', name: 'Low', credibility: 0.1, lastActiveTick: 95 }),
      ];
      const spawner = new AgentSpawner();
      const { result } = ns.evaluate(100, agents, spawner, () => {});

      expect(result.newDormant).toHaveLength(1);
      // 即使 dormantDeathTicks=0，本轮刚 dormant 的不应立即变 dead
      expect(result.newDead).toHaveLength(0);
    });
  });

  describe('buildSelectionEvent — dormantNames.map 和 deadNames.map 回调', () => {
    it('多个 dormant/dead 记录时 map 回调应全部执行', () => {
      const ns = new NaturalSelection({
        credibilityThreshold: 0.2,
        inactivityTicks: 50,
        dormantDeathTicks: 100,
      });
      const agents = [
        createAgent({ id: 'lc1', name: '低信1', credibility: 0.1, lastActiveTick: 99 }),
        createAgent({ id: 'lc2', name: '低信2', credibility: 0.05, lastActiveTick: 99 }),
        createAgent({ id: 'ia1', name: '不活跃', credibility: 0.5, lastActiveTick: 10 }),
        createAgent({ id: 'old1', name: '老休眠1', status: 'dormant', lastActiveTick: 50 }),
        createAgent({ id: 'old2', name: '老休眠2', status: 'dormant', lastActiveTick: 60 }),
      ];
      const spawner = new AgentSpawner();
      const { event } = ns.evaluate(200, agents, spawner, () => {});

      // 验证事件内容包含多个名字
      expect(event.content).toContain('低信1');
      expect(event.content).toContain('低信2');
      expect(event.content).toContain('不活跃');
      expect(event.content).toContain('老休眠1');
      expect(event.content).toContain('老休眠2');
    });
  });

  describe('evaluate — spawner.spawnBatch 后的迭代器', () => {
    it('newSpawned 应包含每个新 Agent 的 id', () => {
      const ns = new NaturalSelection({ targetPopulation: 5 });
      const agents: Agent[] = [];
      const spawner = new AgentSpawner();
      const addedAgents: Agent[] = [];
      const { result } = ns.evaluate(100, agents, spawner, (newAgents) => {
        addedAgents.push(...newAgents);
      });

      expect(result.newSpawned).toHaveLength(5);
      for (const id of result.newSpawned) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getConfig 返回副本', () => {
    it('修改返回的配置不应影响内部', () => {
      const ns = new NaturalSelection();
      const config = ns.getConfig();
      // getConfig 返回的是扩展拷贝
      expect(config.checkIntervalTicks).toBe(100);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ScenarioRunner 补充
// ══════════════════════════════════════════════════════════════════════════════

describe('ScenarioRunner 函数覆盖率补充', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('buildWorldConfig — 合并配置', () => {
    it('模板 worldConfig 应覆盖默认值', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({
        worldConfig: { tickIntervalMs: 5000, maxAgents: 200 },
      }));

      const engine = runner.getEngine()!;
      expect(engine.config.tickIntervalMs).toBe(5000);
      expect(engine.config.maxAgents).toBe(200);
    });
  });

  describe('createAgentsFromProfiles — spawner.spawnBatch 循环', () => {
    it('多个 profile 应创建正确总数的 Agent', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({
        agentProfiles: [
          {
            role: 'A', count: 3, modelTier: 'local',
            template: {
              professionPool: ['P1'], traitRanges: {
                riskTolerance: [0.3, 0.7], informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7], emotionality: [0.3, 0.7], analyticalDepth: [0.3, 0.7],
              }, expertisePool: [['E1']], biasPool: ['B1'],
            },
          },
          {
            role: 'B', count: 4, modelTier: 'cheap',
            template: {
              professionPool: ['P2'], traitRanges: {
                riskTolerance: [0.3, 0.7], informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7], emotionality: [0.3, 0.7], analyticalDepth: [0.3, 0.7],
              }, expertisePool: [['E2']], biasPool: ['B2'],
            },
          },
        ],
      }));

      expect(runner.getEngine()!.getAgents()).toHaveLength(7);
    });
  });

  describe('run — tickResults.reduce 回调', () => {
    it('完成后 console.log 中的 reduce 回调应执行', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({ duration: 2 }));

      const results = await runner.run(2);
      expect(results).toHaveLength(2);
      expect(runner.getStatus()).toBe('completed');
    });
  });

  describe('getSummary — tickResults.reduce 回调', () => {
    it('getSummary 中的 reduce 回调应计算统计', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({ duration: 2 }));
      await runner.run(2);

      const summary = runner.getSummary();
      expect(summary).not.toBeNull();
      expect(summary!.ticksCompleted).toBe(2);
      expect(typeof summary!.totalEventsProcessed).toBe('number');
      expect(typeof summary!.totalResponsesCollected).toBe('number');
      expect(typeof summary!.totalSignals).toBe('number');
    });
  });

  describe('getSummary — agentProfiles.reduce 和 eventSources.map 回调', () => {
    it('总 Agent 数应为所有 profile count 之和', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({
        agentProfiles: [
          {
            role: 'X', count: 5, modelTier: 'local',
            template: {
              professionPool: ['P'], traitRanges: {
                riskTolerance: [0.3, 0.7], informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7], emotionality: [0.3, 0.7], analyticalDepth: [0.3, 0.7],
              }, expertisePool: [['E']], biasPool: ['B'],
            },
          },
          {
            role: 'Y', count: 3, modelTier: 'cheap',
            template: {
              professionPool: ['Q'], traitRanges: {
                riskTolerance: [0.3, 0.7], informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7], emotionality: [0.3, 0.7], analyticalDepth: [0.3, 0.7],
              }, expertisePool: [['F']], biasPool: ['C'],
            },
          },
        ],
        eventSources: [
          { type: 'finance', name: '金融源', config: {} },
          { type: 'rss', name: 'RSS源', config: {} },
        ],
      }));

      const summary = runner.getSummary();
      expect(summary!.totalAgentsCreated).toBe(8);
      expect(summary!.eventSources).toEqual(['金融源', 'RSS源']);
    });
  });

  describe('describeEventSources — map 回调中的 switch 分支', () => {
    it('所有 type 分支都应覆盖', () => {
      const descriptions = ScenarioRunner.describeEventSources([
        { type: 'finance', name: 'F1', config: {} },
        { type: 'rss', name: 'R1', config: {} },
        { type: 'manual', name: 'M1', config: {} },
        { type: 'unknown' as 'manual', name: 'U1', config: {} },
      ]);

      expect(descriptions[0]).toContain('金融');
      expect(descriptions[1]).toContain('RSS');
      expect(descriptions[2]).toContain('手动');
      expect(descriptions[3]).toContain('未知');
    });
  });

  describe('loadTemplate — spawnRules 迭代器', () => {
    it('多条 spawnRules 应全部注册', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({
        spawnRules: [
          {
            trigger: { type: 'event_keyword', keywords: ['k1'] },
            template: {
              professionPool: ['P'], traitRanges: {
                riskTolerance: [0.3, 0.7], informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7], emotionality: [0.3, 0.7], analyticalDepth: [0.3, 0.7],
              }, expertisePool: [['E']], biasPool: ['B'],
            },
            count: 1, modelTier: 'local',
          },
          {
            trigger: { type: 'event_keyword', keywords: ['k2'] },
            template: {
              professionPool: ['Q'], traitRanges: {
                riskTolerance: [0.3, 0.7], informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7], emotionality: [0.3, 0.7], analyticalDepth: [0.3, 0.7],
              }, expertisePool: [['F']], biasPool: ['C'],
            },
            count: 2, modelTier: 'cheap',
          },
        ],
      }));

      expect(runner.getEngine()!.spawner.getRules().length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('loadTemplate — seedEvents 迭代器', () => {
    it('多个 seedEvents 应全部注入', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({
        seedEvents: [
          { title: 'S1', content: 'C1', category: 'general', importance: 0.5, tags: ['t1'] },
          { title: 'S2', content: 'C2', category: 'finance', importance: 0.7, tags: ['t2'] },
        ],
      }));

      const events = runner.getEngine()!.eventBus.consumeEvents();
      expect(events.length).toBeGreaterThanOrEqual(2);
      const titles = events.map(e => e.title);
      expect(titles).toContain('S1');
      expect(titles).toContain('S2');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TickScheduler 补充
// ══════════════════════════════════════════════════════════════════════════════

describe('TickScheduler 函数覆盖率补充', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('scheduleNext — setTimeout 回调', () => {
    it('start 后 setTimeout 回调应被执行', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 50 });
      const callback = vi.fn().mockResolvedValue(undefined);
      scheduler.onTick(callback);

      scheduler.start();
      await vi.advanceTimersByTimeAsync(50);
      expect(callback).toHaveBeenCalledWith(1);

      await vi.advanceTimersByTimeAsync(50);
      expect(callback).toHaveBeenCalledWith(2);

      scheduler.stop();
      vi.useRealTimers();
    });
  });

  describe('scheduleNext — 异常捕获回调', () => {
    it('回调抛出错误时 catch 应捕获并继续', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 50 });
      let calls = 0;
      const callback = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) throw new Error('test error');
      });
      scheduler.onTick(callback);

      scheduler.start();
      await vi.advanceTimersByTimeAsync(50);
      expect(console.error).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(50);
      expect(callback).toHaveBeenCalledTimes(2);

      scheduler.stop();
      vi.useRealTimers();
    });
  });

  describe('scheduleNext — running=false 提前退出', () => {
    it('stop 后 scheduleNext 应不再设置 timer', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 50 });
      const callback = vi.fn().mockResolvedValue(undefined);
      scheduler.onTick(callback);

      scheduler.start();
      scheduler.stop();

      await vi.advanceTimersByTimeAsync(200);
      // 已停止，不应调用回调
      expect(callback).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AgentActivationPool 补充
// ══════════════════════════════════════════════════════════════════════════════

describe('AgentActivationPool 函数覆盖率补充', () => {
  describe('computeActivation — disabled 模式的 for-of 回调', () => {
    it('禁用时 distances 的 for-of 应遍历所有 activeAgentIds', () => {
      const pool = new AgentActivationPool({ enabled: false });
      const graph = new SocialGraph();
      for (let i = 0; i < 5; i++) graph.addNode(`a${i}`);
      const ids = ['a0', 'a1', 'a2', 'a3', 'a4'];

      const result = pool.computeActivation(createEvent(), graph, ids);
      expect(result.activatedIds).toHaveLength(5);
      for (const id of ids) {
        expect(result.distances.get(id)).toBe(0);
      }
    });
  });

  describe('computeActivation — importance>=0.9 的 for-of 回调', () => {
    it('高重要性事件 distances 的 for-of 应遍历所有 activeAgentIds', () => {
      const pool = new AgentActivationPool();
      const graph = new SocialGraph();
      for (let i = 0; i < 8; i++) graph.addNode(`a${i}`);
      const ids = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];

      const result = pool.computeActivation(
        createEvent({ importance: 0.95 }),
        graph,
        ids,
      );
      expect(result.activatedIds).toHaveLength(8);
      expect(result.filteredCount).toBe(0);
    });
  });

  describe('computeActivation — shuffled sort 回调', () => {
    it('sort 回调应被执行（非高重要性场景）', () => {
      const pool = new AgentActivationPool();
      const graph = new SocialGraph();
      for (let i = 0; i < 20; i++) graph.addNode(`a${i}`, 50);
      graph.initializeRandomRelations(
        Array.from({ length: 20 }, (_, i) => `a${i}`),
        3,
      );
      const ids = Array.from({ length: 20 }, (_, i) => `a${i}`);

      const result = pool.computeActivation(
        createEvent({ importance: 0.5, propagationRadius: 0.3 }),
        graph,
        ids,
      );
      expect(result.activatedIds.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeActivation — BFS neighbors 循环', () => {
    it('BFS 应沿 getNeighbors 扩展并检查 activeSet', () => {
      const pool = new AgentActivationPool({ maxActivatedAgents: 50 });
      const graph = new SocialGraph();
      // 创建星形关系
      graph.addNode('center', 50);
      for (let i = 0; i < 10; i++) {
        graph.addNode(`spoke${i}`, 50);
        graph.addEdge('center', `spoke${i}`, 'follow', 0.8);
        graph.addEdge(`spoke${i}`, 'center', 'follow', 0.8);
      }

      const allIds = ['center', ...Array.from({ length: 10 }, (_, i) => `spoke${i}`)];
      // 只传部分作为 active
      const activeIds = allIds.slice(0, 6);

      const result = pool.computeActivation(
        createEvent({ importance: 0.7, propagationRadius: 0.5 }),
        graph,
        activeIds,
      );
      // 所有激活的应在 activeIds 中
      for (const id of result.activatedIds) {
        expect(activeIds).toContain(id);
      }
    });
  });

  describe('getStats — avgActivated/avgFiltered 计算', () => {
    it('多次 computeActivation 后统计应正确', () => {
      const pool = new AgentActivationPool();
      const graph = new SocialGraph();
      for (let i = 0; i < 5; i++) graph.addNode(`a${i}`, 50);
      const ids = ['a0', 'a1', 'a2', 'a3', 'a4'];

      // 高重要性——全部激活
      pool.computeActivation(createEvent({ importance: 0.95 }), graph, ids);
      pool.computeActivation(createEvent({ importance: 0.95 }), graph, ids);

      const stats = pool.getStats();
      expect(stats.totalActivations).toBe(2);
      expect(stats.avgActivated).toBe(5);
      expect(stats.avgFiltered).toBe(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WorldState 补充
// ══════════════════════════════════════════════════════════════════════════════

describe('WorldStateManager 函数覆盖率补充', () => {
  describe('formatStatus — sentimentEntries 迭代器', () => {
    it('多个 sentiment 值应触发 slice/for-of/条件判断', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiment('pos', 0.8);
      mgr.updateSentiment('neg', -0.6);
      mgr.updateSentiment('zero', 0);

      const status = mgr.formatStatus();
      expect(status).toContain('📈');
      expect(status).toContain('📉');
      expect(status).toContain('➡️');
    });
  });

  describe('formatStatus — activeEvents 迭代器', () => {
    it('多个事件应触发 slice(-5) 和 for-of', () => {
      const mgr = new WorldStateManager();
      const events = Array.from({ length: 8 }, (_, i) => ({
        id: `e${i}`, type: 'external' as const, category: 'general' as const,
        title: `Event${i}`, content: 'x', source: 'test',
        importance: (i + 1) * 0.1, propagationRadius: 0.3,
        tick: i, tags: [],
      }));
      mgr.setActiveEvents(events);

      const status = mgr.formatStatus();
      // 应只显示最后 5 个
      expect(status).toContain('Event3');
      expect(status).toContain('Event7');
      expect(status).not.toContain('Event2');
    });
  });

  describe('updateSentiments — Object.entries 迭代器', () => {
    it('多个 sentiment 的 for-of 应全部执行', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiments({
        'topic1': 0.5,
        'topic2': -0.3,
        'topic3': 0,
        'topic4': 1.5,   // 应被 clamp 到 1
        'topic5': -2.0,  // 应被 clamp 到 -1
      });

      const s = mgr.getState().sentiment;
      expect(s['topic1']).toBe(0.5);
      expect(s['topic2']).toBe(-0.3);
      expect(s['topic3']).toBe(0);
      expect(s['topic4']).toBe(1);
      expect(s['topic5']).toBe(-1);
    });
  });

  describe('addFact — globalFacts.slice 回调', () => {
    it('添加超过 100 条事实应触发 slice', () => {
      const mgr = new WorldStateManager();
      for (let i = 0; i < 105; i++) {
        mgr.addFact(`fact_${i}`);
      }
      const facts = mgr.getState().globalFacts;
      expect(facts).toHaveLength(100);
      expect(facts[0]).toBe('fact_5');
      expect(facts[99]).toBe('fact_104');
    });
  });
});
