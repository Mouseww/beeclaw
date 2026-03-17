// ============================================================================
// BeeClaw Dashboard — 社交网络图页面（D3.js 力导向图）
// ============================================================================

import { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Card, StatCard } from '../components';

// ── 类型定义 ──

/** 关系类型 */
export type RelationType = 'follow' | 'trust' | 'rival' | 'neutral';

/** 社交角色 */
export type SocialRole = 'leader' | 'follower' | 'bridge' | 'contrarian';

/** 社交图节点 */
export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  profession: string;
  influence: number;      // 0-100
  credibility: number;    // 0-100
  community: string;
  role: SocialRole;
  status: 'active' | 'dormant' | 'dead';
  followers: number;
  following: number;
}

/** 社交图边 */
export interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: RelationType;
  strength: number;       // 0-1
}

// ── 社区颜色映射（蜂蜜主题） ──

export const COMMUNITY_COLORS: Record<string, string> = {
  community_0: '#f59e0b', // 金黄
  community_1: '#3b82f6', // 蓝色
  community_2: '#10b981', // 绿色
  community_3: '#ef4444', // 红色
  community_4: '#8b5cf6', // 紫色
  community_5: '#ec4899', // 粉色
  community_6: '#06b6d4', // 青色
  community_7: '#f97316', // 橙色
};

export const ROLE_SHAPES: Record<SocialRole, string> = {
  leader: '★',
  bridge: '◆',
  contrarian: '▲',
  follower: '●',
};

export const RELATION_COLORS: Record<RelationType, string> = {
  follow: '#6b7280',
  trust: '#22c55e',
  rival: '#ef4444',
  neutral: '#374151',
};

// ── Mock 数据生成 ──

export function generateMockData(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const professions = [
    '金融分析师', '区块链交易员', '经济学教授', '财经记者', '零售投资者',
    '基金经理', '科技博主', '政策研究员', '量化工程师', '风险顾问',
    '创业者', '数据科学家', '市场营销专家', '律师', '企业高管',
    '自媒体人', '产品经理', '独立投研', '散户达人', '宏观策略师',
    '行业研究员', '资深交易员', '评论家', '投行分析师', '天使投资人',
    '编辑记者', '社区运营', '首席经济师', '私募操盘手', '对冲基金经理',
  ];

  const names = [
    '赵明远', '钱思琪', '孙浩然', '李晓峰', '周雨萌',
    '吴大伟', '郑芳华', '王志强', '冯晓雯', '陈思远',
    '楚天成', '卫雅琴', '蒋博文', '沈丽云', '韩志鹏',
    '杨子墨', '朱诗涵', '秦伟杰', '许梦菲', '何嘉诚',
    '吕清风', '曹雨桐', '魏俊凯', '苏婉清', '程思哲',
    '方若兰', '邓启明', '谭敏华', '高一帆', '林梓轩',
  ];

  const communities = ['community_0', 'community_1', 'community_2', 'community_3', 'community_4'] as const;

  // 生成 30 个节点
  const nodes: GraphNode[] = names.map((name, i) => {
    const community = communities[Math.floor(i / 6) % communities.length]!; // 每 6 人一个社区
    const isLeader = i % 6 === 0;
    const isBridge = i % 6 === 5;
    const isContrarian = i % 6 === 4;

    return {
      id: `agent_${String(i).padStart(3, '0')}`,
      name,
      profession: professions[i] ?? '自由职业者',
      influence: isLeader
        ? 70 + Math.random() * 30
        : isBridge
          ? 40 + Math.random() * 30
          : 10 + Math.random() * 50,
      credibility: 30 + Math.random() * 60,
      community: community ?? 'community_0',
      role: isLeader ? 'leader' : isBridge ? 'bridge' : isContrarian ? 'contrarian' : 'follower',
      status: Math.random() > 0.1 ? 'active' : (Math.random() > 0.5 ? 'dormant' : 'dead'),
      followers: Math.floor(Math.random() * 20),
      following: Math.floor(Math.random() * 15),
    };
  });

  // 生成边（社区内密集，社区间稀疏）
  const edges: GraphEdge[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const sameCommunity = nodes[i]!.community === nodes[j]!.community;
      const probability = sameCommunity ? 0.6 : 0.08;

      if (Math.random() < probability) {
        // 同社区偏向 follow/trust，跨社区偏向 neutral/rival
        let type: RelationType;
        if (sameCommunity) {
          type = Math.random() < 0.6 ? 'follow' : (Math.random() < 0.7 ? 'trust' : 'neutral');
        } else {
          type = Math.random() < 0.3 ? 'rival' : (Math.random() < 0.5 ? 'follow' : 'neutral');
        }

        edges.push({
          source: nodes[i]!.id,
          target: nodes[j]!.id,
          type,
          strength: sameCommunity
            ? 0.4 + Math.random() * 0.6
            : 0.1 + Math.random() * 0.4,
        });
      }
    }
  }

  return { nodes, edges };
}

