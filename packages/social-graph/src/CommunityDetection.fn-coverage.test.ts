// ============================================================================
// CommunityDetection + Propagation 函数覆盖率补充测试
// 覆盖 V8 未触达的内部回调（sort/filter/map/find 等匿名函数）
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SocialGraph } from './SocialGraph.js';
import {
  detectCommunities,
  applyCommunityLabels,
  inferSocialRoles,
  applySocialRoles,
} from './CommunityDetection.js';
import { calculatePropagation, getAgentAudience } from './Propagation.js';
import type { WorldEvent } from '@beeclaw/shared';

function createTestEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 'evt_test',
    type: 'external',
    category: 'finance',
    title: '测试事件',
    content: '测试内容',
    source: 'manual',
    importance: 0.7,
    propagationRadius: 0.5,
    tick: 5,
    tags: ['金融'],
    ...overrides,
  };
}

describe('CommunityDetection 函数覆盖率补充', () => {
  describe('detectCommunities — sort 回调', () => {
    it('shuffledNodes sort 回调应被多次执行', () => {
      const graph = new SocialGraph();
      for (let i = 0; i < 10; i++) graph.addNode(`n${i}`);
      for (let i = 0; i < 9; i++) {
        graph.addEdge(`n${i}`, `n${i + 1}`, 'follow', 0.8);
        graph.addEdge(`n${i + 1}`, `n${i}`, 'follow', 0.8);
      }

      const result = detectCommunities(graph, 5);
      expect(result.communityCount).toBeGreaterThanOrEqual(1);
      expect(result.communities.size).toBe(10);
    });
  });

  describe('detectCommunities — labelCounts 计算', () => {
    it('应触发 labelCounts Map 操作中的 get 回退路径', () => {
      const graph = new SocialGraph();
      graph.addNode('a');
      graph.addNode('b');
      graph.addNode('c');
      // a-b 双向强连接，b-c 双向弱连接
      graph.addEdge('a', 'b', 'follow', 0.9);
      graph.addEdge('b', 'a', 'follow', 0.9);
      graph.addEdge('b', 'c', 'follow', 0.1);
      graph.addEdge('c', 'b', 'follow', 0.1);

      const result = detectCommunities(graph, 10);
      expect(result.communities.size).toBe(3);

      // 所有节点都应有 community ID
      for (const [, communityId] of result.communities) {
        expect(communityId).toMatch(/^community_\d+$/);
      }
    });
  });

  describe('detectCommunities — 社区大小计算迭代器', () => {
    it('社区大小应正确累加', () => {
      const graph = new SocialGraph();
      // 两组强连接
      for (let i = 0; i < 3; i++) graph.addNode(`g1_${i}`);
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          graph.addEdge(`g1_${i}`, `g1_${j}`, 'follow', 0.9);
          graph.addEdge(`g1_${j}`, `g1_${i}`, 'follow', 0.9);
        }
      }
      for (let i = 0; i < 2; i++) graph.addNode(`g2_${i}`);
      graph.addEdge('g2_0', 'g2_1', 'follow', 0.9);
      graph.addEdge('g2_1', 'g2_0', 'follow', 0.9);

      const result = detectCommunities(graph);
      let total = 0;
      for (const size of result.communitySizes.values()) {
        total += size;
      }
      expect(total).toBe(5);
    });
  });

  describe('inferSocialRoles — outEdges filter 回调', () => {
    it('应触发 rivalEdges filter 中的 e.type === rival 判断', () => {
      const graph = new SocialGraph();
      graph.addNode('mixed');
      graph.addNode('peer1');
      graph.addNode('peer2');
      graph.addNode('peer3');
      graph.addNode('peer4');

      // 2 rival + 2 follow = 50% > 30%
      graph.addEdge('mixed', 'peer1', 'rival');
      graph.addEdge('mixed', 'peer2', 'rival');
      graph.addEdge('mixed', 'peer3', 'follow');
      graph.addEdge('mixed', 'peer4', 'follow');

      const communityResult = detectCommunities(graph);
      const roles = inferSocialRoles(graph, communityResult);
      // 50% rival > 30%，应为 contrarian（除非 bridge 优先）
      const role = roles.get('mixed');
      expect(['contrarian', 'bridge']).toContain(role);
    });
  });

  describe('inferSocialRoles — inDegrees 计算迭代器', () => {
    it('应正确计算每个节点的入度', () => {
      const graph = new SocialGraph();
      graph.addNode('popular', 60);
      graph.addNode('f1');
      graph.addNode('f2');
      graph.addNode('f3');

      graph.addEdge('f1', 'popular', 'follow');
      graph.addEdge('f2', 'popular', 'follow');
      graph.addEdge('f3', 'popular', 'follow');

      const communityResult = detectCommunities(graph);
      const roles = inferSocialRoles(graph, communityResult);
      // popular 入度 3，平均入度 3/4 = 0.75，3 > 0.75*2 和 influence=60 > 50
      expect(roles.get('popular')).toBe('leader');
    });
  });

  describe('applyCommunityLabels — 迭代器覆盖', () => {
    it('应对多个节点执行 updateCommunity', () => {
      const graph = new SocialGraph();
      for (let i = 0; i < 5; i++) graph.addNode(`n${i}`);
      for (let i = 0; i < 4; i++) {
        graph.addEdge(`n${i}`, `n${i + 1}`, 'follow', 0.8);
      }

      const result = detectCommunities(graph);
      applyCommunityLabels(graph, result);

      for (let i = 0; i < 5; i++) {
        const node = graph.getNode(`n${i}`);
        expect(node!.community).toMatch(/^community_/);
      }
    });
  });

  describe('applySocialRoles — 迭代器覆盖', () => {
    it('应对多个节点执行 updateRole', () => {
      const graph = new SocialGraph();
      graph.addNode('a');
      graph.addNode('b');
      graph.addNode('c');

      const roles = new Map<string, 'leader' | 'follower' | 'bridge' | 'contrarian'>();
      roles.set('a', 'leader');
      roles.set('b', 'contrarian');
      roles.set('c', 'follower');

      applySocialRoles(graph, roles);
      expect(graph.getNode('a')!.role).toBe('leader');
      expect(graph.getNode('b')!.role).toBe('contrarian');
      expect(graph.getNode('c')!.role).toBe('follower');
    });
  });
});

