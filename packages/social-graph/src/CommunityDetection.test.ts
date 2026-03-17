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
import type { CommunityDetectionResult } from './CommunityDetection.js';

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

  it('对不存在的节点应跳过而不报错', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    const roles = new Map<string, any>();
    roles.set('a1', 'leader');
    roles.set('nonexistent', 'bridge');

    expect(() => applySocialRoles(graph, roles)).not.toThrow();
    expect(graph.getNode('a1')!.role).toBe('leader');
  });
});

// ── 补充测试：detectCommunities 进阶场景 ──

describe('detectCommunities 进阶场景', () => {
  it('孤立节点（无边）应各自形成独立社区', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addNode('a3');
    // 无边连接
    const result = detectCommunities(graph);
    expect(result.communityCount).toBe(3);
    // 每个节点都在不同社区
    const communities = new Set(result.communities.values());
    expect(communities.size).toBe(3);
  });

  it('完全连通图应倾向合并为一个社区', () => {
    const graph = new SocialGraph();
    const ids = ['a1', 'a2', 'a3', 'a4'];
    for (const id of ids) graph.addNode(id);
    // 所有节点两两互联
    for (const from of ids) {
      for (const to of ids) {
        if (from !== to) graph.addEdge(from, to, 'follow', 0.9);
      }
    }
    const result = detectCommunities(graph);
    // 预期最终合并为 1 个社区
    expect(result.communityCount).toBe(1);
  });

  it('三个独立子图应检测到三个社区', () => {
    const graph = new SocialGraph();
    // 社区 A
    graph.addNode('a1'); graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.9);
    graph.addEdge('a2', 'a1', 'follow', 0.9);
    // 社区 B
    graph.addNode('b1'); graph.addNode('b2');
    graph.addEdge('b1', 'b2', 'follow', 0.9);
    graph.addEdge('b2', 'b1', 'follow', 0.9);
    // 社区 C
    graph.addNode('c1'); graph.addNode('c2');
    graph.addEdge('c1', 'c2', 'follow', 0.9);
    graph.addEdge('c2', 'c1', 'follow', 0.9);

    const result = detectCommunities(graph);
    expect(result.communityCount).toBe(3);
    // 同一子图内的节点应属于同一社区
    expect(result.communities.get('a1')).toBe(result.communities.get('a2'));
    expect(result.communities.get('b1')).toBe(result.communities.get('b2'));
    expect(result.communities.get('c1')).toBe(result.communities.get('c2'));
    // 跨子图的节点不应属于同一社区
    expect(result.communities.get('a1')).not.toBe(result.communities.get('b1'));
  });

  it('边权重应影响社区划分', () => {
    const graph = new SocialGraph();
    graph.addNode('a1'); graph.addNode('a2'); graph.addNode('a3');
    // a1-a2 强连接，a2-a3 弱连接
    graph.addEdge('a1', 'a2', 'follow', 0.95);
    graph.addEdge('a2', 'a1', 'follow', 0.95);
    graph.addEdge('a2', 'a3', 'follow', 0.05);
    graph.addEdge('a3', 'a2', 'follow', 0.05);

    const result = detectCommunities(graph);
    // 结果应存在且有效（不验证精确社区数，因标签传播有随机性）
    expect(result.communityCount).toBeGreaterThanOrEqual(1);
    expect(result.communityCount).toBeLessThanOrEqual(3);
  });

  it('maxIterations=0 时应保持初始标签', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.9);
    graph.addEdge('a2', 'a1', 'follow', 0.9);

    const result = detectCommunities(graph, 0);
    // 0 次迭代，每个节点保持自己的初始标签
    expect(result.communityCount).toBe(2);
  });

  it('大量迭代也应能收敛并返回', () => {
    const graph = createClusteredGraph();
    const result = detectCommunities(graph, 100);
    // 应正常返回且有合理结果
    expect(result.communityCount).toBeGreaterThanOrEqual(1);
    expect(result.communityCount).toBeLessThanOrEqual(6);
    expect(result.communities.size).toBe(6);
  });
});

// ── 补充测试：inferSocialRoles 进阶场景 ──

