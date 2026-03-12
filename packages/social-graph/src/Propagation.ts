// ============================================================================
// Propagation — 信息传播算法
// ============================================================================

import type { WorldEvent } from '@beeclaw/shared';
import { SocialGraph } from './SocialGraph.js';

export interface PropagationResult {
  /** 能"看到"该事件的 Agent ID 列表 */
  reachedAgentIds: string[];
  /** 传播层级 */
  propagationDepth: number;
}

/**
 * 计算事件的传播范围
 *
 * 传播逻辑：
 * 1. 根据 propagationRadius 计算初始覆盖率（直接触达的节点比例）
 * 2. 从初始节点出发，沿 SocialGraph 的 follow/trust 边传播
 * 3. 最多传播 maxDepth 层
 */
export function calculatePropagation(
  event: WorldEvent,
  graph: SocialGraph,
  maxDepth: number = 2
): PropagationResult {
  const allNodes = graph.getAllNodes();
  if (allNodes.length === 0) {
    return { reachedAgentIds: [], propagationDepth: 0 };
  }

  const reached = new Set<string>();

  // 第一层：根据 propagationRadius 直接触达
  const directCount = Math.max(1, Math.ceil(allNodes.length * event.propagationRadius));
  const shuffled = [...allNodes].sort(() => Math.random() - 0.5);
  const directTargets = shuffled.slice(0, directCount);

  for (const node of directTargets) {
    reached.add(node.agentId);
  }

  // 后续层：沿社交网络传播
  let currentLayer = [...reached];
  let depth = 0;

  for (let d = 0; d < maxDepth; d++) {
    const nextLayer: string[] = [];

    for (const agentId of currentLayer) {
      // 获取 followers（入边） — 信息从被关注者传播到关注者
      const followers = graph.getFollowers(agentId);
      for (const followerId of followers) {
        if (!reached.has(followerId)) {
          // 传播概率与边的强度和事件重要性有关
          const edges = graph.getOutEdges(followerId);
          const edge = edges.find(e => e.to === agentId);
          const strength = edge?.strength ?? 0.3;
          const spreadProb = strength * event.importance;

          if (Math.random() < spreadProb) {
            reached.add(followerId);
            nextLayer.push(followerId);
          }
        }
      }
    }

    if (nextLayer.length === 0) break;
    currentLayer = nextLayer;
    depth = d + 1;
  }

  return {
    reachedAgentIds: [...reached],
    propagationDepth: depth + 1,
  };
}

/**
 * 获取某个 Agent 的 follower 列表（用于 Agent 发言后传播）
 */
export function getAgentAudience(agentId: string, graph: SocialGraph): string[] {
  return graph.getFollowers(agentId);
}
