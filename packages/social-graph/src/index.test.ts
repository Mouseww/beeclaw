// ============================================================================
// @beeclaw/social-graph index 再导出验证测试
// 确保公共 API 完整导出
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  SocialGraph,
  calculatePropagation,
  getAgentAudience,
  detectCommunities,
  applyCommunityLabels,
  inferSocialRoles,
  applySocialRoles,
} from './index.js';

describe('@beeclaw/social-graph index 导出', () => {
  it('SocialGraph 类应正确导出', () => {
    expect(SocialGraph).toBeDefined();
    const graph = new SocialGraph();
    expect(graph).toBeInstanceOf(SocialGraph);
  });

  it('calculatePropagation 应是函数', () => {
    expect(typeof calculatePropagation).toBe('function');
  });

  it('getAgentAudience 应是函数', () => {
    expect(typeof getAgentAudience).toBe('function');
  });

  it('detectCommunities 应是函数', () => {
    expect(typeof detectCommunities).toBe('function');
  });

  it('applyCommunityLabels 应是函数', () => {
    expect(typeof applyCommunityLabels).toBe('function');
  });

  it('inferSocialRoles 应是函数', () => {
    expect(typeof inferSocialRoles).toBe('function');
  });

  it('applySocialRoles 应是函数', () => {
    expect(typeof applySocialRoles).toBe('function');
  });

  it('通过 index 导出的 SocialGraph 应能正常工作', () => {
    const graph = new SocialGraph();
    graph.addNode('a1', 60, 'default', 'leader');
    graph.addNode('a2');
    graph.addEdge('a1', 'a2', 'follow', 0.8);

    // 社区检测
    const communities = detectCommunities(graph);
    expect(communities.communityCount).toBeGreaterThan(0);

    // 应用标签
    applyCommunityLabels(graph, communities);
    expect(graph.getNode('a1')!.community).toMatch(/^community_/);

    // 角色推断
    const roles = inferSocialRoles(graph, communities);
    expect(roles.size).toBe(2);

    // 应用角色
    applySocialRoles(graph, roles);

    // 传播计算
    const event = {
      id: 'evt_1',
      type: 'external' as const,
      category: 'general' as const,
      title: 'test',
      content: 'test content',
      source: 'test',
      importance: 0.5,
      propagationRadius: 1.0,
      tick: 1,
      tags: [],
    };
    const propagation = calculatePropagation(event, graph);
    expect(propagation.reachedAgentIds.length).toBeGreaterThan(0);

    // 受众查询
    const audience = getAgentAudience('a1', graph);
    expect(Array.isArray(audience)).toBe(true);
  });
});
