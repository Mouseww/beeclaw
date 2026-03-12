// ============================================================================
// @beeclaw/social-graph SocialGraph 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SocialGraph } from './SocialGraph.js';

describe('SocialGraph', () => {
  // ── 节点操作 ──

  describe('节点操作', () => {
    it('addNode 应添加节点', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      expect(graph.hasNode('a1')).toBe(true);
      expect(graph.getNodeCount()).toBe(1);
    });

    it('addNode 应使用默认值', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      const node = graph.getNode('a1');
      expect(node).toBeDefined();
      expect(node!.influence).toBe(10);
      expect(node!.community).toBe('default');
      expect(node!.role).toBe('follower');
    });

    it('addNode 应使用自定义参数', () => {
      const graph = new SocialGraph();
      graph.addNode('a1', 50, 'community_0', 'leader');
      const node = graph.getNode('a1');
      expect(node!.influence).toBe(50);
      expect(node!.community).toBe('community_0');
      expect(node!.role).toBe('leader');
    });

    it('getNode 不存在的节点应返回 undefined', () => {
      const graph = new SocialGraph();
      expect(graph.getNode('nonexistent')).toBeUndefined();
    });

    it('removeNode 应删除节点及相关边', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2');
      graph.addEdge('a2', 'a1');

      graph.removeNode('a1');
      expect(graph.hasNode('a1')).toBe(false);
      expect(graph.getNodeCount()).toBe(1);
      // a2 -> a1 的边也应被移除
      expect(graph.getOutEdges('a2')).toHaveLength(0);
    });

    it('getAllNodes 应返回所有节点', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addNode('a3');
      expect(graph.getAllNodes()).toHaveLength(3);
    });

    it('hasNode 不存在的节点应返回 false', () => {
      const graph = new SocialGraph();
      expect(graph.hasNode('none')).toBe(false);
    });
  });

  // ── 边操作 ──

  describe('边操作', () => {
    it('addEdge 应添加边', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2', 'follow', 0.8, 5);

      const edge = graph.getEdge('a1', 'a2');
      expect(edge).toBeDefined();
      expect(edge!.type).toBe('follow');
      expect(edge!.strength).toBe(0.8);
      expect(edge!.formedAtTick).toBe(5);
    });

    it('addEdge 重复边应更新属性', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2', 'follow', 0.5);
      graph.addEdge('a1', 'a2', 'trust', 0.9);

      const edge = graph.getEdge('a1', 'a2');
      expect(edge!.type).toBe('trust');
      expect(edge!.strength).toBe(0.9);
      expect(graph.getEdgeCount()).toBe(1); // 不增加新边
    });

    it('addEdge 默认值', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2');

      const edge = graph.getEdge('a1', 'a2');
      expect(edge!.type).toBe('follow');
      expect(edge!.strength).toBe(0.5);
      expect(edge!.formedAtTick).toBe(0);
    });

    it('removeEdge 应删除边', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2');
      graph.removeEdge('a1', 'a2');

      expect(graph.getEdge('a1', 'a2')).toBeUndefined();
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('getOutEdges 应返回出边', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addNode('a3');
      graph.addEdge('a1', 'a2');
      graph.addEdge('a1', 'a3');

      const outEdges = graph.getOutEdges('a1');
      expect(outEdges).toHaveLength(2);
    });

    it('getInEdges 应返回入边', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addNode('a3');
      graph.addEdge('a2', 'a1');
      graph.addEdge('a3', 'a1');

      const inEdges = graph.getInEdges('a1');
      expect(inEdges).toHaveLength(2);
    });

    it('getEdge 不存在的边应返回 undefined', () => {
      const graph = new SocialGraph();
      expect(graph.getEdge('a1', 'a2')).toBeUndefined();
    });

    it('getEdgeCount 应正确计数', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addNode('a3');
      graph.addEdge('a1', 'a2');
      graph.addEdge('a2', 'a3');
      graph.addEdge('a3', 'a1');
      expect(graph.getEdgeCount()).toBe(3);
    });

    it('getAllEdges 应返回所有边', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2');
      graph.addEdge('a2', 'a1');
      expect(graph.getAllEdges()).toHaveLength(2);
    });
  });

  // ── 社交关系 ──

  describe('社交关系', () => {
    it('getFollowers 应返回 follow/trust 类型的入边来源', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addNode('a3');
      graph.addNode('a4');
      graph.addEdge('a2', 'a1', 'follow');
      graph.addEdge('a3', 'a1', 'trust');
      graph.addEdge('a4', 'a1', 'rival');

      const followers = graph.getFollowers('a1');
      expect(followers).toContain('a2');
      expect(followers).toContain('a3');
      expect(followers).not.toContain('a4'); // rival 不算 follower
      expect(followers).toHaveLength(2);
    });

    it('getFollowing 应返回 follow/trust 类型的出边目标', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addNode('a3');
      graph.addEdge('a1', 'a2', 'follow');
      graph.addEdge('a1', 'a3', 'rival');

      const following = graph.getFollowing('a1');
      expect(following).toContain('a2');
      expect(following).not.toContain('a3');
      expect(following).toHaveLength(1);
    });

    it('getNeighbors 应返回双向邻居（去重）', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addNode('a3');
      graph.addEdge('a1', 'a2'); // 出边
      graph.addEdge('a3', 'a1'); // 入边

      const neighbors = graph.getNeighbors('a1');
      expect(neighbors).toContain('a2');
      expect(neighbors).toContain('a3');
      expect(neighbors).toHaveLength(2);
    });

    it('getNeighbors 双向边不应重复', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2');
      graph.addEdge('a2', 'a1');

      const neighbors = graph.getNeighbors('a1');
      expect(neighbors).toHaveLength(1);
      expect(neighbors).toContain('a2');
    });
  });

  // ── 更新方法 ──

  describe('更新方法', () => {
    it('updateCommunity 应更新社区标签', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.updateCommunity('a1', 'community_5');
      expect(graph.getNode('a1')!.community).toBe('community_5');
    });

    it('updateInfluence 应更新影响力', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.updateInfluence('a1', 80);
      expect(graph.getNode('a1')!.influence).toBe(80);
    });

    it('updateRole 应更新角色', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.updateRole('a1', 'leader');
      expect(graph.getNode('a1')!.role).toBe('leader');
    });

    it('更新不存在的节点不应报错', () => {
      const graph = new SocialGraph();
      expect(() => graph.updateCommunity('none', 'c1')).not.toThrow();
      expect(() => graph.updateInfluence('none', 50)).not.toThrow();
      expect(() => graph.updateRole('none', 'leader')).not.toThrow();
    });
  });

  // ── initializeRandomRelations ──

  describe('initializeRandomRelations', () => {
    it('应为每个节点创建至少一条边', () => {
      const graph = new SocialGraph();
      const ids = ['a1', 'a2', 'a3', 'a4', 'a5'];
      for (const id of ids) graph.addNode(id);
      graph.initializeRandomRelations(ids, 3);

      for (const id of ids) {
        const outEdges = graph.getOutEdges(id);
        expect(outEdges.length).toBeGreaterThanOrEqual(1);
        expect(outEdges.length).toBeLessThanOrEqual(3);
      }
    });

    it('不应创建自环', () => {
      const graph = new SocialGraph();
      const ids = ['a1', 'a2', 'a3'];
      for (const id of ids) graph.addNode(id);
      graph.initializeRandomRelations(ids, 5);

      for (const id of ids) {
        const selfEdge = graph.getEdge(id, id);
        expect(selfEdge).toBeUndefined();
      }
    });

    it('单个节点不应创建边', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.initializeRandomRelations(['a1'], 5);
      expect(graph.getEdgeCount()).toBe(0);
    });
  });

  // ── toData ──

  describe('toData', () => {
    it('应导出完整的图数据', () => {
      const graph = new SocialGraph();
      graph.addNode('a1');
      graph.addNode('a2');
      graph.addEdge('a1', 'a2', 'follow', 0.7, 1);

      const data = graph.toData();
      expect(data.nodes).toHaveLength(2);
      expect(data.edges).toHaveLength(1);
      expect(data.edges[0]!.from).toBe('a1');
      expect(data.edges[0]!.to).toBe('a2');
    });

    it('空图应返回空数据', () => {
      const graph = new SocialGraph();
      const data = graph.toData();
      expect(data.nodes).toHaveLength(0);
      expect(data.edges).toHaveLength(0);
    });
  });
});