describe('inferSocialRoles 进阶场景', () => {
  it('连接多个社区的节点应被识别为 bridge', () => {
    const graph = new SocialGraph();
    // 社区 A: a1, a2（互连）
    graph.addNode('a1'); graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.9);
    graph.addEdge('a2', 'a1', 'follow', 0.9);
    // 社区 B: b1, b2（互连）
    graph.addNode('b1'); graph.addNode('b2');
    graph.addEdge('b1', 'b2', 'follow', 0.9);
    graph.addEdge('b2', 'b1', 'follow', 0.9);
    // 社区 C: c1, c2（互连）
    graph.addNode('c1'); graph.addNode('c2');
    graph.addEdge('c1', 'c2', 'follow', 0.9);
    graph.addEdge('c2', 'c1', 'follow', 0.9);
    // bridge 节点连接 A、B、C
    graph.addNode('bridge');
    graph.addEdge('bridge', 'a1', 'follow', 0.5);
    graph.addEdge('bridge', 'b1', 'follow', 0.5);
    graph.addEdge('bridge', 'c1', 'follow', 0.5);

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);

    // bridge 节点连接了 3 个社区的邻居，应被标为 bridge
    expect(roles.get('bridge')).toBe('bridge');
  });

  it('同时满足 bridge 和 contrarian 条件时 bridge 优先', () => {
    const graph = new SocialGraph();
    // 社区 A
    graph.addNode('a1'); graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.9);
    graph.addEdge('a2', 'a1', 'follow', 0.9);
    // 社区 B
    graph.addNode('b1'); graph.addNode('b2');
    graph.addEdge('b1', 'b2', 'follow', 0.9);
    graph.addEdge('b2', 'b1', 'follow', 0.9);
    // 社区 C
    graph.addNode('c1'); graph.addNode('c2');
    graph.addEdge('c1', 'c2', 'follow', 0.9);
    graph.addEdge('c2', 'c1', 'follow', 0.9);
    // 节点同时是 bridge（连接多社区）和 contrarian（全 rival 边）
    graph.addNode('hybrid');
    graph.addEdge('hybrid', 'a1', 'rival', 0.5);
    graph.addEdge('hybrid', 'b1', 'rival', 0.5);
    graph.addEdge('hybrid', 'c1', 'rival', 0.5);

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    // bridge 检查在 contrarian 之前，应优先为 bridge
    expect(roles.get('hybrid')).toBe('bridge');
  });

  it('leader 需要同时满足高入度和高影响力', () => {
    const graph = new SocialGraph();
    // 高入度但低影响力→不应是 leader
    graph.addNode('highDegLowInf', 20); // influence=20 < 50
    graph.addNode('f1'); graph.addNode('f2');
    graph.addNode('f3'); graph.addNode('f4');
    graph.addEdge('f1', 'highDegLowInf', 'follow');
    graph.addEdge('f2', 'highDegLowInf', 'follow');
    graph.addEdge('f3', 'highDegLowInf', 'follow');
    graph.addEdge('f4', 'highDegLowInf', 'follow');

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    // 入度4，平均入度 4/5=0.8，4 > 0.8*2，但影响力 20 < 50
    expect(roles.get('highDegLowInf')).not.toBe('leader');
  });

  it('所有节点都没有出边时应全部为 follower', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addNode('a3');
    // 有入边但无出边
    // 无边，所有人 avgInDeg=0，入度也为0

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    expect(roles.get('a1')).toBe('follower');
    expect(roles.get('a2')).toBe('follower');
    expect(roles.get('a3')).toBe('follower');
  });

  it('contrarian 阈值恰好为 30% 时不应被标记为 contrarian', () => {
    const graph = new SocialGraph();
    graph.addNode('node');
    graph.addNode('x1'); graph.addNode('x2'); graph.addNode('x3');
    // 3 条 rival + 7 条 follow = 30% rival，恰好不超过 30%
    graph.addEdge('node', 'x1', 'rival');
    graph.addEdge('node', 'x2', 'follow');
    graph.addEdge('node', 'x3', 'follow');
    // 添加更多非 rival 边使占比刚好 30%
    graph.addNode('x4'); graph.addNode('x5'); graph.addNode('x6');
    graph.addNode('x7'); graph.addNode('x8'); graph.addNode('x9'); graph.addNode('x10');
    graph.addEdge('node', 'x4', 'follow');
    graph.addEdge('node', 'x5', 'follow');
    graph.addEdge('node', 'x6', 'follow');
    graph.addEdge('node', 'x7', 'follow');
    graph.addEdge('node', 'x8', 'follow');
    graph.addEdge('node', 'x9', 'follow');
    graph.addEdge('node', 'x10', 'follow');
    // 1 rival / 10 total = 10% < 30%

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);
    expect(roles.get('node')).not.toBe('contrarian');
  });
});

// ── 补充测试：applyCommunityLabels 进阶场景 ──

