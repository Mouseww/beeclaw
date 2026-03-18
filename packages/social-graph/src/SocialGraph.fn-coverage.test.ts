// ============================================================================
// SocialGraph 函数覆盖率补充测试
// 覆盖 V8 未触达的内部回调/箭头函数
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SocialGraph } from './SocialGraph.js';

describe('SocialGraph 函数覆盖率补充', () => {
  describe('addNode 当 edges 已存在时的分支', () => {
    it('addNode 对已有 edges 的节点应更新节点信息但不重置 edges', () => {
      const graph = new SocialGraph();
      // 先通过 addEdge 创建 edges 条目（不通过 addNode）
      graph.addEdge('a1', 'a2', 'follow', 0.5);
      expect(graph.getEdge('a1', 'a2')).toBeDefined();

      // 再 addNode a1 — edges.has(a1) 应为 true
      graph.addNode('a1', 30, 'community_1', 'leader');
      expect(graph.getNode('a1')).toBeDefined();
      expect(graph.getNode('a1')!.influence).toBe(30);
      // 原有的边不应丢失
      expect(graph.getEdge('a1', 'a2')).toBeDefined();
    });
  });

  describe('getNeighbors 入边内部迭代器覆盖', () => {
    it('入边遍历应覆盖嵌套 for-of 循环中的匹配和不匹配分支', () => {
      const graph = new SocialGraph();
      graph.addNode('center');
      graph.addNode('n1');
      graph.addNode('n2');
      graph.addNode('n3');

      // n1 -> center (匹配)
      graph.addEdge('n1', 'center', 'follow', 0.8);
      // n2 -> n3 (不匹配 center)
      graph.addEdge('n2', 'n3', 'follow', 0.6);
      // n3 -> center (匹配)
      graph.addEdge('n3', 'center', 'trust', 0.7);

      const neighbors = graph.getNeighbors('center');
      expect(neighbors).toContain('n1');
      expect(neighbors).toContain('n3');
      expect(neighbors).not.toContain('n2');
    });
  });

  describe('removeNode 入边清理迭代器', () => {
    it('removeNode 应遍历所有 edges map 并找到指向被删节点的边', () => {
      const graph = new SocialGraph();
      graph.addNode('target');
      graph.addNode('src1');
      graph.addNode('src2');
      graph.addNode('src3');

      // src1 有两条出边：一条指向 target，一条指向 src2
      graph.addEdge('src1', 'target', 'follow', 0.5);
      graph.addEdge('src1', 'src2', 'follow', 0.4);
      // src2 没有指向 target 的边
      graph.addEdge('src2', 'src3', 'follow', 0.3);
      // src3 指向 target
      graph.addEdge('src3', 'target', 'trust', 0.6);

      graph.removeNode('target');

      // src1 应只剩 src1->src2 的边
      expect(graph.getOutEdges('src1')).toHaveLength(1);
      expect(graph.getEdge('src1', 'src2')).toBeDefined();
      // src2 的边不应受影响
      expect(graph.getOutEdges('src2')).toHaveLength(1);
      // src3 应没有 target 边了
      expect(graph.getOutEdges('src3')).toHaveLength(0);
    });
  });

  describe('getEdgeCount 内部迭代器', () => {
    it('应正确累加多个节点的出边', () => {
      const graph = new SocialGraph();
      graph.addNode('a');
      graph.addNode('b');
      graph.addNode('c');
      graph.addEdge('a', 'b', 'follow', 0.5);
      graph.addEdge('a', 'c', 'follow', 0.6);
      graph.addEdge('b', 'c', 'trust', 0.7);

      expect(graph.getEdgeCount()).toBe(3);
    });
  });

  describe('getInEdges 内部迭代器', () => {
    it('有多个来源的入边时应全部找到', () => {
      const graph = new SocialGraph();
      graph.addNode('hub');
      graph.addNode('s1');
      graph.addNode('s2');
      graph.addNode('s3');

      graph.addEdge('s1', 'hub', 'follow', 0.5);
      graph.addEdge('s2', 'hub', 'trust', 0.6);
      graph.addEdge('s3', 'hub', 'rival', 0.4);
      // s1 还有一条不指向 hub 的边
      graph.addEdge('s1', 's2', 'follow', 0.3);

      const inEdges = graph.getInEdges('hub');
      expect(inEdges).toHaveLength(3);
      expect(inEdges.map(e => e.from).sort()).toEqual(['s1', 's2', 's3']);
    });
  });

  describe('getAllEdges 内部迭代器', () => {
    it('应返回所有节点的所有边', () => {
      const graph = new SocialGraph();
      graph.addNode('x');
      graph.addNode('y');
      graph.addNode('z');
      graph.addEdge('x', 'y');
      graph.addEdge('x', 'z');
      graph.addEdge('y', 'z');

      const allEdges = graph.getAllEdges();
      expect(allEdges).toHaveLength(3);
    });
  });

  describe('toData 内部迭代器', () => {
    it('toData 的边收集应覆盖所有 edges map 条目', () => {
      const graph = new SocialGraph();
      graph.addNode('a');
      graph.addNode('b');
      graph.addNode('c');
      graph.addEdge('a', 'b');
      graph.addEdge('b', 'c');

      const data = graph.toData();
      expect(data.nodes).toHaveLength(3);
      expect(data.edges).toHaveLength(2);
    });
  });

  describe('getStats 社区集合收集', () => {
    it('有多个不同社区时应全部收集', () => {
      const graph = new SocialGraph();
      graph.addNode('a', 10, 'alpha');
      graph.addNode('b', 10, 'beta');
      graph.addNode('c', 10, 'gamma');

      const stats = graph.getStats();
      expect(stats.communities).toHaveLength(3);
      expect(stats.communities.sort()).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('initializeRandomRelations 内部回调', () => {
    it('给定多个 agent 时应触发 filter 和 sort 回调', () => {
      const graph = new SocialGraph();
      const ids = ['a', 'b', 'c', 'd', 'e'];
      for (const id of ids) graph.addNode(id);

      graph.initializeRandomRelations(ids, 3, 5);

      // 验证每个节点都有出边且 formedAtTick = 5
      for (const id of ids) {
        const edges = graph.getOutEdges(id);
        expect(edges.length).toBeGreaterThanOrEqual(1);
        for (const e of edges) {
          expect(e.formedAtTick).toBe(5);
          expect(e.from).toBe(id);
          expect(e.to).not.toBe(id); // 无自环
        }
      }
    });
  });
});
