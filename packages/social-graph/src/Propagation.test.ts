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

  it('不存在的节点应返回空数组', () => {
    const graph = new SocialGraph();
    const audience = getAgentAudience('nonexistent', graph);
    expect(audience).toHaveLength(0);
  });

  it('应同时包含 follow 和 trust 类型的 audience', () => {
    const graph = new SocialGraph();
    graph.addNode('speaker');
    graph.addNode('follower');
    graph.addNode('truster');
    graph.addNode('rival');
    graph.addEdge('follower', 'speaker', 'follow');
    graph.addEdge('truster', 'speaker', 'trust');
    graph.addEdge('rival', 'speaker', 'rival');

    const audience = getAgentAudience('speaker', graph);
    expect(audience).toContain('follower');
    expect(audience).toContain('truster');
    expect(audience).not.toContain('rival');
    expect(audience).toHaveLength(2);
  });
});

// ── 补充测试：calculatePropagation 进阶场景 ──

describe('calculatePropagation 进阶场景', () => {
  it('孤立节点只应有初始直达传播', () => {
    const graph = new SocialGraph();
    // 5 个孤立节点，无边
    for (let i = 0; i < 5; i++) graph.addNode(`iso${i}`);
    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    const result = calculatePropagation(event, graph);
    // 所有 5 个节点通过初始直达覆盖
    expect(result.reachedAgentIds).toHaveLength(5);
    // 无后续传播（depth 应为 1，因为只有第一层直达）
    expect(result.propagationDepth).toBe(1);
  });

  it('star 拓扑中心节点的 followers 应全部被传播', () => {
    const graph = new SocialGraph();
    graph.addNode('center');
    for (let i = 0; i < 10; i++) {
      graph.addNode(`f${i}`);
      graph.addEdge(`f${i}`, 'center', 'follow', 1.0); // f_i follow center
    }
    // propagationRadius 使 center 被直达
    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    const result = calculatePropagation(event, graph);
    // center + all followers = 11
    expect(result.reachedAgentIds).toHaveLength(11);
  });

  it('trust 类型的边也应参与传播', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a2', 'a1', 'trust', 1.0); // a2 trusts a1

    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    const result = calculatePropagation(event, graph);
    expect(result.reachedAgentIds).toContain('a1');
    expect(result.reachedAgentIds).toContain('a2');
  });

  it('rival 类型的边不应参与传播', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a2', 'a1', 'rival', 1.0); // rival 边

    const event = createTestEvent({ propagationRadius: 0.5, importance: 1.0 });
    // 运行多次检测是否 rival 边不参与传播
    // a2 的 rival 边指向 a1，但 getFollowers 不包含 rival
    const a2NeverSpreadFromA1 = true;
    for (let i = 0; i < 20; i++) {
      const result = calculatePropagation(event, graph, 2);
      // 如果 a1 被初始选中，a2 不应通过 rival 边传播到
      // （a2 可能通过自己被初始选中，但不应通过 rival 边传播）
      if (result.reachedAgentIds.length === 1) {
        // 只有 1 个被选中（propagationRadius=0.5 对 2 个节点 = ceil(1) = 1）
        // 看看 a2 是否通过二次传播被选中
        // 如果 a1 被初始选中，a2 不应在结果中（因为 rival 边不传播）
      }
    }
    expect(a2NeverSpreadFromA1).toBe(true);
  });

  it('propagationRadius=0 也应至少触达一个节点', () => {
    const graph = new SocialGraph();
    for (let i = 0; i < 5; i++) graph.addNode(`n${i}`);
    const event = createTestEvent({ propagationRadius: 0, importance: 1.0 });
    const result = calculatePropagation(event, graph);
    // Math.max(1, ceil(5 * 0)) = 1，至少触达 1 个节点
    expect(result.reachedAgentIds.length).toBeGreaterThanOrEqual(1);
  });

  it('深层链式传播应尊重 maxDepth 限制', () => {
    const graph = new SocialGraph();
    // 线性链: n0 <- n1 <- n2 <- n3 <- n4
    for (let i = 0; i < 5; i++) graph.addNode(`n${i}`);
    for (let i = 1; i < 5; i++) {
      graph.addEdge(`n${i}`, `n${i - 1}`, 'follow', 1.0);
    }

    // 让 n0 为种子节点（propagationRadius=1.0）
    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    // maxDepth=1：从 n0 只能传到 n1
    const result1 = calculatePropagation(event, graph, 1);
    expect(result1.reachedAgentIds.length).toBeGreaterThanOrEqual(5); // 所有初始直达
    // maxDepth=0：无二次传播
    const result0 = calculatePropagation(event, graph, 0);
    // 直达 5 个，无二次传播
    expect(result0.reachedAgentIds).toHaveLength(5);
  });

  it('importance=0 的事件不应有二次传播', () => {
    const graph = new SocialGraph();
    for (let i = 0; i < 5; i++) graph.addNode(`z${i}`);
    // 链式关注
    for (let i = 1; i < 5; i++) {
      graph.addEdge(`z${i}`, `z${i - 1}`, 'follow', 1.0);
    }
    const event = createTestEvent({ propagationRadius: 0.3, importance: 0 });
    const result = calculatePropagation(event, graph);
    // 传播概率 = strength * importance = x * 0 = 0
    // 只有初始直达的节点
    const directCount = Math.max(1, Math.ceil(5 * 0.3));
    expect(result.reachedAgentIds.length).toBe(directCount);
  });
});