describe('Propagation 函数覆盖率补充', () => {
  describe('calculatePropagation — sort/slice 回调', () => {
    it('shuffled sort 回调应被执行（多节点场景）', () => {
      const graph = new SocialGraph();
      for (let i = 0; i < 15; i++) graph.addNode(`n${i}`);
      for (let i = 0; i < 14; i++) {
        graph.addEdge(`n${i + 1}`, `n${i}`, 'follow', 0.9);
      }

      const event = createTestEvent({ propagationRadius: 0.5, importance: 0.8 });
      const result = calculatePropagation(event, graph, 3);

      expect(result.reachedAgentIds.length).toBeGreaterThan(0);
      expect(result.propagationDepth).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calculatePropagation — edges.find 回调', () => {
    it('follower 有多条出边时 find(e => e.to === agentId) 应精确匹配', () => {
      const graph = new SocialGraph();
      graph.addNode('source');
      graph.addNode('follower');
      graph.addNode('other1');
      graph.addNode('other2');

      // follower 关注 source + other1 + other2
      graph.addEdge('follower', 'source', 'follow', 0.9);
      graph.addEdge('follower', 'other1', 'follow', 0.3);
      graph.addEdge('follower', 'other2', 'follow', 0.2);

      const event = createTestEvent({ propagationRadius: 1.0, importance: 1.0 });
      const result = calculatePropagation(event, graph, 2);

      // 所有 4 个节点通过初始直达被覆盖
      expect(result.reachedAgentIds.length).toBe(4);
    });
  });

  describe('calculatePropagation — 传播循环空 nextLayer 退出', () => {
    it('无 followers 时传播循环应立即退出', () => {
      const graph = new SocialGraph();
      // 5 个孤立节点
      for (let i = 0; i < 5; i++) graph.addNode(`iso${i}`);

      const event = createTestEvent({ propagationRadius: 0.3, importance: 0.5 });
      const result = calculatePropagation(event, graph, 5);

      // 初始直达 Math.max(1, ceil(5*0.3)) = 2 个
      const expectedDirect = Math.max(1, Math.ceil(5 * 0.3));
      expect(result.reachedAgentIds.length).toBe(expectedDirect);
    });
  });

  describe('getAgentAudience — getFollowers 内部 filter/map', () => {
    it('应过滤 rival 类型并映射为 from IDs', () => {
      const graph = new SocialGraph();
      graph.addNode('speaker');
      graph.addNode('f1');
      graph.addNode('f2');
      graph.addNode('r1');

      graph.addEdge('f1', 'speaker', 'follow', 0.8);
      graph.addEdge('f2', 'speaker', 'trust', 0.7);
      graph.addEdge('r1', 'speaker', 'rival', 0.9);

      const audience = getAgentAudience('speaker', graph);
      expect(audience).toHaveLength(2);
      expect(audience).toContain('f1');
      expect(audience).toContain('f2');
      expect(audience).not.toContain('r1');
    });
  });
});
