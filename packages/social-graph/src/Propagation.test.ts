// ============================================================================
// @beeclaw/social-graph Propagation 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SocialGraph } from './SocialGraph.js';
import { calculatePropagation, getAgentAudience } from './Propagation.js';
import type { WorldEvent } from '@beeclaw/shared';

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
    tags: ['金融'],
    ...overrides,
  };
}

describe('calculatePropagation', () => {
  it('空图应返回空结果', () => {
    const graph = new SocialGraph();
    const result = calculatePropagation(createTestEvent(), graph);
    expect(result.reachedAgentIds).toHaveLength(0);
    expect(result.propagationDepth).toBe(0);
  });

  it('单节点应至少触达一个', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    const result = calculatePropagation(createTestEvent(), graph);
    expect(result.reachedAgentIds).toHaveLength(1);
    expect(result.reachedAgentIds).toContain('a1');
  });

  it('propagationRadius=1 应直接触达所有节点', () => {
    const graph = new SocialGraph();
    for (let i = 0; i < 10; i++) graph.addNode(`a${i}`);
    const event = createTestEvent({ propagationRadius: 1.0 });
    const result = calculatePropagation(event, graph);
    expect(result.reachedAgentIds).toHaveLength(10);
  });

  it('触达的 Agent 应是去重的', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a2', 'a1', 'follow', 1.0);
    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    const result = calculatePropagation(event, graph);
    const uniqueIds = new Set(result.reachedAgentIds);
    expect(uniqueIds.size).toBe(result.reachedAgentIds.length);
  });

  it('propagationDepth 应大于 0 当有传播时', () => {
    const graph = new SocialGraph();
    for (let i = 0; i < 20; i++) graph.addNode(`a${i}`);
    // 创建链式关注关系：a1 -> a0, a2 -> a1, a3 -> a2 ...
    for (let i = 1; i < 20; i++) {
      graph.addEdge(`a${i}`, `a${i - 1}`, 'follow', 1.0);
    }
    const event = createTestEvent({ propagationRadius: 0.1, importance: 1.0 });
    const result = calculatePropagation(event, graph);
    expect(result.propagationDepth).toBeGreaterThanOrEqual(1);
  });

  it('maxDepth 参数应限制传播深度', () => {
    const graph = new SocialGraph();
    for (let i = 0; i < 5; i++) graph.addNode(`a${i}`);
    // 链式关注
    for (let i = 1; i < 5; i++) {
      graph.addEdge(`a${i}`, `a${i - 1}`, 'follow', 1.0);
    }
    const event = createTestEvent({ propagationRadius: 0.3, importance: 1.0 });
    const result = calculatePropagation(event, graph, 0);
    // maxDepth=0 时不应有二次传播
    expect(result.propagationDepth).toBeLessThanOrEqual(1);
  });

  it('低重要性事件传播范围应较小', () => {
    const graph = new SocialGraph();
    for (let i = 0; i < 20; i++) graph.addNode(`a${i}`);
    graph.initializeRandomRelations(
      Array.from({ length: 20 }, (_, i) => `a${i}`),
      3
    );

    // 多次运行取平均（因为有随机性）
    let totalReachedLow = 0;
    let totalReachedHigh = 0;
    const runs = 10;
    for (let r = 0; r < runs; r++) {
      const lowEvent = createTestEvent({ propagationRadius: 0.1, importance: 0.1 });
      const highEvent = createTestEvent({ propagationRadius: 0.9, importance: 0.9 });
      totalReachedLow += calculatePropagation(lowEvent, graph).reachedAgentIds.length;
      totalReachedHigh += calculatePropagation(highEvent, graph).reachedAgentIds.length;
    }
    // 高重要性高半径的平均触达应大于等于低的
    expect(totalReachedHigh / runs).toBeGreaterThanOrEqual(totalReachedLow / runs);
  });
});

describe('getAgentAudience', () => {
  it('应返回 followers 列表', () => {
    const graph = new SocialGraph();
    graph.addNode('speaker');
    graph.addNode('f1');
    graph.addNode('f2');
    graph.addEdge('f1', 'speaker', 'follow');
    graph.addEdge('f2', 'speaker', 'trust');

    const audience = getAgentAudience('speaker', graph);
    expect(audience).toContain('f1');
    expect(audience).toContain('f2');
    expect(audience).toHaveLength(2);
  });

  it('没有 follower 应返回空数组', () => {
    const graph = new SocialGraph();
    graph.addNode('lonely');
    const audience = getAgentAudience('lonely', graph);
    expect(audience).toHaveLength(0);
  });

  it('rival 类型的边不应作为 audience', () => {
    const graph = new SocialGraph();
    graph.addNode('speaker');
    graph.addNode('rival1');
    graph.addEdge('rival1', 'speaker', 'rival');

    const audience = getAgentAudience('speaker', graph);
    expect(audience).not.toContain('rival1');
    expect(audience).toHaveLength(0);
  });
});
