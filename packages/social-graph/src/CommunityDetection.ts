// ============================================================================
// CommunityDetection — 简单社区发现算法
// 基于标签传播（Label Propagation）的社区检测
// ============================================================================

import type { SocialRole } from '@beeclaw/shared';
import { SocialGraph } from './SocialGraph.js';

/**
 * 社区发现结果
 */
export interface CommunityDetectionResult {
  /** 社区映射: agentId -> communityId */
  communities: Map<string, string>;
  /** 各社区大小 */
  communitySizes: Map<string, number>;
  /** 检测到的社区数量 */
  communityCount: number;
}

/**
 * 使用标签传播算法进行社区发现
 *
 * 算法：
 * 1. 每个节点初始化为自己的社区
 * 2. 每轮遍历所有节点，将其社区标签更新为邻居中出现最多的标签
 * 3. 重复直到收敛或达到最大迭代次数
 */
export function detectCommunities(
  graph: SocialGraph,
  maxIterations: number = 20
): CommunityDetectionResult {
  const allNodes = graph.getAllNodes();
  if (allNodes.length === 0) {
    return { communities: new Map(), communitySizes: new Map(), communityCount: 0 };
  }

  // 初始化：每个节点是自己的社区
  const labels = new Map<string, string>();
  for (const node of allNodes) {
    labels.set(node.agentId, node.agentId);
  }

  // 迭代标签传播
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // 随机打乱遍历顺序
    const shuffledNodes = [...allNodes].sort(() => Math.random() - 0.5);

    for (const node of shuffledNodes) {
      const neighbors = graph.getNeighbors(node.agentId);
      if (neighbors.length === 0) continue;

      // 统计邻居的标签频率（加权：边强度）
      const labelCounts = new Map<string, number>();
      for (const neighborId of neighbors) {
        const label = labels.get(neighborId);
        if (!label) continue;

        // 获取边强度作为权重
        const outEdge = graph.getEdge(node.agentId, neighborId);
        const inEdge = graph.getEdge(neighborId, node.agentId);
        const weight = Math.max(outEdge?.strength ?? 0, inEdge?.strength ?? 0);

        labelCounts.set(label, (labelCounts.get(label) ?? 0) + weight);
      }

      // 选择出现最多的标签
      let maxCount = 0;
      let maxLabel = labels.get(node.agentId)!;
      for (const [label, count] of labelCounts) {
        if (count > maxCount) {
          maxCount = count;
          maxLabel = label;
        }
      }

      const oldLabel = labels.get(node.agentId);
      if (oldLabel !== maxLabel) {
        labels.set(node.agentId, maxLabel);
        changed = true;
      }
    }

    if (!changed) break; // 收敛
  }

  // 规范化社区 ID（用数字命名）
  const labelToId = new Map<string, string>();
  let communityIndex = 0;
  const communities = new Map<string, string>();

  for (const [agentId, label] of labels) {
    if (!labelToId.has(label)) {
      labelToId.set(label, `community_${communityIndex++}`);
    }
    communities.set(agentId, labelToId.get(label)!);
  }

  // 计算每个社区的大小
  const communitySizes = new Map<string, number>();
  for (const communityId of communities.values()) {
    communitySizes.set(communityId, (communitySizes.get(communityId) ?? 0) + 1);
  }

  return {
    communities,
    communitySizes,
    communityCount: labelToId.size,
  };
}

/**
 * 根据社区发现结果更新 SocialGraph 中节点的社区标签
 */
export function applyCommunityLabels(graph: SocialGraph, result: CommunityDetectionResult): void {
  for (const [agentId, communityId] of result.communities) {
    graph.updateCommunity(agentId, communityId);
  }
}

/**
 * 根据连接模式推断节点的社交角色
 *
 * - leader: 入边多（被很多人关注），影响力高
 * - bridge: 连接多个不同社区的节点
 * - contrarian: 有较多 rival 类型的关系
 * - follower: 默认角色
 */
export function inferSocialRoles(
  graph: SocialGraph,
  communityResult: CommunityDetectionResult
): Map<string, SocialRole> {
  const roles = new Map<string, SocialRole>();
  const allNodes = graph.getAllNodes();

  // 计算平均入度
  let totalInDegree = 0;
  const inDegrees = new Map<string, number>();
  for (const node of allNodes) {
    const inDegree = graph.getInEdges(node.agentId).length;
    inDegrees.set(node.agentId, inDegree);
    totalInDegree += inDegree;
  }
  const avgInDegree = allNodes.length > 0 ? totalInDegree / allNodes.length : 0;

  for (const node of allNodes) {
    const inDegree = inDegrees.get(node.agentId) ?? 0;
    const outEdges = graph.getOutEdges(node.agentId);

    // 检查是否是 bridge（连接到 2+ 不同社区的节点）
    const connectedCommunities = new Set<string>();
    const neighbors = graph.getNeighbors(node.agentId);
    for (const nId of neighbors) {
      const community = communityResult.communities.get(nId);
      if (community) connectedCommunities.add(community);
    }
    const ownCommunity = communityResult.communities.get(node.agentId);
    if (ownCommunity) connectedCommunities.delete(ownCommunity);

    if (connectedCommunities.size >= 2) {
      roles.set(node.agentId, 'bridge');
      continue;
    }

    // 检查是否是 contrarian（rival 边占比 > 30%）
    const rivalEdges = outEdges.filter(e => e.type === 'rival').length;
    if (outEdges.length > 0 && rivalEdges / outEdges.length > 0.3) {
      roles.set(node.agentId, 'contrarian');
      continue;
    }

    // 检查是否是 leader（入度高于平均 2x 且影响力 > 50）
    if (inDegree > avgInDegree * 2 && node.influence > 50) {
      roles.set(node.agentId, 'leader');
      continue;
    }

    roles.set(node.agentId, 'follower');
  }

  return roles;
}

/**
 * 根据推断结果更新 SocialGraph 节点角色
 */
export function applySocialRoles(graph: SocialGraph, roles: Map<string, SocialRole>): void {
  for (const [agentId, role] of roles) {
    graph.updateRole(agentId, role);
  }
}