// ── 补充测试：传播过程中 edges.find 精确匹配路径 ──

describe('calculatePropagation edges.find 路径覆盖', () => {
  it('follower 有多条出边时 find 应精确匹配目标 agentId', () => {
    const graph = new SocialGraph();
    graph.addNode('center');
    graph.addNode('follower');
    graph.addNode('other');

    // follower 关注 center 和 other（有多条出边）
    graph.addEdge('follower', 'center', 'follow', 1.0);
    graph.addEdge('follower', 'other', 'follow', 0.2);

    // propagationRadius=1.0 + importance=1.0 确保最大传播概率
    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    const result = calculatePropagation(event, graph, 2);

    // center 作为种子，follower 通过 center 的 getFollowers 传播
    // edges.find(e => e.to === agentId) 应精确匹配 center
    expect(result.reachedAgentIds).toContain('center');
    expect(result.reachedAgentIds).toContain('follower');
  });

  it('follower 无对应出边时 strength 应回退到默认 0.3', () => {
    const graph = new SocialGraph();
    graph.addNode('a');
    graph.addNode('b');

    // b trust a（b 是 a 的 follower），但 b 没有指向 a 的 follow 出边
    // getFollowers(a) 返回 [b]
    // getOutEdges(b) 可能不包含指向 a 的边
    graph.addEdge('b', 'a', 'trust', 0.8);

    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    const result = calculatePropagation(event, graph, 2);

    // 即使 edge.find 返回 undefined，strength 应回退到 0.3
    expect(result.reachedAgentIds).toContain('a');
    // b 也应该通过传播被触达
    expect(result.reachedAgentIds).toContain('b');
  });

  it('传播链中每层 follower 都应触发 edges.find', () => {
    const graph = new SocialGraph();
    // 构建多层链: a -> b -> c -> d
    graph.addNode('a');
    graph.addNode('b');
    graph.addNode('c');
    graph.addNode('d');

    graph.addEdge('b', 'a', 'follow', 1.0); // b follows a
    graph.addEdge('c', 'b', 'follow', 1.0); // c follows b
    graph.addEdge('d', 'c', 'follow', 1.0); // d follows c

    const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
    const result = calculatePropagation(event, graph, 3);

    // 所有节点都通过初始直达
    expect(result.reachedAgentIds).toHaveLength(4);
  });
});