// ── 主组件 ──

export function SocialGraphView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mockData] = useState(() => generateMockData());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterCommunity, setFilterCommunity] = useState<string | null>(null);
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  // 统计
  const communitySet = new Set(mockData.nodes.map(n => n.community));
  const avgInfluence = mockData.nodes.reduce((s, n) => s + n.influence, 0) / mockData.nodes.length;

  // 获取社区颜色
  const getCommunityColor = useCallback((community: string) => {
    return COMMUNITY_COLORS[community] ?? '#6b7280';
  }, []);

  // D3 力导向图
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = Math.max(500, container.clientHeight);

    // 清除旧内容
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // 渐变定义 — 为每种关系类型创建
    const defs = svg.append('defs');

    // 箭头标记
    Object.entries(RELATION_COLORS).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color)
        .attr('opacity', 0.6);
    });

    // 主容器（支持缩放和平移）
    const g = svg.append('g');

    // 缩放行为
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // 初始缩放居中
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(0.9)
      .translate(-width / 2, -height / 2);
    svg.call(zoom.transform, initialTransform);

    // 准备过滤后的数据
    const filteredNodes = filterCommunity
      ? mockData.nodes.filter(n => n.community === filterCommunity)
      : mockData.nodes;
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = mockData.edges.filter(
      e => filteredNodeIds.has(e.source as string) && filteredNodeIds.has(e.target as string)
    );

    // 深拷贝数据（D3 会修改原始对象）
    const nodes: GraphNode[] = filteredNodes.map(n => ({ ...n }));
    const links: GraphEdge[] = filteredEdges.map(e => ({ ...e }));

    // 力模拟
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(links)
        .id(d => d.id)
        .distance(d => 80 / (d.strength + 0.1))
        .strength(d => d.strength * 0.3)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => -100 - (d as GraphNode).influence * 2)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>()
        .radius(d => getNodeRadius(d.influence) + 4)
      )
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    // 绘制边
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => RELATION_COLORS[d.type])
      .attr('stroke-width', d => Math.max(1, d.strength * 4))
      .attr('stroke-opacity', 0.4)
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // 绘制节点组
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer');

    // 节点外发光
    node.append('circle')
      .attr('r', d => getNodeRadius(d.influence) + 3)
      .attr('fill', d => getCommunityColor(d.community))
      .attr('opacity', 0.15)
      .attr('filter', 'blur(3px)');

    // 节点主体
    node.append('circle')
      .attr('r', d => getNodeRadius(d.influence))
      .attr('fill', d => {
        const color = getCommunityColor(d.community);
        // 状态影响透明度
        if (d.status === 'dead') return '#374151';
        if (d.status === 'dormant') return d3.color(color)?.darker(1)?.formatHex() ?? color;
        return color;
      })
      .attr('stroke', d => {
        if (d.role === 'leader') return '#fff';
        if (d.role === 'bridge') return '#e5e7eb';
        if (d.role === 'contrarian') return '#ef4444';
        return d3.color(getCommunityColor(d.community))?.brighter(1)?.formatHex() ?? '#444';
      })
      .attr('stroke-width', d => d.role === 'leader' ? 3 : (d.role === 'bridge' ? 2 : 1.5))
      .attr('stroke-dasharray', d => d.role === 'contrarian' ? '3,2' : 'none');

    // 节点角色图标（仅 leader/bridge 有标记）
    node.filter(d => d.role === 'leader' || d.role === 'bridge')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => d.role === 'leader' ? '10px' : '8px')
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(d => ROLE_SHAPES[d.role]);

    // 节点名称标签
    node.append('text')
      .attr('dy', d => getNodeRadius(d.influence) + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#9ca3af')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    // 拖拽行为
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.call(drag as any);

    // 悬停交互
    node.on('mouseenter', (event, d) => {
      // 高亮相关节点和边
      const connectedNodeIds = new Set<string>();
      connectedNodeIds.add(d.id);
      links.forEach(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
        if (sourceId === d.id) connectedNodeIds.add(targetId);
        if (targetId === d.id) connectedNodeIds.add(sourceId);
      });

      // 降低未连接节点的透明度
      node.select('circle:nth-child(2)')
        .transition().duration(200)
        .attr('opacity', (n: unknown) => connectedNodeIds.has((n as GraphNode).id) ? 1 : 0.15);
      node.select('text:last-child')
        .transition().duration(200)
        .attr('opacity', (n: unknown) => connectedNodeIds.has((n as GraphNode).id) ? 1 : 0.1);

      link
        .transition().duration(200)
        .attr('stroke-opacity', (l: unknown) => {
          const lEdge = l as GraphEdge;
          const sourceId = typeof lEdge.source === 'string' ? lEdge.source : (lEdge.source as GraphNode).id;
          const targetId = typeof lEdge.target === 'string' ? lEdge.target : (lEdge.target as GraphNode).id;
          return sourceId === d.id || targetId === d.id ? 0.8 : 0.05;
        })
        .attr('stroke-width', (l: unknown) => {
          const lEdge = l as GraphEdge;
          const sourceId = typeof lEdge.source === 'string' ? lEdge.source : (lEdge.source as GraphNode).id;
          const targetId = typeof lEdge.target === 'string' ? lEdge.target : (lEdge.target as GraphNode).id;
          return sourceId === d.id || targetId === d.id
            ? Math.max(2, lEdge.strength * 6)
            : Math.max(1, lEdge.strength * 4);
        });

      // 显示 tooltip
      if (tooltipRef.current) {
        const tooltip = tooltipRef.current;
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.pageX + 12}px`;
        tooltip.style.top = `${event.pageY - 10}px`;
        tooltip.innerHTML = buildTooltipHtml(d);
      }
    })
    .on('mousemove', (event) => {
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${event.pageX + 12}px`;
        tooltipRef.current.style.top = `${event.pageY - 10}px`;
      }
    })
    .on('mouseleave', () => {
      // 恢复所有透明度
      node.select('circle:nth-child(2)')
        .transition().duration(200)
        .attr('opacity', 1);
      node.select('text:last-child')
        .transition().duration(200)
        .attr('opacity', 1);
      link
        .transition().duration(200)
        .attr('stroke-opacity', 0.4)
        .attr('stroke-width', (d: unknown) => Math.max(1, (d as GraphEdge).strength * 4));

      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    })
    .on('click', (_event, d) => {
      setSelectedNode(prev => prev?.id === d.id ? null : d);
    });

    // 力模拟 tick 更新
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // 清理
    return () => {
      simulation.stop();
    };
  }, [mockData, filterCommunity, getCommunityColor, showEdgeLabels]);

  // Resize 处理
  useEffect(() => {
    const handleResize = () => {
      if (!svgRef.current || !containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = Math.max(500, containerRef.current.clientHeight);
      d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">社交网络</h2>
          <p className="text-sm text-gray-500 mt-1">Agent 之间的社交关系图谱 — D3.js 力导向图</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEdgeLabels(!showEdgeLabels)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showEdgeLabels
                ? 'bg-bee-500/20 text-bee-400 border border-bee-500/30'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
            }`}
          >
            关系标签
          </button>
          <span className="px-3 py-1.5 rounded-lg bg-bee-500/10 text-bee-400 text-xs border border-bee-500/20">
            Mock 数据
          </span>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="节点数"
          value={mockData.nodes.length}
          icon="🤖"
          subtitle={`${mockData.nodes.filter(n => n.status === 'active').length} 个活跃`}
          trend="neutral"
        />
        <StatCard
          title="关系边"
          value={mockData.edges.length}
          icon="🔗"
          subtitle={`平均强度 ${(mockData.edges.reduce((s, e) => s + e.strength, 0) / mockData.edges.length).toFixed(2)}`}
        />
        <StatCard
          title="社区数"
          value={communitySet.size}
          icon="🏘️"
          subtitle="标签传播算法"
        />
        <StatCard
          title="平均影响力"
          value={avgInfluence.toFixed(1)}
          icon="📊"
          subtitle={`最高 ${Math.max(...mockData.nodes.map(n => n.influence)).toFixed(0)}`}
        />
      </div>

      {/* 社区过滤器 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCommunity(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filterCommunity === null
              ? 'bg-gray-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          全部社区
        </button>
        {Array.from(communitySet).sort().map(c => {
          const count = mockData.nodes.filter(n => n.community === c).length;
          return (
            <button
              key={c}
              onClick={() => setFilterCommunity(prev => prev === c ? null : c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                filterCommunity === c
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: getCommunityColor(c) }}
              />
              {c.replace('community_', '社区 ')} ({count})
            </button>
          );
        })}
      </div>

      {/* 力导向图主体 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3 !p-0 overflow-hidden">
          <div ref={containerRef} className="relative" style={{ height: '600px' }}>
            <svg ref={svgRef} className="w-full h-full bg-gray-950/50" />
            {/* 图例 */}
            <div className="absolute top-3 left-3 bg-gray-900/90 backdrop-blur-sm border border-gray-800 rounded-lg p-3 text-xs space-y-2">
              <p className="text-gray-400 font-semibold mb-1">图例</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-white text-xs">★</span>
                  <span className="text-gray-400">领导者</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white text-xs">◆</span>
                  <span className="text-gray-400">桥接者</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-xs">┅</span>
                  <span className="text-gray-400">反对者</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-300 text-xs">●</span>
                  <span className="text-gray-400">追随者</span>
                </div>
              </div>
              <div className="border-t border-gray-800 pt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: RELATION_COLORS.follow }} />
                  <span className="text-gray-400">关注</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: RELATION_COLORS.trust }} />
                  <span className="text-gray-400">信任</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: RELATION_COLORS.rival }} />
                  <span className="text-gray-400">竞争</span>
                </div>
              </div>
            </div>
            {/* 操作提示 */}
            <div className="absolute bottom-3 right-3 bg-gray-900/90 backdrop-blur-sm border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-500">
              滚轮缩放 · 拖拽画布 · 点击节点查看详情
            </div>
          </div>
        </Card>

        {/* 侧面板 — 节点详情 / 统计 */}
        <div className="space-y-4">
          {selectedNode ? (
            <NodeDetailPanel node={selectedNode} edges={mockData.edges} nodes={mockData.nodes} />
          ) : (
            <Card title="节点详情">
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <span className="text-3xl mb-3 opacity-40">🎯</span>
                <p className="text-sm text-center">点击图中节点<br/>查看 Agent 详细信息</p>
              </div>
            </Card>
          )}

          {/* 角色分布 */}
          <Card title="角色分布">
            <div className="space-y-2">
              {(['leader', 'bridge', 'contrarian', 'follower'] as SocialRole[]).map(role => {
                const count = mockData.nodes.filter(n => n.role === role).length;
                const pct = (count / mockData.nodes.length) * 100;
                const labels: Record<SocialRole, string> = {
                  leader: '领导者',
                  bridge: '桥接者',
                  contrarian: '反对者',
                  follower: '追随者',
                };
                const colors: Record<SocialRole, string> = {
                  leader: '#fbbf24',
                  bridge: '#3b82f6',
                  contrarian: '#ef4444',
                  follower: '#6b7280',
                };
                return (
                  <div key={role}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400 flex items-center gap-1">
                        <span>{ROLE_SHAPES[role]}</span>
                        {labels[role]}
                      </span>
                      <span className="text-gray-500">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: colors[role] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 关系类型分布 */}
          <Card title="关系类型">
            <div className="space-y-2">
              {(['follow', 'trust', 'rival', 'neutral'] as RelationType[]).map(type => {
                const count = mockData.edges.filter(e => e.type === type).length;
                const pct = (count / mockData.edges.length) * 100;
                const labels: Record<RelationType, string> = {
                  follow: '关注',
                  trust: '信任',
                  rival: '竞争',
                  neutral: '中立',
                };
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400 flex items-center gap-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: RELATION_COLORS[type] }}
                        />
                        {labels[type]}
                      </span>
                      <span className="text-gray-500">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: RELATION_COLORS[type] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
      {/* Tooltip 浮层（挂载到页面根） */}
      <div
        ref={tooltipRef}
        className="fixed z-50 pointer-events-none hidden bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-2 shadow-xl max-w-xs"
        style={{ display: 'none' }}
      />
    </div>
  );
}

// ── 子组件：节点详情面板 ──

/** @internal 导出供测试使用 */
export function NodeDetailPanel({
  node,
  edges,
  nodes,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  nodes: GraphNode[];
}) {
  // 找到与此节点相关的边
  const relatedEdges = edges.filter(
    e => e.source === node.id || e.target === node.id
  );
  const connections = relatedEdges.map(e => {
    const otherId = e.source === node.id ? e.target : e.source;
    const other = nodes.find(n => n.id === otherId);
    return { ...e, other };
  }).filter(c => c.other);

  const roleLabels: Record<SocialRole, string> = {
    leader: '领导者',
    bridge: '桥接者',
    contrarian: '反对者',
    follower: '追随者',
  };

  const statusLabels: Record<string, { text: string; class: string }> = {
    active: { text: '活跃', class: 'badge-active' },
    dormant: { text: '休眠', class: 'badge-dormant' },
    dead: { text: '淘汰', class: 'badge-dead' },
  };

  const st = statusLabels[node.status] ?? { text: '活跃', class: 'badge-active' };

  return (
    <Card title="节点详情">
      <div className="space-y-3">
        {/* 名称和状态 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-lg">{node.name}</p>
            <p className="text-gray-500 text-xs">{node.profession}</p>
          </div>
          <span className={`badge ${st.class}`}>{st.text}</span>
        </div>

        {/* 角色和社区 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {ROLE_SHAPES[node.role]} {roleLabels[node.role]}
          </span>
          <span className="text-gray-700">·</span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: COMMUNITY_COLORS[node.community] ?? '#6b7280' }}
            />
            {node.community.replace('community_', '社区 ')}
          </span>
        </div>

        {/* 指标 */}
        <div className="grid grid-cols-2 gap-2">
          <MetricBar label="影响力" value={node.influence} max={100} color="#fbbf24" />
          <MetricBar label="信誉度" value={node.credibility} max={100} color="#3b82f6" />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-white font-bold">{node.followers}</p>
            <p className="text-gray-500">关注者</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-white font-bold">{node.following}</p>
            <p className="text-gray-500">关注中</p>
          </div>
        </div>

        {/* 连接列表 */}
        {connections.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">关系 ({connections.length})</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {connections.slice(0, 8).map((c, i) => {
                const typeLabels: Record<RelationType, string> = {
                  follow: '关注', trust: '信任', rival: '竞争', neutral: '中立',
                };
                return (
                  <div key={i} className="flex items-center justify-between text-xs bg-gray-800/30 rounded px-2 py-1">
                    <span className="text-gray-300 truncate">{c.other!.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: RELATION_COLORS[c.type] }}
                      />
                      <span className="text-gray-500">{typeLabels[c.type]}</span>
                      <span className="text-gray-600">{c.strength.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
              {connections.length > 8 && (
                <p className="text-xs text-gray-600 text-center">
                  还有 {connections.length - 8} 个关系...
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-700 font-mono">{node.id}</p>
      </div>
    </Card>
  );
}

// ── 子组件：指标条 ──

/** @internal 导出供测试使用 */
export function MetricBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono">{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── 工具函数 ──

/** 根据影响力计算节点大小 */
export function getNodeRadius(influence: number): number {
  return 6 + (influence / 100) * 14; // 6px ~ 20px
}

/** 构建 tooltip HTML */
export function buildTooltipHtml(node: GraphNode): string {
  const roleLabels: Record<SocialRole, string> = {
    leader: '领导者', bridge: '桥接者', contrarian: '反对者', follower: '追随者',
  };
  const statusEmoji: Record<string, string> = {
    active: '🟢', dormant: '🟡', dead: '🔴',
  };

  return `
    <div style="font-size: 12px; line-height: 1.5;">
      <div style="font-weight: 600; color: #fff; margin-bottom: 2px;">
        ${statusEmoji[node.status] ?? '⚪'} ${node.name}
      </div>
      <div style="color: #9ca3af;">${node.profession}</div>
      <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
        <div><span style="color: #6b7280;">影响力</span> <span style="color: #fbbf24; font-weight: 500;">${node.influence.toFixed(0)}</span></div>
        <div><span style="color: #6b7280;">信誉</span> <span style="color: #3b82f6; font-weight: 500;">${node.credibility.toFixed(0)}</span></div>
        <div><span style="color: #6b7280;">角色</span> <span style="color: #d1d5db;">${roleLabels[node.role]}</span></div>
        <div><span style="color: #6b7280;">社区</span> <span style="color: ${COMMUNITY_COLORS[node.community] ?? '#6b7280'};">${node.community.replace('community_', '#')}</span></div>
      </div>
    </div>
  `;
}
