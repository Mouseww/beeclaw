// ============================================================================
// BeeClaw Benchmark — SocialGraph 传播算法性能
// 测试大规模节点下的图构建、传播计算和社区发现性能
// ============================================================================

import { bench, describe } from 'vitest';
import { SocialGraph, calculatePropagation, detectCommunities } from '@beeclaw/social-graph';
import type { WorldEvent, RelationType } from '@beeclaw/shared';

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function createTestEvent(tick: number): WorldEvent {
  return {
    id: `evt_bench_${tick}`,
    type: 'external',
    category: 'finance',
    title: '央行降息',
    content: '央行宣布降息 25 个基点',
    source: 'benchmark',
    importance: 0.8,
    propagationRadius: 0.6,
    tick,
    tags: ['金融'],
  };
}

function buildGraph(nodeCount: number, maxFollow: number): SocialGraph {
  const graph = new SocialGraph();
  const ids: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const id = `node_${i}`;
    ids.push(id);
    graph.addNode(id);
  }
  graph.initializeRandomRelations(ids, maxFollow);
  return graph;
}

function buildDenseGraph(nodeCount: number, edgesPerNode: number): SocialGraph {
  const graph = new SocialGraph();
  const ids: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const id = `node_${i}`;
    ids.push(id);
    graph.addNode(id);
  }

  const types: RelationType[] = ['follow', 'trust', 'rival', 'neutral'];
  for (let i = 0; i < nodeCount; i++) {
    for (let e = 0; e < edgesPerNode; e++) {
      const target = Math.floor(Math.random() * nodeCount);
      if (target !== i) {
        graph.addEdge(ids[i], ids[target], types[e % 4], Math.random());
      }
    }
  }
  return graph;
}

// ── 图构建性能 ─────────────────────────────────────────────────────────────────

describe('SocialGraph — 图构建', () => {
  bench(
    '500 节点 + 随机关系 (maxFollow=5)',
    () => {
      buildGraph(500, 5);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '1000 节点 + 随机关系 (maxFollow=10)',
    () => {
      buildGraph(1000, 10);
    },
    { iterations: 30, warmupIterations: 3 },
  );

  bench(
    '5000 节点 + 随机关系 (maxFollow=5)',
    () => {
      buildGraph(5000, 5);
    },
    { iterations: 10, warmupIterations: 2 },
  );

  bench(
    '1000 节点 + 密集关系 (20 edges/node)',
    () => {
      buildDenseGraph(1000, 20);
    },
    { iterations: 20, warmupIterations: 3 },
  );
});

// ── 传播算法性能 ───────────────────────────────────────────────────────────────

describe('SocialGraph — calculatePropagation', () => {
  const graphs = {
    small: buildGraph(500, 5),
    medium: buildGraph(1000, 10),
    large: buildGraph(5000, 5),
    dense: buildDenseGraph(1000, 20),
  };

  bench(
    '500 节点稀疏图 — 传播计算',
    () => {
      calculatePropagation(createTestEvent(1), graphs.small, 3);
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    '1000 节点中等图 — 传播计算',
    () => {
      calculatePropagation(createTestEvent(1), graphs.medium, 3);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '5000 节点稀疏图 — 传播计算',
    () => {
      calculatePropagation(createTestEvent(1), graphs.large, 3);
    },
    { iterations: 20, warmupIterations: 3 },
  );

  bench(
    '1000 节点密集图 — 传播计算',
    () => {
      calculatePropagation(createTestEvent(1), graphs.dense, 3);
    },
    { iterations: 30, warmupIterations: 5 },
  );
});

// ── 社区发现性能 ───────────────────────────────────────────────────────────────

describe('SocialGraph — detectCommunities', () => {
  const graphs = {
    small: buildGraph(500, 5),
    medium: buildGraph(1000, 10),
    large: buildGraph(5000, 5),
  };

  bench(
    '500 节点 — 社区发现 (20 iterations)',
    () => {
      detectCommunities(graphs.small, 20);
    },
    { iterations: 30, warmupIterations: 3 },
  );

  bench(
    '1000 节点 — 社区发现 (20 iterations)',
    () => {
      detectCommunities(graphs.medium, 20);
    },
    { iterations: 15, warmupIterations: 2 },
  );

  bench(
    '5000 节点 — 社区发现 (10 iterations)',
    () => {
      detectCommunities(graphs.large, 10);
    },
    { iterations: 5, warmupIterations: 1 },
  );
});

// ── 图查询性能 ─────────────────────────────────────────────────────────────────

describe('SocialGraph — 图查询操作', () => {
  const graph = buildGraph(1000, 10);
  const nodeIds = graph.getAllNodes().map((n) => n.agentId);

  bench(
    '1000 节点 — getFollowers (随机节点)',
    () => {
      const id = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      graph.getFollowers(id);
    },
    { iterations: 1000, warmupIterations: 50 },
  );

  bench(
    '1000 节点 — getNeighbors (随机节点)',
    () => {
      const id = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      graph.getNeighbors(id);
    },
    { iterations: 1000, warmupIterations: 50 },
  );

  bench(
    '1000 节点 — getStats',
    () => {
      graph.getStats();
    },
    { iterations: 100, warmupIterations: 10 },
  );
});