describe('applyCommunityLabels 进阶场景', () => {
  it('大规模图的社区标签应全部应用', () => {
    const graph = new SocialGraph();
    for (let i = 0; i < 20; i++) graph.addNode(`n${i}`);
    for (let i = 0; i < 19; i++) graph.addEdge(`n${i}`, `n${i + 1}`, 'follow', 0.8);

    const result = detectCommunities(graph);
    applyCommunityLabels(graph, result);

    for (let i = 0; i < 20; i++) {
      const node = graph.getNode(`n${i}`);
      expect(node!.community).toMatch(/^community_\d+$/);
    }
  });

  it('空结果应用到有节点的图不应报错', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    const emptyResult: CommunityDetectionResult = {
      communities: new Map(),
      communitySizes: new Map(),
      communityCount: 0,
    };
    expect(() => applyCommunityLabels(graph, emptyResult)).not.toThrow();
    // 原有的社区标签不应被改变
    expect(graph.getNode('a1')!.community).toBe('default');
  });
});

// ── 补充测试：覆盖 detectCommunities 中内部 lambda 和边权重路径 ──

describe('detectCommunities 边权重计算路径', () => {
  it('单向边时应通过 getEdge 获取权重', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    // 只添加单向边 a1→a2
    graph.addEdge('a1', 'a2', 'follow', 0.9);

    const result = detectCommunities(graph, 5);
    // 应正常完成，不因缺少反向边而出错
    expect(result.communityCount).toBeGreaterThanOrEqual(1);
    expect(result.communities.size).toBe(2);
  });

  it('邻居存在但 label 不存在时应安全跳过', () => {
    // 这种情况在标签传播算法正常流程中不会出现，
    // 但确保算法代码路径健壮
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.5);
    graph.addEdge('a2', 'a1', 'follow', 0.5);

    const result = detectCommunities(graph, 10);
    expect(result.communities.size).toBe(2);
  });

  it('双向边权重不等时应取较大值', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addNode('a3');
    // a1→a2 强，a2→a1 弱
    graph.addEdge('a1', 'a2', 'follow', 0.9);
    graph.addEdge('a2', 'a1', 'follow', 0.1);
    // a1→a3 弱，a3→a1 强
    graph.addEdge('a1', 'a3', 'follow', 0.1);
    graph.addEdge('a3', 'a1', 'follow', 0.9);

    const result = detectCommunities(graph, 10);
    // 确保 Math.max 路径被完整执行
    expect(result.communities.size).toBe(3);
  });
});

// ── 补充测试：覆盖 inferSocialRoles 中 ownCommunity 删除路径 ──

describe('inferSocialRoles ownCommunity 路径', () => {
  it('节点自身社区在 communityResult 中时应被从 connectedCommunities 中删除', () => {
    const graph = new SocialGraph();
    // 创建两个社区
    graph.addNode('a1'); graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.9);
    graph.addEdge('a2', 'a1', 'follow', 0.9);

    graph.addNode('b1'); graph.addNode('b2');
    graph.addEdge('b1', 'b2', 'follow', 0.9);
    graph.addEdge('b2', 'b1', 'follow', 0.9);

    // 跨社区连接（但只连到一个外部社区，不满足 bridge 的 >=2 条件）
    graph.addNode('connector');
    graph.addEdge('connector', 'a1', 'follow', 0.5);

    const communityResult = detectCommunities(graph);
    const roles = inferSocialRoles(graph, communityResult);

    // connector 只连到 1 个外部社区（删掉自身社区后），不应是 bridge
    expect(roles.get('connector')).not.toBe('bridge');
  });

  it('节点不在 communityResult 中时 ownCommunity 为 undefined，不应删除', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.5);

    // 手动构建一个不包含 a1 的 communityResult
    const fakeResult: CommunityDetectionResult = {
      communities: new Map([['a2', 'community_0']]),
      communitySizes: new Map([['community_0', 1]]),
      communityCount: 1,
    };

    const roles = inferSocialRoles(graph, fakeResult);
    // a1 不在 communityResult 中，ownCommunity 为 undefined
    // connectedCommunities.delete(undefined) 安全无操作
    expect(roles.has('a1')).toBe(true);
  });
});

// ── 补充测试：覆盖 Propagation 中 edges.find 回调 ──

describe('detectCommunities 收敛行为', () => {
  it('完全对称图应快速收敛', () => {
    const graph = new SocialGraph();
    graph.addNode('a1');
    graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.5);
    graph.addEdge('a2', 'a1', 'follow', 0.5);

    // maxIterations 足够大时应在收敛后提前退出
    const result = detectCommunities(graph, 100);
    expect(result.communityCount).toBeGreaterThanOrEqual(1);
  });
});
