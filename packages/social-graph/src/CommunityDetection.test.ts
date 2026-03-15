// ============================================================================
// @beeclaw/social-graph CommunityDetection 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SocialGraph } from './SocialGraph.js';
import {
  detectCommunities,
  applyCommunityLabels,
  inferSocialRoles,
  applySocialRoles,
} from './CommunityDetection.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function createClusteredGraph(): SocialGraph {
  const graph = new SocialGraph();
  // 社区 A: a1, a2, a3（互相连接）
  graph.addNode('a1');
  graph.addNode('a2');
  graph.addNode('a3');
  graph.addEdge('a1', 'a2', 'follow', 0.9);
  graph.addEdge('a2', 'a1', 'follow', 0.9);
  graph.addEdge('a1', 'a3', 'follow', 0.8);
  graph.addEdge('a3', 'a1', 'follow', 0.8);
  graph.addEdge('a2', 'a3', 'follow', 0.7);
  graph.addEdge('a3', 'a2', 'follow', 0.7);

  // 社区 B: b1, b2, b3（互相连接）
  graph.addNode('b1');
  graph.addNode('b2');
  graph.addNode('b3');
  graph.addEdge('b1', 'b2', 'follow', 0.9);
  graph.addEdge('b2', 'b1', 'follow', 0.9);
  graph.addEdge('b1', 'b3', 'follow', 0.8);
  graph.addEdge('b3', 'b1', 'follow', 0.8);
  graph.addEdge('b2', 'b3', 'follow', 0.7);
  graph.addEdge('b3', 'b2', 'follow', 0.7);

  return graph;
}

describe('detectCommunities', () => {
  it('空图应返回空结果', () => {
    const graph = new SocialGraph();
    const result = detectCommunities(graph);
    expect(result.communityCount).toBe(0);
    expect(result.communities.size).toBe(0);
    expect(result.communitySizes.size).toBe(0);
  });

  it('单节点应形成一个社区', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    const result = detectCommunities(graph);
    expect(result.communityCount).toBe(1);
    expect(result.communities.get('a1')).toBeDefined();
  });

  it('每个节点都应有社区标签', () => {
    const graph = createClusteredGraph();
    const result = detectCommunities(graph);
    expect(result.communities.size).toBe(6);
    for (const nodeId of ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) {
      expect(result.communities.has(nodeId)).toBe(true);
    }
  });

  it('社区大小总和应等于节点数', () => {
    const graph = createClusteredGraph();
    const result = detectCommunities(graph);
    let totalSize = 0;
    for (const size of result.communitySizes.values()) {
      totalSize += size;
    }
    expect(totalSize).toBe(6);
  });

  it('社区 ID 应以 community_ 前缀', () => {
    const graph = createClusteredGraph();
    const result = detectCommunities(graph);
    for (const communityId of result.communities.values()) {
      expect(communityId).toMatch(/^community_\d+$/);
    }
  });

  it('连通且密集连接的子图应倾向同一社区', () => {
    const graph = createClusteredGraph();
    const result = detectCommunities(graph);
    // 社区 A 内的节点应该在同一社区
    const communityA1 = result.communities.get('a1');
    const communityA2 = result.communities.get('a2');
    const communityA3 = result.communities.get('a3');
    expect(communityA1).toBe(communityA2);
    expect(communityA2).toBe(communityA3);
  });

  it('maxIterations 参数应被支持', () => {
    const graph = createClusteredGraph();
    const result = detectCommunities(graph, 1);
    expect(result.communityCount).toBeGreaterThan(0);
  });
});

describe('applyCommunityLabels', () => {
  it('应将社区标签应用到图节点上', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a1', 'a2');

    const result = detectCommunities(graph);
    applyCommunityLabels(graph, result);

    const node1 = graph.getNode('a1');
    const node2 = graph.getNode('a2');
    expect(node1!.community).toMatch(/^community_/);
    expect(node2!.community).toMatch(/^community_/);
  });
});

describe('inferSocialRoles', () => {
  it('高入度高影响力的节点应被识别为 leader', () => {
    const graph = new SocialGraph();
    graph.addNode('leader', 60);
    graph.addNode('f1');
    graph.addNode('f2');
    graph.addNode('f3');
    graph.addNode('f4');
    graph.addNode('f5');

    // 5 个节点都关注 leader（平均入度 = 5/6 ≈ 0.83，leader 入度 = 5 > 0.83*2）
    for (const id of ['f1', 'f2', 'f3', 'f4', 'f5']) {
      graph.addEdge(id, 'leader', 'follow');
    }

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    expect(roles.get('leader')).toBe('leader');
  });

  it('有大量 rival 边的节点应被识别为 contrarian', () => {
    const graph = new SocialGraph();
    graph.addNode('contrarian');
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addNode('a3');

    // contrarian 有 3 条 rival 边，占比 100% > 30%
    graph.addEdge('contrarian', 'a1', 'rival');
    graph.addEdge('contrarian', 'a2', 'rival');
    graph.addEdge('contrarian', 'a3', 'rival');

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    expect(roles.get('contrarian')).toBe('contrarian');
  });

  it('普通节点应被识别为 follower', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow');

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    // a1 和 a2 都应该是 follower（入度低，无 rival 边）
    expect(roles.get('a1')).toBe('follower');
  });

  it('空图应返回空角色映射', () => {
    const graph = new SocialGraph();
    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    expect(roles.size).toBe(0);
  });
});

describe('applySocialRoles', () => {
  it('应将角色应用到图节点上', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');

    const roles = new Map<string, any>();
    roles.set('a1', 'leader');
    roles.set('a2', 'contrarian');

    applySocialRoles(graph, roles);
    expect(graph.getNode('a1')!.role).toBe('leader');
    expect(graph.getNode('a2')!.role).toBe('contrarian');
  });
});
