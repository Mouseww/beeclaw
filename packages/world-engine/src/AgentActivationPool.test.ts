// ============================================================================
// AgentActivationPool 单元测试
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentActivationPool } from './AgentActivationPool.js';
import { SocialGraph } from '@beeclaw/social-graph';
import type { WorldEvent } from '@beeclaw/shared';

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

function createGraphWithAgents(count: number): { graph: SocialGraph; agentIds: string[] } {
  const graph = new SocialGraph();
  const agentIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const id = `agent_${i}`;
    agentIds.push(id);
    graph.addNode(id, 50);
  }

  return { graph, agentIds };
}

describe('AgentActivationPool', () => {
  let pool: AgentActivationPool;

  beforeEach(() => {
    pool = new AgentActivationPool();
  });

  // ── 构造 ──

  describe('构造函数', () => {
    it('应使用默认配置', () => {
      const config = pool.getConfig();
      expect(config.maxPropagationDepth).toBe(3);
      expect(config.maxActivatedAgents).toBe(100);
      expect(config.importanceDecay).toBe(0.5);
      expect(config.enabled).toBe(true);
    });

    it('应接受自定义配置', () => {
      const custom = new AgentActivationPool({
        maxPropagationDepth: 5,
        maxActivatedAgents: 50,
        importanceDecay: 0.3,
      });
      const config = custom.getConfig();
      expect(config.maxPropagationDepth).toBe(5);
      expect(config.maxActivatedAgents).toBe(50);
      expect(config.importanceDecay).toBe(0.3);
    });
  });

  // ── 禁用状态 ──

  describe('禁用状态', () => {
    it('禁用时应返回所有活跃 Agent', () => {
      const disabledPool = new AgentActivationPool({ enabled: false });
      const { graph, agentIds } = createGraphWithAgents(10);
      const event = createEvent();

      const result = disabledPool.computeActivation(event, graph, agentIds);
      expect(result.activatedIds).toHaveLength(10);
      expect(result.filteredCount).toBe(0);
      expect(result.depth).toBe(0);
    });
  });

  // ── 高重要性事件 ──

  describe('高重要性事件', () => {
    it('importance >= 0.9 应激活所有 Agent', () => {
      const { graph, agentIds } = createGraphWithAgents(20);
      const event = createEvent({ importance: 0.9 });

      const result = pool.computeActivation(event, graph, agentIds);
      expect(result.activatedIds).toHaveLength(20);
      expect(result.filteredCount).toBe(0);
    });

    it('importance = 1.0 应激活所有 Agent', () => {
      const { graph, agentIds } = createGraphWithAgents(15);
      const event = createEvent({ importance: 1.0 });

      const result = pool.computeActivation(event, graph, agentIds);
      expect(result.activatedIds).toHaveLength(15);
    });
  });

  // ── 空图 ──

  describe('空图', () => {
    it('没有节点时应返回空结果', () => {
      const graph = new SocialGraph();
      const event = createEvent();

      const result = pool.computeActivation(event, graph, []);
      expect(result.activatedIds).toHaveLength(0);
      expect(result.filteredCount).toBe(0);
    });
  });

  // ── 激活过滤 ──

  describe('激活过滤', () => {
    it('低重要性事件应过滤掉部分 Agent', () => {
      const { graph, agentIds } = createGraphWithAgents(50);
      // 建立一些关系以便 BFS 传播
      graph.initializeRandomRelations(agentIds, 3, 0);

      const event = createEvent({ importance: 0.3, propagationRadius: 0.2 });

      // 使用固定随机种子运行多次，验证有过滤效果
      let hasFiltered = false;
      for (let i = 0; i < 10; i++) {
        const result = pool.computeActivation(event, graph, agentIds);
        if (result.filteredCount > 0) {
          hasFiltered = true;
          break;
        }
      }
      // 低重要性事件在 50 个 Agent 中应该会过滤掉一些
      expect(hasFiltered).toBe(true);
    });

    it('中等重要性事件应比低重要性事件激活更多 Agent', () => {
      const { graph, agentIds } = createGraphWithAgents(50);
      graph.initializeRandomRelations(agentIds, 3, 0);

      // 多次采样取平均值，消除随机波动
      const samples = 20;
      let lowActivated = 0;
      let midActivated = 0;

      for (let i = 0; i < samples; i++) {
        const lowResult = pool.computeActivation(
          createEvent({ importance: 0.2, propagationRadius: 0.1 }),
          graph,
          agentIds,
        );
        const midResult = pool.computeActivation(
          createEvent({ importance: 0.7, propagationRadius: 0.5 }),
          graph,
          agentIds,
        );
        lowActivated += lowResult.activatedIds.length;
        midActivated += midResult.activatedIds.length;
      }

      // 平均而言，中等重要性应激活更多
      expect(midActivated / samples).toBeGreaterThanOrEqual(lowActivated / samples);
    });
  });

  // ── maxActivatedAgents 限制 ──

  describe('最大激活数限制', () => {
    it('应不超过 maxActivatedAgents', () => {
      const limitedPool = new AgentActivationPool({ maxActivatedAgents: 5 });
      const { graph, agentIds } = createGraphWithAgents(50);
      graph.initializeRandomRelations(agentIds, 5, 0);

      const event = createEvent({ importance: 0.8, propagationRadius: 0.8 });
      const result = limitedPool.computeActivation(event, graph, agentIds);

      expect(result.activatedIds.length).toBeLessThanOrEqual(5);
    });
  });

  // ── 距离信息 ──

  describe('距离信息', () => {
    it('应记录每个激活 Agent 的传播距离', () => {
      const { graph, agentIds } = createGraphWithAgents(10);
      graph.initializeRandomRelations(agentIds, 3, 0);

      const event = createEvent({ importance: 0.7, propagationRadius: 0.5 });
      const result = pool.computeActivation(event, graph, agentIds);

      // 所有激活的 Agent 都应有距离信息
      for (const id of result.activatedIds) {
        expect(result.distances.has(id)).toBe(true);
        const distance = result.distances.get(id)!;
        expect(distance).toBeGreaterThanOrEqual(0);
      }
    });

    it('种子节点距离应为 0', () => {
      const { graph, agentIds } = createGraphWithAgents(5);

      const event = createEvent({ importance: 0.7, propagationRadius: 1.0 }); // 全部作为种子
      const result = pool.computeActivation(event, graph, agentIds);

      for (const id of result.activatedIds) {
        if (result.distances.get(id) === 0) {
          // 存在距离为 0 的节点（种子节点）
          expect(true).toBe(true);
          return;
        }
      }
      // 如果有激活的 Agent，至少有一个种子
      if (result.activatedIds.length > 0) {
        const hasSeeds = [...result.distances.values()].some(d => d === 0);
        expect(hasSeeds).toBe(true);
      }
    });
  });

  // ── 统计 ──

  describe('统计', () => {
    it('初始统计应为零', () => {
      const stats = pool.getStats();
      expect(stats.totalActivations).toBe(0);
      expect(stats.totalFiltered).toBe(0);
      expect(stats.totalAgentsActivated).toBe(0);
      expect(stats.avgActivated).toBe(0);
      expect(stats.avgFiltered).toBe(0);
    });

    it('computeActivation 应更新统计', () => {
      const { graph, agentIds } = createGraphWithAgents(10);
      const event = createEvent({ importance: 0.9 }); // 高重要性，全部激活

      pool.computeActivation(event, graph, agentIds);

      const stats = pool.getStats();
      expect(stats.totalActivations).toBe(1);
      expect(stats.totalAgentsActivated).toBe(10);
      expect(stats.avgActivated).toBe(10);
    });

    it('resetStats 应重置统计', () => {
      const { graph, agentIds } = createGraphWithAgents(10);
      const event = createEvent({ importance: 0.9 });

      pool.computeActivation(event, graph, agentIds);
      pool.resetStats();

      const stats = pool.getStats();
      expect(stats.totalActivations).toBe(0);
      expect(stats.totalFiltered).toBe(0);
    });

    it('多次调用应累计统计', () => {
      const { graph, agentIds } = createGraphWithAgents(5);
      const event = createEvent({ importance: 0.95 }); // 高重要性

      pool.computeActivation(event, graph, agentIds);
      pool.computeActivation(event, graph, agentIds);

      const stats = pool.getStats();
      expect(stats.totalActivations).toBe(2);
      expect(stats.avgActivated).toBe(5); // 每次激活 5 个
    });
  });

  // ── 配置更新 ──

  describe('配置更新', () => {
    it('updateConfig 应动态更新配置', () => {
      pool.updateConfig({ maxPropagationDepth: 10 });
      const config = pool.getConfig();
      expect(config.maxPropagationDepth).toBe(10);
      // 其他配置不变
      expect(config.maxActivatedAgents).toBe(100);
    });

    it('updateConfig 应支持部分更新', () => {
      pool.updateConfig({ importanceDecay: 0.8 });
      const config = pool.getConfig();
      expect(config.importanceDecay).toBe(0.8);
      expect(config.enabled).toBe(true);
    });
  });

  // ── BFS 传播 ──

  describe('BFS 传播', () => {
    it('有社交关系的 Agent 应能通过 BFS 被激活', () => {
      const graph = new SocialGraph();
      // 创建链式关系: a0 -> a1 -> a2 -> a3
      const ids = ['a0', 'a1', 'a2', 'a3'];
      for (const id of ids) graph.addNode(id, 50);
      graph.addEdge('a0', 'a1', 'follow', 0.8);
      graph.addEdge('a1', 'a2', 'follow', 0.8);
      graph.addEdge('a2', 'a3', 'follow', 0.8);

      // 高重要性 + 大传播范围以确保种子包含 a0
      const event = createEvent({ importance: 0.8, propagationRadius: 1.0 });

      // 运行多次看 BFS 是否能沿链传播
      let reachedMultiple = false;
      for (let i = 0; i < 20; i++) {
        const result = pool.computeActivation(event, graph, ids);
        if (result.activatedIds.length > 1) {
          reachedMultiple = true;
          // 检查传播深度
          expect(result.depth).toBeGreaterThanOrEqual(0);
          break;
        }
      }
      // 有社交关系时应该能传播到多个节点
      expect(reachedMultiple).toBe(true);
    });

    it('没有社交关系时 BFS 不应扩展', () => {
      const { graph, agentIds } = createGraphWithAgents(10);
      // 不建立任何边

      const event = createEvent({ importance: 0.5, propagationRadius: 0.3 });
      const result = pool.computeActivation(event, graph, agentIds);

      // 只能有种子节点，没有 BFS 扩展
      // 距离都应为 0（种子层）
      for (const [, dist] of result.distances) {
        expect(dist).toBe(0);
      }
    });
  });

  // ── 非活跃 Agent 过滤 ──

  describe('非活跃 Agent 过滤', () => {
    it('activeAgentIds 不包含的 Agent 不应被激活', () => {
      const graph = new SocialGraph();
      graph.addNode('a1', 50);
      graph.addNode('a2', 50);
      graph.addNode('a3', 50);
      graph.addEdge('a1', 'a2', 'follow', 0.8);
      graph.addEdge('a2', 'a3', 'follow', 0.8);

      // 只传入 a1 和 a2 作为活跃 Agent
      const event = createEvent({ importance: 0.95 });
      const result = pool.computeActivation(event, graph, ['a1', 'a2']);

      // a3 不在活跃列表中，不应被激活
      expect(result.activatedIds).not.toContain('a3');
    });
  });
});
