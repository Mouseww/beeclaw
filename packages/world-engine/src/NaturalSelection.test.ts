// ============================================================================
// NaturalSelection 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NaturalSelection, DEFAULT_SELECTION_CONFIG } from './NaturalSelection.js';
import type { NaturalSelectionConfig, SelectionResult } from './NaturalSelection.js';
import { Agent, AgentSpawner } from '@beeclaw/agent-runtime';

// ── 测试辅助函数 ──

function createAgent(overrides: {
  id?: string;
  name?: string;
  status?: 'active' | 'dormant' | 'dead';
  credibility?: number;
  spawnedAtTick?: number;
  lastActiveTick?: number;
}): Agent {
  const agent = new Agent({
    id: overrides.id ?? `agent_${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? `测试Agent`,
    spawnedAtTick: overrides.spawnedAtTick ?? 0,
  });

  if (overrides.status) {
    agent.setStatus(overrides.status);
  }
  if (overrides.credibility !== undefined) {
    // credibility 默认 0.5，需要通过 updateCredibility 调整
    agent.updateCredibility(overrides.credibility - 0.5);
  }
  // lastActiveTick 通过内部反射设置（模拟场景）
  if (overrides.lastActiveTick !== undefined) {
    // Agent 内部 _lastActiveTick 可通过 react() 更新，这里用类型断言直接设置
    (agent as unknown as { _lastActiveTick: number })._lastActiveTick = overrides.lastActiveTick;
  }

  return agent;
}

function createSpawner(): AgentSpawner {
  return new AgentSpawner();
}

function noopAddAgents(_agents: Agent[]): void {
  // 测试中不实际注册到 WorldEngine
}

describe('NaturalSelection', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // ── 构造和配置 ──

  describe('构造和配置', () => {
    it('应使用默认配置初始化', () => {
      const ns = new NaturalSelection();
      const config = ns.getConfig();
      expect(config.checkIntervalTicks).toBe(100);
      expect(config.credibilityThreshold).toBe(0.2);
      expect(config.inactivityTicks).toBe(50);
      expect(config.dormantDeathTicks).toBe(200);
      expect(config.targetPopulation).toBe(0);
    });

    it('应支持自定义配置', () => {
      const ns = new NaturalSelection({
        checkIntervalTicks: 50,
        credibilityThreshold: 0.3,
      });
      const config = ns.getConfig();
      expect(config.checkIntervalTicks).toBe(50);
      expect(config.credibilityThreshold).toBe(0.3);
      // 其余保持默认
      expect(config.inactivityTicks).toBe(50);
    });

    it('updateConfig 应部分更新配置', () => {
      const ns = new NaturalSelection();
      ns.updateConfig({ credibilityThreshold: 0.1 });
      expect(ns.getConfig().credibilityThreshold).toBe(0.1);
      expect(ns.getConfig().checkIntervalTicks).toBe(100); // 未修改的保持不变
    });
  });

  // ── shouldCheck ──

  describe('shouldCheck', () => {
    it('tick 为 0 时不应触发检查', () => {
      const ns = new NaturalSelection({ checkIntervalTicks: 100 });
      expect(ns.shouldCheck(0)).toBe(false);
    });

    it('tick 为间隔倍数时应触发检查', () => {
      const ns = new NaturalSelection({ checkIntervalTicks: 100 });
      expect(ns.shouldCheck(100)).toBe(true);
      expect(ns.shouldCheck(200)).toBe(true);
      expect(ns.shouldCheck(300)).toBe(true);
    });

    it('tick 非间隔倍数时不应触发检查', () => {
      const ns = new NaturalSelection({ checkIntervalTicks: 100 });
      expect(ns.shouldCheck(50)).toBe(false);
      expect(ns.shouldCheck(99)).toBe(false);
      expect(ns.shouldCheck(101)).toBe(false);
    });

    it('自定义间隔应正确工作', () => {
      const ns = new NaturalSelection({ checkIntervalTicks: 25 });
      expect(ns.shouldCheck(25)).toBe(true);
      expect(ns.shouldCheck(50)).toBe(true);
      expect(ns.shouldCheck(30)).toBe(false);
    });
  });

  // ── evaluate: 信誉淘汰 ──

  describe('evaluate - 信誉淘汰', () => {
    it('信誉低于阈值的 Agent 应被标记为 dormant', () => {
      const ns = new NaturalSelection({ credibilityThreshold: 0.2 });
      const agents = [
        createAgent({ id: 'a1', name: '高信誉', credibility: 0.8, lastActiveTick: 99 }),
        createAgent({ id: 'a2', name: '低信誉', credibility: 0.1, lastActiveTick: 99 }),
        createAgent({ id: 'a3', name: '边界值', credibility: 0.19, lastActiveTick: 99 }),
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.newDormant).toHaveLength(2);
      expect(result.newDormant.map(r => r.agentId)).toContain('a2');
      expect(result.newDormant.map(r => r.agentId)).toContain('a3');
      expect(result.newDormant.every(r => r.reason === 'low_credibility')).toBe(true);

      // 验证 Agent 状态确实被修改
      expect(agents[1].status).toBe('dormant');
      expect(agents[2].status).toBe('dormant');
      // 高信誉的保持 active
      expect(agents[0].status).toBe('active');
    });

    it('信誉恰好等于阈值的 Agent 不应被淘汰', () => {
      const ns = new NaturalSelection({ credibilityThreshold: 0.2 });
      const agents = [
        createAgent({ id: 'a1', credibility: 0.2, lastActiveTick: 99 }),
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.newDormant).toHaveLength(0);
      expect(agents[0].status).toBe('active');
    });
  });

  // ── evaluate: 不活跃淘汰 ──

  describe('evaluate - 不活跃淘汰', () => {
    it('超过 M 个 tick 未活跃的 Agent 应被标记为 dormant', () => {
      const ns = new NaturalSelection({ inactivityTicks: 50 });
      const agents = [
        createAgent({ id: 'a1', name: '活跃', credibility: 0.5, lastActiveTick: 80 }),
        createAgent({ id: 'a2', name: '不活跃', credibility: 0.5, lastActiveTick: 40 }),
        createAgent({ id: 'a3', name: '刚好超时', credibility: 0.5, lastActiveTick: 49 }),
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      // a2 (100-40=60 > 50) 和 a3 (100-49=51 > 50) 应被淘汰
      expect(result.newDormant).toHaveLength(2);
      expect(result.newDormant.map(r => r.agentId)).toContain('a2');
      expect(result.newDormant.map(r => r.agentId)).toContain('a3');
      expect(result.newDormant.every(r => r.reason === 'inactivity')).toBe(true);
    });

    it('刚好在不活跃阈值边界的 Agent 不应被淘汰', () => {
      const ns = new NaturalSelection({ inactivityTicks: 50 });
      const agents = [
        createAgent({ id: 'a1', credibility: 0.5, lastActiveTick: 50 }), // 100-50=50, not > 50
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.newDormant).toHaveLength(0);
    });
  });

  // ── evaluate: dormant → dead ──

  describe('evaluate - dormant 超时转为 dead', () => {
    it('dormant 超过指定 tick 数的 Agent 应被标记为 dead', () => {
      const ns = new NaturalSelection({ dormantDeathTicks: 200 });
      const agents = [
        createAgent({ id: 'a1', name: '老休眠', status: 'dormant', lastActiveTick: 50 }),
        createAgent({ id: 'a2', name: '新休眠', status: 'dormant', lastActiveTick: 250 }),
      ];
      const spawner = createSpawner();

      // tick=300: a1 休眠了 300-50=250 > 200, a2 休眠了 300-250=50 < 200
      const { result } = ns.evaluate(300, agents, spawner, noopAddAgents);

      expect(result.newDead).toHaveLength(1);
      expect(result.newDead[0].agentId).toBe('a1');
      expect(result.newDead[0].reason).toBe('dormant_timeout');
      expect(agents[0].status).toBe('dead');
      expect(agents[1].status).toBe('dormant'); // 保持 dormant
    });

    it('本轮刚标记为 dormant 的 Agent 不应立即死亡', () => {
      const ns = new NaturalSelection({
        credibilityThreshold: 0.2,
        dormantDeathTicks: 0, // 即使 dormantDeathTicks=0
      });
      const agents = [
        createAgent({ id: 'a1', credibility: 0.1, lastActiveTick: 100 }), // 将被标记为 dormant
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.newDormant).toHaveLength(1);
      expect(result.newDead).toHaveLength(0); // 不应立即死亡
      expect(agents[0].status).toBe('dormant');
    });
  });

  // ── evaluate: 种群补充 ──

  describe('evaluate - 种群补充', () => {
    it('当 targetPopulation > 0 且活跃数不足时应补充新 Agent', () => {
      const ns = new NaturalSelection({
        targetPopulation: 10,
        credibilityThreshold: 0.2,
      });
      const agents = [
        createAgent({ id: 'a1', credibility: 0.1, lastActiveTick: 99 }), // 将被淘汰 (low cred)
        createAgent({ id: 'a2', credibility: 0.5, lastActiveTick: 99 }),
        createAgent({ id: 'a3', credibility: 0.5, lastActiveTick: 99 }),
      ];
      const spawner = createSpawner();
      const addedAgents: Agent[] = [];

      const { result } = ns.evaluate(100, agents, spawner, (newAgents) => {
        addedAgents.push(...newAgents);
      });

      // a1 被淘汰后活跃数 = 2, 需补充 10-2=8
      expect(result.newSpawned).toHaveLength(8);
      expect(addedAgents).toHaveLength(8);
    });

    it('targetPopulation=0 时不应补充', () => {
      const ns = new NaturalSelection({
        targetPopulation: 0,
        credibilityThreshold: 0.2,
      });
      const agents = [
        createAgent({ id: 'a1', credibility: 0.1 }), // 被淘汰
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.newSpawned).toHaveLength(0);
    });

    it('活跃数已满足时不应补充', () => {
      const ns = new NaturalSelection({
        targetPopulation: 3,
      });
      const agents = [
        createAgent({ id: 'a1', credibility: 0.5, lastActiveTick: 99 }),
        createAgent({ id: 'a2', credibility: 0.5, lastActiveTick: 99 }),
        createAgent({ id: 'a3', credibility: 0.5, lastActiveTick: 99 }),
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.newSpawned).toHaveLength(0);
    });
  });

  // ── evaluate: 综合场景 ──

  describe('evaluate - 综合场景', () => {
    it('同时存在多种淘汰原因时应正确处理', () => {
      const ns = new NaturalSelection({
        credibilityThreshold: 0.2,
        inactivityTicks: 50,
        dormantDeathTicks: 200,
        targetPopulation: 5,
      });

      const agents = [
        createAgent({ id: 'healthy', credibility: 0.8, lastActiveTick: 295 }),
        createAgent({ id: 'low_cred', credibility: 0.1, lastActiveTick: 295 }),
        createAgent({ id: 'inactive', credibility: 0.5, lastActiveTick: 10 }),
        createAgent({ id: 'old_dormant', status: 'dormant', lastActiveTick: 50 }),
        createAgent({ id: 'already_dead', status: 'dead', lastActiveTick: 0 }),
      ];

      const spawner = createSpawner();
      const addedAgents: Agent[] = [];

      const { result } = ns.evaluate(300, agents, spawner, (newAgents) => {
        addedAgents.push(...newAgents);
      });

      // low_cred: dormant (low_credibility)
      // inactive: dormant (inactivity)
      expect(result.newDormant).toHaveLength(2);

      // old_dormant: 300-50=250 > 200 → dead
      expect(result.newDead).toHaveLength(1);
      expect(result.newDead[0].agentId).toBe('old_dormant');

      // 活跃: healthy (1个), 需补充 5-1=4
      expect(result.newSpawned).toHaveLength(4);
      expect(addedAgents).toHaveLength(4);
    });

    it('已经是 dead 状态的 Agent 不应被再次处理', () => {
      const ns = new NaturalSelection({ credibilityThreshold: 0.2 });
      const agents = [
        createAgent({ id: 'dead_agent', status: 'dead', credibility: 0.0 }),
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.newDormant).toHaveLength(0);
      expect(result.newDead).toHaveLength(0);
    });

    it('已经是 dormant 状态的 Agent 不应被信誉/活跃检查', () => {
      const ns = new NaturalSelection({
        credibilityThreshold: 0.2,
        inactivityTicks: 50,
        dormantDeathTicks: 999, // 很大，不会死
      });
      const agents = [
        createAgent({ id: 'dormant_agent', status: 'dormant', credibility: 0.1, lastActiveTick: 90 }),
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      // 不应出现在 newDormant（已经是 dormant）
      expect(result.newDormant).toHaveLength(0);
      // 也不应出现在 newDead（dormantDeathTicks 很大）
      expect(result.newDead).toHaveLength(0);
    });
  });

  // ── NaturalSelectionEvent ──

  describe('NaturalSelectionEvent 生成', () => {
    it('应生成正确格式的事件', () => {
      const ns = new NaturalSelection({ credibilityThreshold: 0.2 });
      const agents = [
        createAgent({ id: 'a1', name: '低信誉小明', credibility: 0.1, lastActiveTick: 99 }),
        createAgent({ id: 'a2', name: '正常小红', credibility: 0.5, lastActiveTick: 99 }),
      ];
      const spawner = createSpawner();

      const { event } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(event.type).toBe('system');
      expect(event.category).toBe('general');
      expect(event.source).toBe('natural-selection');
      expect(event.id).toBe('ns_100');
      expect(event.tick).toBe(100);
      expect(event.tags).toContain('natural-selection');
      expect(event.propagationRadius).toBe(0);
      expect(event.selectionResult).toBeDefined();
      expect(event.title).toContain('休眠 1');
      expect(event.content).toContain('低信誉小明');
    });

    it('无淘汰时也应生成事件', () => {
      const ns = new NaturalSelection();
      const agents = [
        createAgent({ id: 'a1', credibility: 0.8, lastActiveTick: 99 }),
      ];
      const spawner = createSpawner();

      const { event } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(event.title).toContain('休眠 0');
      expect(event.title).toContain('死亡 0');
      expect(event.importance).toBe(0.3); // 基础值
    });

    it('事件重要性应随淘汰数量增加', () => {
      const ns = new NaturalSelection({ credibilityThreshold: 0.2 });
      const agents = Array.from({ length: 10 }, (_, i) =>
        createAgent({ id: `a${i}`, credibility: 0.1, lastActiveTick: 99 }) // 全部低信誉
      );
      const spawner = createSpawner();

      const { event } = ns.evaluate(100, agents, spawner, noopAddAgents);

      // 10 个 dormant → importance = min(0.3 + 10*0.05, 0.8) = 0.8
      expect(event.importance).toBe(0.8);
    });
  });

  // ── 历史记录 ──

  describe('历史记录', () => {
    it('应记录每次检查结果', () => {
      const ns = new NaturalSelection();
      const spawner = createSpawner();

      ns.evaluate(100, [], spawner, noopAddAgents);
      ns.evaluate(200, [], spawner, noopAddAgents);
      ns.evaluate(300, [], spawner, noopAddAgents);

      expect(ns.getHistory()).toHaveLength(3);
      expect(ns.getHistory()[0].tick).toBe(100);
      expect(ns.getHistory()[2].tick).toBe(300);
    });

    it('getLastResult 应返回最近一次结果', () => {
      const ns = new NaturalSelection();
      const spawner = createSpawner();

      expect(ns.getLastResult()).toBeUndefined();

      ns.evaluate(100, [], spawner, noopAddAgents);
      expect(ns.getLastResult()?.tick).toBe(100);

      ns.evaluate(200, [], spawner, noopAddAgents);
      expect(ns.getLastResult()?.tick).toBe(200);
    });

    it('历史记录应限制在 100 条', () => {
      const ns = new NaturalSelection();
      const spawner = createSpawner();

      for (let i = 1; i <= 110; i++) {
        ns.evaluate(i * 100, [], spawner, noopAddAgents);
      }

      expect(ns.getHistory()).toHaveLength(100);
      expect(ns.getHistory()[0].tick).toBe(1100); // 前 10 条被丢弃
    });
  });

  // ── activeCountBefore / activeCountAfter ──

  describe('活跃数量统计', () => {
    it('应正确统计检查前后的活跃数量', () => {
      const ns = new NaturalSelection({
        credibilityThreshold: 0.2,
        targetPopulation: 0,
      });
      const agents = [
        createAgent({ id: 'a1', credibility: 0.8, lastActiveTick: 99 }),
        createAgent({ id: 'a2', credibility: 0.8, lastActiveTick: 99 }),
        createAgent({ id: 'a3', credibility: 0.1, lastActiveTick: 99 }), // 将被淘汰 (low cred)
        createAgent({ id: 'a4', status: 'dormant' }),
      ];
      const spawner = createSpawner();

      const { result } = ns.evaluate(100, agents, spawner, noopAddAgents);

      expect(result.activeCountBefore).toBe(3); // a1, a2, a3
      expect(result.activeCountAfter).toBe(2); // a1, a2
    });
  });
});
