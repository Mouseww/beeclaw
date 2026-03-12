// ============================================================================
// SocialGraph — 社交网络图结构
// ============================================================================

import type { SocialNode, SocialEdge, SocialRole, RelationType } from '@beeclaw/shared';

export class SocialGraph {
  private nodes: Map<string, SocialNode> = new Map();
  private edges: Map<string, SocialEdge[]> = new Map(); // key = agentId, value = 出边列表

  /**
   * 添加节点
   */
  addNode(agentId: string, influence: number = 10, community: string = 'default', role: SocialRole = 'follower'): void {
    this.nodes.set(agentId, { agentId, influence, community, role });
    if (!this.edges.has(agentId)) {
      this.edges.set(agentId, []);
    }
  }

  /**
   * 移除节点及其所有边
   */
  removeNode(agentId: string): void {
    this.nodes.delete(agentId);
    this.edges.delete(agentId);
    // 移除指向该节点的边
    for (const [, edgeList] of this.edges) {
      const idx = edgeList.findIndex(e => e.to === agentId);
      if (idx >= 0) edgeList.splice(idx, 1);
    }
  }

  /**
   * 获取节点
   */
  getNode(agentId: string): SocialNode | undefined {
    return this.nodes.get(agentId);
  }

  /**
   * 获取所有节点
   */
  getAllNodes(): SocialNode[] {
    return [...this.nodes.values()];
  }

  /**
   * 添加边（关系）
   */
  addEdge(from: string, to: string, type: RelationType = 'follow', strength: number = 0.5, tick: number = 0): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, []);
    }

    // 避免重复边
    const existing = this.edges.get(from)!;
    const existingEdge = existing.find(e => e.to === to);
    if (existingEdge) {
      existingEdge.type = type;
      existingEdge.strength = strength;
      return;
    }

    existing.push({ from, to, type, strength, formedAtTick: tick });
  }

  /**
   * 移除边
   */
  removeEdge(from: string, to: string): void {
    const edgeList = this.edges.get(from);
    if (edgeList) {
      const idx = edgeList.findIndex(e => e.to === to);
      if (idx >= 0) edgeList.splice(idx, 1);
    }
  }

  /**
   * 获取某节点的所有出边（关注/信任的人）
   */
  getOutEdges(agentId: string): SocialEdge[] {
    return this.edges.get(agentId) ?? [];
  }

  /**
   * 获取某节点的所有入边（被谁关注/信任）
   */
  getInEdges(agentId: string): SocialEdge[] {
    const result: SocialEdge[] = [];
    for (const [, edgeList] of this.edges) {
      for (const edge of edgeList) {
        if (edge.to === agentId) {
          result.push(edge);
        }
      }
    }
    return result;
  }

  /**
   * 获取某节点的 followers（入边中 type=follow 或 type=trust）
   */
  getFollowers(agentId: string): string[] {
    return this.getInEdges(agentId)
      .filter(e => e.type === 'follow' || e.type === 'trust')
      .map(e => e.from);
  }

  /**
   * 获取某节点关注的人（出边中 type=follow 或 type=trust）
   */
  getFollowing(agentId: string): string[] {
    return this.getOutEdges(agentId)
      .filter(e => e.type === 'follow' || e.type === 'trust')
      .map(e => e.to);
  }

  /**
   * 获取节点数量
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * 获取边数量
   */
  getEdgeCount(): number {
    let count = 0;
    for (const [, edgeList] of this.edges) {
      count += edgeList.length;
    }
    return count;
  }

  /**
   * 判断节点是否存在
   */
  hasNode(agentId: string): boolean {
    return this.nodes.has(agentId);
  }

  /**
   * 获取特定边
   */
  getEdge(from: string, to: string): SocialEdge | undefined {
    const edgeList = this.edges.get(from) ?? [];
    return edgeList.find(e => e.to === to);
  }

  /**
   * 获取某 Agent 的邻居（一跳可达，双向）
   */
  getNeighbors(agentId: string): string[] {
    const neighbors = new Set<string>();
    // 出边目标
    for (const edge of this.edges.get(agentId) ?? []) {
      neighbors.add(edge.to);
    }
    // 入边来源
    for (const [, edgeList] of this.edges) {
      for (const edge of edgeList) {
        if (edge.to === agentId) {
          neighbors.add(edge.from);
        }
      }
    }
    return Array.from(neighbors);
  }

  /**
   * 更新节点所属社区
   */
  updateCommunity(agentId: string, community: string): void {
    const node = this.nodes.get(agentId);
    if (node) {
      node.community = community;
    }
  }

  /**
   * 获取所有边
   */
  getAllEdges(): SocialEdge[] {
    const result: SocialEdge[] = [];
    for (const [, edgeList] of this.edges) {
      result.push(...edgeList);
    }
    return result;
  }

  /**
   * 更新节点影响力
   */
  updateInfluence(agentId: string, influence: number): void {
    const node = this.nodes.get(agentId);
    if (node) {
      node.influence = influence;
    }
  }

  /**
   * 更新节点社交角色
   */
  updateRole(agentId: string, role: SocialRole): void {
    const node = this.nodes.get(agentId);
    if (node) {
      node.role = role;
    }
  }

  /**
   * 初始化随机社交关系
   * 每个 Agent 随机关注 1~maxFollowCount 个其他 Agent
   */
  initializeRandomRelations(agentIds: string[], maxFollowCount: number = 5, tick: number = 0): void {
    for (const agentId of agentIds) {
      const others = agentIds.filter(id => id !== agentId);
      const followCount = Math.min(
        Math.floor(Math.random() * maxFollowCount) + 1,
        others.length
      );
      const shuffled = [...others].sort(() => Math.random() - 0.5);
      const toFollow = shuffled.slice(0, followCount);

      for (const targetId of toFollow) {
        const strength = Math.random() * 0.6 + 0.2; // 0.2 ~ 0.8
        this.addEdge(agentId, targetId, 'follow', strength, tick);
      }
    }
  }

  /**
   * 获取图的统计信息
   */
  getStats(): { nodeCount: number; edgeCount: number; avgDegree: number; communities: string[] } {
    const nodeCount = this.getNodeCount();
    const edgeCount = this.getEdgeCount();
    const avgDegree = nodeCount > 0 ? edgeCount / nodeCount : 0;

    const communitySet = new Set<string>();
    for (const node of this.nodes.values()) {
      communitySet.add(node.community);
    }

    return {
      nodeCount,
      edgeCount,
      avgDegree,
      communities: Array.from(communitySet),
    };
  }

  /**
   * 导出图数据（用于序列化/调试）
   */
  toData(): { nodes: SocialNode[]; edges: SocialEdge[] } {
    const allEdges: SocialEdge[] = [];
    for (const [, edgeList] of this.edges) {
      allEdges.push(...edgeList);
    }
    return {
      nodes: this.getAllNodes(),
      edges: allEdges,
    };
  }
}
