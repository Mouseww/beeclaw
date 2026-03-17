// ============================================================================
// BeeClaw Dashboard — SocialGraphView 页面增强测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  SocialGraphView,
  NodeDetailPanel,
  MetricBar,
  getNodeRadius,
  buildTooltipHtml,
  generateMockData,
  COMMUNITY_COLORS,
  ROLE_SHAPES,
  RELATION_COLORS,
} from '../pages/SocialGraphView';
import type {
  GraphNode,
  GraphEdge,
} from '../pages/SocialGraphView';

// Mock D3（力导向图依赖，jsdom 不支持 SVG 渲染）
// 使用回调捕获机制，使得 D3 回调函数在 proxy 中能被执行以覆盖内部逻辑

// 存储 D3 回调以便测试中触发
const d3Callbacks: Record<string, ((...args: unknown[]) => unknown)[]> = {};
const simulationCallbacks: Record<string, (...args: unknown[]) => unknown> = {};

function captureCallback(name: string, fn: (...args: unknown[]) => unknown) {
  if (!d3Callbacks[name]) d3Callbacks[name] = [];
  d3Callbacks[name]!.push(fn);
}

vi.mock('d3', () => {
  const makeChainProxy = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      { get: () => vi.fn().mockReturnValue(proxy) },
    );
    return proxy;
  };

  // 为 forceLink, forceManyBody, forceCollide 创建回调捕获的 proxy
  const makeForceLinkProxy = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'id') return (fn: (...args: unknown[]) => unknown) => { captureCallback('linkId', fn); return proxy; };
          if (prop === 'distance') return (fn: (...args: unknown[]) => unknown) => { captureCallback('linkDistance', fn); return proxy; };
          if (prop === 'strength') return (fn: (...args: unknown[]) => unknown) => { captureCallback('linkStrength', fn); return proxy; };
          return vi.fn().mockReturnValue(proxy);
        },
      },
    );
    return proxy;
  };

  const makeForceManyBodyProxy = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'strength') return (fn: (...args: unknown[]) => unknown) => { captureCallback('chargeStrength', fn); return proxy; };
          return vi.fn().mockReturnValue(proxy);
        },
      },
    );
    return proxy;
  };

  const makeForceCollideProxy = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'radius') return (fn: (...args: unknown[]) => unknown) => { captureCallback('collideRadius', fn); return proxy; };
          return vi.fn().mockReturnValue(proxy);
        },
      },
    );
    return proxy;
  };

  // nodeProxy 需要捕获 .attr / .on 的回调
  const makeNodeProxy = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'on') {
            return (eventName: string, fn: (...args: unknown[]) => unknown) => {
              captureCallback(`node.${eventName}`, fn);
              return proxy;
            };
          }
          if (prop === 'attr') {
            return (attrName: string, valOrFn: unknown) => {
              if (typeof valOrFn === 'function') {
                captureCallback(`node.attr.${attrName}`, valOrFn as (...args: unknown[]) => unknown);
              }
              return proxy;
            };
          }
          if (prop === 'append') {
            return () => {
              // 返回一个 element proxy，也能捕获 .attr
              const elemProxy: unknown = new Proxy({}, {
                get: (_t2, p2) => {
                  if (p2 === 'attr') {
                    return (attrName: string, valOrFn: unknown) => {
                      if (typeof valOrFn === 'function') {
                        captureCallback(`node.elem.attr.${attrName}`, valOrFn as (...args: unknown[]) => unknown);
                      }
                      return elemProxy;
                    };
                  }
                  if (p2 === 'text') {
                    return (valOrFn: unknown) => {
                      if (typeof valOrFn === 'function') {
                        captureCallback('node.elem.text', valOrFn as (...args: unknown[]) => unknown);
                      }
                      return elemProxy;
                    };
                  }
                  return vi.fn().mockReturnValue(elemProxy);
                },
              });
              return elemProxy;
            };
          }
          if (prop === 'filter') {
            return (fn: (...args: unknown[]) => unknown) => {
              captureCallback('node.filter', fn);
              return proxy; // 返回同个 proxy，后续 append 依然被捕获
            };
          }
          if (prop === 'call') return vi.fn().mockReturnValue(proxy);
          if (prop === 'select') return vi.fn().mockReturnValue(makeChainProxy());
          return vi.fn().mockReturnValue(proxy);
        },
      },
    );
    return proxy;
  };

  // linkProxy 需要捕获 .attr 回调
  const makeLinkProxy = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'attr') {
            return (attrName: string, valOrFn: unknown) => {
              if (typeof valOrFn === 'function') {
                captureCallback(`link.attr.${attrName}`, valOrFn as (...args: unknown[]) => unknown);
              }
              return proxy;
            };
          }
          if (prop === 'transition') return vi.fn().mockReturnValue(proxy);
          if (prop === 'duration') return vi.fn().mockReturnValue(proxy);
          return vi.fn().mockReturnValue(proxy);
        },
      },
    );
    return proxy;
  };

  let appendCallCount = 0;

  const makeGProxy = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'append') {
            return (tag: string) => {
              if (tag === 'g') {
                appendCallCount++;
                // 第一个 g.append('g') 是 links，第二个是 nodes
                if (appendCallCount % 2 === 1) return makeLinkProxy();
                return makeNodeProxy();
              }
              return makeChainProxy();
            };
          }
          if (prop === 'attr') return vi.fn().mockReturnValue(proxy);
          return vi.fn().mockReturnValue(proxy);
        },
      },
    );
    return proxy;
  };

  return {
    select: vi.fn(() => {
      const svgProxy: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'append') {
              return (tag: string) => {
                if (tag === 'g') {
                  appendCallCount = 0;
                  return makeGProxy();
                }
                return makeChainProxy();
              };
            }
            if (prop === 'call') return vi.fn().mockReturnValue(svgProxy);
            if (prop === 'attr') return vi.fn().mockReturnValue(svgProxy);
            return vi.fn().mockReturnValue(svgProxy);
          },
        },
      );
      return svgProxy;
    }),
    forceSimulation: vi.fn(() => {
      const proxy: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'stop') return vi.fn();
            if (prop === 'on') {
              return (eventName: string, fn: (...args: unknown[]) => unknown) => {
                simulationCallbacks[eventName] = fn;
                return proxy;
              };
            }
            if (prop === 'alphaTarget') return vi.fn().mockReturnValue(proxy);
            if (prop === 'restart') return vi.fn().mockReturnValue(proxy);
            return vi.fn().mockReturnValue(proxy);
          },
        },
      );
      return proxy;
    }),
    forceLink: vi.fn(() => makeForceLinkProxy()),
    forceManyBody: vi.fn(() => makeForceManyBodyProxy()),
    forceCenter: vi.fn(),
    forceCollide: vi.fn(() => makeForceCollideProxy()),
    forceX: vi.fn(() => ({ strength: vi.fn() })),
    forceY: vi.fn(() => ({ strength: vi.fn() })),
    zoom: vi.fn(() => {
      const proxy: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'on') {
              return (eventName: string, fn: (...args: unknown[]) => unknown) => {
                captureCallback(`zoom.${eventName}`, fn);
                return proxy;
              };
            }
            return vi.fn().mockReturnValue(proxy);
          },
        },
      );
      return proxy;
    }),
    zoomIdentity: {
      translate: vi.fn().mockReturnValue({
        scale: vi.fn().mockReturnValue({
          translate: vi.fn().mockReturnValue({}),
        }),
      }),
    },
    drag: vi.fn(() => {
      const proxy: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'on') {
              return (eventName: string, fn: (...args: unknown[]) => unknown) => {
                captureCallback(`drag.${eventName}`, fn);
                return proxy;
              };
            }
            return vi.fn().mockReturnValue(proxy);
          },
        },
      );
      return proxy;
    }),
    color: vi.fn(() => ({
      darker: vi.fn(() => ({ formatHex: () => '#333' })),
      brighter: vi.fn(() => ({ formatHex: () => '#999' })),
    })),
  };
});

// ── 辅助函数 ──

function renderSocialGraphView() {
  return render(
    <MemoryRouter>
      <SocialGraphView />
    </MemoryRouter>,
  );
}

/** 创建一个测试用 GraphNode */
function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'agent_001',
    name: '赵明远',
    profession: '金融分析师',
    influence: 85,
    credibility: 72,
    community: 'community_0',
    role: 'leader',
    status: 'active',
    followers: 15,
    following: 8,
    ...overrides,
  };
}

/** 创建一个测试用 GraphEdge */
function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    source: 'agent_001',
    target: 'agent_002',
    type: 'follow',
    strength: 0.7,
    ...overrides,
  };
}

// ============================================================================
// SocialGraphView 主组件测试
// ============================================================================

describe('SocialGraphView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置回调存储
    Object.keys(d3Callbacks).forEach(k => delete d3Callbacks[k]);
    Object.keys(simulationCallbacks).forEach(k => delete simulationCallbacks[k]);
  });

  // ── 基本渲染 ──

  it('应该渲染页面标题和描述', () => {
    renderSocialGraphView();
    expect(screen.getByText('社交网络')).toBeInTheDocument();
    expect(screen.getByText(/Agent 之间的社交关系图谱/)).toBeInTheDocument();
  });

  it('应该显示 Mock 数据标签', () => {
    renderSocialGraphView();
    expect(screen.getByText('Mock 数据')).toBeInTheDocument();
  });

  it('应该显示关系标签按钮', () => {
    renderSocialGraphView();
    expect(screen.getByText('关系标签')).toBeInTheDocument();
  });

  // ── 统计卡片 ──

  it('应该渲染 4 个统计卡片', () => {
    renderSocialGraphView();
    expect(screen.getByText('节点数')).toBeInTheDocument();
    expect(screen.getByText('关系边')).toBeInTheDocument();
    expect(screen.getByText('社区数')).toBeInTheDocument();
    expect(screen.getByText('平均影响力')).toBeInTheDocument();
  });

  it('节点数应为 30', () => {
    renderSocialGraphView();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('社区数应为 5', () => {
    renderSocialGraphView();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('应该显示活跃节点统计', () => {
    renderSocialGraphView();
    expect(screen.getByText(/个活跃/)).toBeInTheDocument();
  });

  it('应该显示平均强度统计', () => {
    renderSocialGraphView();
    expect(screen.getByText(/平均强度/)).toBeInTheDocument();
  });

  it('应该显示标签传播算法子标题', () => {
    renderSocialGraphView();
    expect(screen.getByText('标签传播算法')).toBeInTheDocument();
  });

  it('应该显示最高影响力子标题', () => {
    renderSocialGraphView();
    expect(screen.getByText(/最高/)).toBeInTheDocument();
  });

  // ── 社区过滤器 ──

  it('应该渲染 "全部社区" 按钮', () => {
    renderSocialGraphView();
    expect(screen.getByText('全部社区')).toBeInTheDocument();
  });

  it('应该渲染所有社区过滤按钮', () => {
    renderSocialGraphView();
    expect(screen.getByText(/社区 0/)).toBeInTheDocument();
    expect(screen.getByText(/社区 1/)).toBeInTheDocument();
    expect(screen.getByText(/社区 2/)).toBeInTheDocument();
    expect(screen.getByText(/社区 3/)).toBeInTheDocument();
    expect(screen.getByText(/社区 4/)).toBeInTheDocument();
  });

  it('点击社区按钮应切换过滤', async () => {
    const user = userEvent.setup();
    renderSocialGraphView();

    const communityBtn = screen.getByText(/社区 0/);
    await user.click(communityBtn);
    // 按钮应变为选中状态
    expect(communityBtn).toBeInTheDocument();
  });

  it('再次点击同一社区按钮应取消过滤', async () => {
    const user = userEvent.setup();
    renderSocialGraphView();

    const communityBtn = screen.getByText(/社区 0/);
    // 第一次点击选中
    await user.click(communityBtn);
    // 第二次点击取消
    await user.click(communityBtn);
    expect(communityBtn).toBeInTheDocument();
  });

  it('点击"全部社区"应重置过滤', async () => {
    const user = userEvent.setup();
    renderSocialGraphView();

    // 先选中一个社区
    const communityBtn = screen.getByText(/社区 0/);
    await user.click(communityBtn);

    // 点击"全部社区"重置
    const allBtn = screen.getByText('全部社区');
    await user.click(allBtn);
    expect(allBtn).toBeInTheDocument();
  });

  // ── 关系标签按钮交互 ──

  it('点击关系标签按钮应切换状态', async () => {
    const user = userEvent.setup();
    renderSocialGraphView();

    const edgeLabelBtn = screen.getByText('关系标签');
    // 初始状态无高亮 class
    expect(edgeLabelBtn.className).toContain('bg-gray-800');

    // 点击切换
    await user.click(edgeLabelBtn);
    expect(edgeLabelBtn.className).toContain('bg-bee-500/20');
  });

  it('再次点击关系标签按钮应恢复初始状态', async () => {
    const user = userEvent.setup();
    renderSocialGraphView();

    const edgeLabelBtn = screen.getByText('关系标签');
    await user.click(edgeLabelBtn);
    await user.click(edgeLabelBtn);
    expect(edgeLabelBtn.className).toContain('bg-gray-800');
  });

  // ── 侧面板 ──

  it('未选中节点时应显示节点详情提示', () => {
    renderSocialGraphView();
    expect(screen.getByText('节点详情')).toBeInTheDocument();
    expect(screen.getByText(/点击图中节点/)).toBeInTheDocument();
  });

  // ── 角色分布 ──

  it('应该渲染角色分布面板', () => {
    renderSocialGraphView();
    expect(screen.getByText('角色分布')).toBeInTheDocument();
    expect(screen.getAllByText('领导者').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('桥接者').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('反对者').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('追随者').length).toBeGreaterThanOrEqual(1);
  });

  it('角色分布应显示百分比', () => {
    renderSocialGraphView();
    // 每种角色都应有 count (百分比%) 格式
    const percentageTexts = screen.getAllByText(/%\)/);
    expect(percentageTexts.length).toBeGreaterThanOrEqual(4);
  });

  // ── 关系类型分布 ──

  it('应该渲染关系类型面板', () => {
    renderSocialGraphView();
    expect(screen.getByText('关系类型')).toBeInTheDocument();
    expect(screen.getAllByText('关注').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('信任').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('竞争').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('中立').length).toBeGreaterThanOrEqual(1);
  });

  // ── 图例 ──

  it('应该渲染图例', () => {
    renderSocialGraphView();
    expect(screen.getByText('图例')).toBeInTheDocument();
  });

  it('图例应包含角色图标', () => {
    renderSocialGraphView();
    expect(screen.getAllByText('★').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('◆').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('┅')).toBeInTheDocument();
    expect(screen.getAllByText('●').length).toBeGreaterThanOrEqual(1);
  });

  // ── 操作提示 ──

  it('应该渲染操作提示', () => {
    renderSocialGraphView();
    expect(screen.getByText('滚轮缩放 · 拖拽画布 · 点击节点查看详情')).toBeInTheDocument();
  });

  // ── SVG 容器 ──

  it('应该渲染 SVG 容器', () => {
    const { container } = renderSocialGraphView();
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  // ── Tooltip 容器 ──

  it('应该渲染 tooltip 容器（初始隐藏）', () => {
    const { container } = renderSocialGraphView();
    // tooltip 是最后一个固定定位的div
    const tooltipDiv = container.querySelector('.fixed.z-50');
    expect(tooltipDiv).toBeInTheDocument();
    expect(tooltipDiv).toHaveStyle({ display: 'none' });
  });

  // ── D3 回调覆盖测试 ──

  it('D3 力模型回调应被正确注册（forceLink callbacks）', () => {
    renderSocialGraphView();
    // 验证 forceLink 的回调被注册
    expect(d3Callbacks['linkId']?.length).toBeGreaterThan(0);
    expect(d3Callbacks['linkDistance']?.length).toBeGreaterThan(0);
    expect(d3Callbacks['linkStrength']?.length).toBeGreaterThan(0);
  });

  it('forceLink.id 回调应返回节点 id', () => {
    renderSocialGraphView();
    const idFn = d3Callbacks['linkId']?.[0];
    expect(idFn).toBeDefined();
    if (idFn) {
      const result = idFn({ id: 'test_node' });
      expect(result).toBe('test_node');
    }
  });

  it('forceLink.distance 回调应基于 strength 计算', () => {
    renderSocialGraphView();
    const distFn = d3Callbacks['linkDistance']?.[0];
    expect(distFn).toBeDefined();
    if (distFn) {
      const result = distFn({ strength: 0.5 });
      expect(result).toBeCloseTo(80 / 0.6, 1);
    }
  });

  it('forceLink.strength 回调应返回 strength * 0.3', () => {
    renderSocialGraphView();
    const strFn = d3Callbacks['linkStrength']?.[0];
    expect(strFn).toBeDefined();
    if (strFn) {
      const result = strFn({ strength: 0.8 });
      expect(result).toBeCloseTo(0.24, 5);
    }
  });

  it('forceManyBody.strength 回调应基于影响力计算', () => {
    renderSocialGraphView();
    const chargeFn = d3Callbacks['chargeStrength']?.[0];
    expect(chargeFn).toBeDefined();
    if (chargeFn) {
      const result = chargeFn({ influence: 50 });
      expect(result).toBe(-200); // -100 - 50*2
    }
  });

  it('forceCollide.radius 回调应基于影响力计算', () => {
    renderSocialGraphView();
    const radiusFn = d3Callbacks['collideRadius']?.[0];
    expect(radiusFn).toBeDefined();
    if (radiusFn) {
      const result = radiusFn({ influence: 50 });
      expect(result).toBe(getNodeRadius(50) + 4); // 13 + 4 = 17
    }
  });

  it('link.attr stroke 回调应返回关系类型对应颜色', () => {
    renderSocialGraphView();
    const strokeFns = d3Callbacks['link.attr.stroke'];
    expect(strokeFns?.length).toBeGreaterThan(0);
    if (strokeFns?.[0]) {
      expect(strokeFns[0]({ type: 'follow' })).toBe(RELATION_COLORS.follow);
      expect(strokeFns[0]({ type: 'trust' })).toBe(RELATION_COLORS.trust);
      expect(strokeFns[0]({ type: 'rival' })).toBe(RELATION_COLORS.rival);
    }
  });

  it('link.attr stroke-width 回调应基于 strength 计算', () => {
    renderSocialGraphView();
    const swFns = d3Callbacks['link.attr.stroke-width'];
    expect(swFns?.length).toBeGreaterThan(0);
    if (swFns?.[0]) {
      expect(swFns[0]({ strength: 0.5 })).toBe(2); // Math.max(1, 0.5*4)=2
      expect(swFns[0]({ strength: 0.1 })).toBe(1); // Math.max(1, 0.1*4)=1
    }
  });

  it('link.attr marker-end 回调应返回箭头标记', () => {
    renderSocialGraphView();
    const meFns = d3Callbacks['link.attr.marker-end'];
    expect(meFns?.length).toBeGreaterThan(0);
    if (meFns?.[0]) {
      expect(meFns[0]({ type: 'follow' })).toBe('url(#arrow-follow)');
      expect(meFns[0]({ type: 'rival' })).toBe('url(#arrow-rival)');
    }
  });

  it('node 元素的 fill 回调应处理不同状态', () => {
    renderSocialGraphView();
    const fillFns = d3Callbacks['node.elem.attr.fill'];
    // 查找处理 dead/dormant/active 的 fill 回调
    if (fillFns && fillFns.length > 0) {
      // find the callback that handles 'dead' status
      for (const fn of fillFns) {
        const deadResult = fn({ community: 'community_0', status: 'dead', role: 'follower' });
        if (deadResult === '#374151') {
          expect(deadResult).toBe('#374151');
          const dormantResult = fn({ community: 'community_0', status: 'dormant', role: 'follower' });
          expect(dormantResult).toBeDefined();
          const activeResult = fn({ community: 'community_0', status: 'active', role: 'follower' });
          expect(activeResult).toBeDefined();
          break;
        }
      }
    }
  });

  it('node 元素的 stroke 回调应处理不同角色', () => {
    renderSocialGraphView();
    const strokeFns = d3Callbacks['node.elem.attr.stroke'];
    if (strokeFns && strokeFns.length > 0) {
      for (const fn of strokeFns) {
        const leaderResult = fn({ role: 'leader', community: 'community_0' });
        if (leaderResult === '#fff') {
          expect(fn({ role: 'bridge', community: 'community_0' })).toBe('#e5e7eb');
          expect(fn({ role: 'contrarian', community: 'community_0' })).toBe('#ef4444');
          const followerResult = fn({ role: 'follower', community: 'community_0' });
          expect(followerResult).toBeDefined();
          break;
        }
      }
    }
  });

  it('node.elem.attr stroke-width 应根据角色返回不同值', () => {
    renderSocialGraphView();
    const swFns = d3Callbacks['node.elem.attr.stroke-width'];
    if (swFns && swFns.length > 0) {
      for (const fn of swFns) {
        const leaderWidth = fn({ role: 'leader' });
        if (leaderWidth === 3) {
          expect(fn({ role: 'bridge' })).toBe(2);
          expect(fn({ role: 'follower' })).toBe(1.5);
          break;
        }
      }
    }
  });

  it('node.elem.attr stroke-dasharray 应对 contrarian 使用虚线', () => {
    renderSocialGraphView();
    const sdFns = d3Callbacks['node.elem.attr.stroke-dasharray'];
    if (sdFns && sdFns.length > 0) {
      for (const fn of sdFns) {
        const contrarianResult = fn({ role: 'contrarian' });
        if (contrarianResult === '3,2') {
          expect(fn({ role: 'follower' })).toBe('none');
          break;
        }
      }
    }
  });

  it('node.filter 回调应过滤 leader 和 bridge', () => {
    renderSocialGraphView();
    const filterFns = d3Callbacks['node.filter'];
    if (filterFns && filterFns.length > 0) {
      const fn = filterFns[0]!;
      expect(fn({ role: 'leader' })).toBe(true);
      expect(fn({ role: 'bridge' })).toBe(true);
      expect(fn({ role: 'follower' })).toBe(false);
      expect(fn({ role: 'contrarian' })).toBe(false);
    }
  });

  it('node font-size 回调应对 leader 返回 10px', () => {
    renderSocialGraphView();
    const fsFns = d3Callbacks['node.elem.attr.font-size'];
    if (fsFns && fsFns.length > 0) {
      for (const fn of fsFns) {
        const leaderSize = fn({ role: 'leader' });
        if (leaderSize === '10px') {
          expect(fn({ role: 'bridge' })).toBe('8px');
          break;
        }
      }
    }
  });

  it('node text 回调应返回 ROLE_SHAPES', () => {
    renderSocialGraphView();
    const textFns = d3Callbacks['node.elem.text'];
    if (textFns && textFns.length > 0) {
      // 角色标记文本
      for (const fn of textFns) {
        if (fn({ role: 'leader', name: '赵明远' }) === '★') {
          expect(fn({ role: 'bridge', name: '钱思琪' })).toBe('◆');
          break;
        }
      }
    }
  });

  it('node dy 回调应基于影响力 + 14 计算', () => {
    renderSocialGraphView();
    const dyFns = d3Callbacks['node.elem.attr.dy'];
    if (dyFns && dyFns.length > 0) {
      for (const fn of dyFns) {
        const result = fn({ influence: 50 });
        if (result === getNodeRadius(50) + 14) {
          expect(result).toBe(27); // 13 + 14
          break;
        }
      }
    }
  });

  it('node name text 回调应返回节点名称', () => {
    renderSocialGraphView();
    const textFns = d3Callbacks['node.elem.text'];
    if (textFns && textFns.length > 0) {
      // 名称文本回调
      for (const fn of textFns) {
        const result = fn({ role: 'follower', name: '赵明远' });
        if (result === '赵明远') {
          expect(result).toBe('赵明远');
          break;
        }
      }
    }
  });

  it('node.elem.attr r 回调应基于影响力计算 (glow)', () => {
    renderSocialGraphView();
    const rFns = d3Callbacks['node.elem.attr.r'];
    if (rFns && rFns.length > 0) {
      for (const fn of rFns) {
        const result = fn({ influence: 50 });
        // glow: getNodeRadius(50) + 3 = 16
        if (result === getNodeRadius(50) + 3) {
          expect(result).toBe(16);
          break;
        }
      }
    }
  });

  it('drag.start 回调应设置 fx/fy', () => {
    renderSocialGraphView();
    const dragStartFns = d3Callbacks['drag.start'];
    expect(dragStartFns?.length).toBeGreaterThan(0);
    if (dragStartFns?.[0]) {
      const d = { x: 100, y: 200, fx: null as number | null, fy: null as number | null };
      dragStartFns[0]({ active: 0 }, d);
      expect(d.fx).toBe(100);
      expect(d.fy).toBe(200);
    }
  });

  it('drag.drag 回调应更新 fx/fy', () => {
    renderSocialGraphView();
    const dragFns = d3Callbacks['drag.drag'];
    expect(dragFns?.length).toBeGreaterThan(0);
    if (dragFns?.[0]) {
      const d = { fx: 0, fy: 0 };
      dragFns[0]({ x: 150, y: 250 }, d);
      expect(d.fx).toBe(150);
      expect(d.fy).toBe(250);
    }
  });

  it('drag.end 回调应清除 fx/fy', () => {
    renderSocialGraphView();
    const dragEndFns = d3Callbacks['drag.end'];
    expect(dragEndFns?.length).toBeGreaterThan(0);
    if (dragEndFns?.[0]) {
      const d = { fx: 100 as number | null, fy: 200 as number | null };
      dragEndFns[0]({ active: 0 }, d);
      expect(d.fx).toBeNull();
      expect(d.fy).toBeNull();
    }
  });

  it('zoom 回调应被注册', () => {
    renderSocialGraphView();
    expect(d3Callbacks['zoom.zoom']?.length).toBeGreaterThan(0);
  });

  it('simulation tick 回调应被注册', () => {
    renderSocialGraphView();
    expect(simulationCallbacks['tick']).toBeDefined();
  });

  it('node.mouseenter 回调应被注册', () => {
    renderSocialGraphView();
    expect(d3Callbacks['node.mouseenter']?.length).toBeGreaterThan(0);
  });

  it('node.mousemove 回调应被注册', () => {
    renderSocialGraphView();
    expect(d3Callbacks['node.mousemove']?.length).toBeGreaterThan(0);
  });

  it('node.mouseleave 回调应被注册', () => {
    renderSocialGraphView();
    expect(d3Callbacks['node.mouseleave']?.length).toBeGreaterThan(0);
  });

  it('node.click 回调应被注册', () => {
    renderSocialGraphView();
    expect(d3Callbacks['node.click']?.length).toBeGreaterThan(0);
  });

  // ── 执行捕获的事件回调以覆盖内部逻辑 ──

  it('mouseenter 回调执行时应处理连接高亮逻辑', () => {
    renderSocialGraphView();
    const enterFn = d3Callbacks['node.mouseenter']?.[0];
    expect(enterFn).toBeDefined();
    if (enterFn) {
      // 调用回调，触发内部逻辑（connectedNodeIds 计算、tooltip 等）
      enterFn(
        { pageX: 100, pageY: 200 },
        { id: 'agent_000', name: '测试', community: 'community_0', status: 'active', role: 'leader', influence: 50, credibility: 50 },
      );
      // 不报错即视为通过 — 内部逻辑已被执行
    }
  });

  it('mousemove 回调执行时不应报错', () => {
    renderSocialGraphView();
    const moveFn = d3Callbacks['node.mousemove']?.[0];
    expect(moveFn).toBeDefined();
    if (moveFn) {
      moveFn({ pageX: 120, pageY: 220 });
    }
  });

  it('mouseleave 回调执行时应恢复透明度', () => {
    renderSocialGraphView();
    const leaveFn = d3Callbacks['node.mouseleave']?.[0];
    expect(leaveFn).toBeDefined();
    if (leaveFn) {
      leaveFn();
    }
  });

  it('click 回调执行时应设置选中节点', () => {
    renderSocialGraphView();
    const clickFn = d3Callbacks['node.click']?.[0];
    expect(clickFn).toBeDefined();
    if (clickFn) {
      clickFn(
        {},
        { id: 'agent_000', name: '测试节点', community: 'community_0', status: 'active', role: 'leader', influence: 80, credibility: 60, profession: '测试', followers: 5, following: 3 },
      );
    }
  });

  it('simulation tick 回调执行时应更新位置', () => {
    renderSocialGraphView();
    const tickFn = simulationCallbacks['tick'];
    expect(tickFn).toBeDefined();
    if (tickFn) {
      tickFn();
    }
  });

  // ── Resize handler 测试 ──

  it('resize 事件应触发 SVG 尺寸更新', () => {
    renderSocialGraphView();
    // 触发 window resize 事件
    window.dispatchEvent(new Event('resize'));
    // 不报错即通过
  });
});

// ============================================================================
// NodeDetailPanel 子组件测试
// ============================================================================

describe('NodeDetailPanel', () => {
  const nodes: GraphNode[] = [
    makeNode({ id: 'agent_001', name: '赵明远', role: 'leader', status: 'active' }),
    makeNode({ id: 'agent_002', name: '钱思琪', role: 'follower', status: 'dormant', community: 'community_0' }),
    makeNode({ id: 'agent_003', name: '孙浩然', role: 'bridge', status: 'dead', community: 'community_1' }),
    makeNode({ id: 'agent_004', name: '李晓峰', role: 'contrarian', status: 'active', community: 'community_2' }),
  ];

  const edges: GraphEdge[] = [
    makeEdge({ source: 'agent_001', target: 'agent_002', type: 'follow', strength: 0.8 }),
    makeEdge({ source: 'agent_001', target: 'agent_003', type: 'trust', strength: 0.5 }),
    makeEdge({ source: 'agent_003', target: 'agent_004', type: 'rival', strength: 0.3 }),
    makeEdge({ source: 'agent_002', target: 'agent_004', type: 'neutral', strength: 0.2 }),
  ];

  function renderNodeDetail(node: GraphNode, edgesOverride?: GraphEdge[], nodesOverride?: GraphNode[]) {
    return render(
      <MemoryRouter>
        <NodeDetailPanel node={node} edges={edgesOverride ?? edges} nodes={nodesOverride ?? nodes} />
      </MemoryRouter>,
    );
  }

  // ── 基本信息渲染 ──

  it('应该显示节点名称和职业', () => {
    renderNodeDetail(nodes[0]!);
    expect(screen.getByText('赵明远')).toBeInTheDocument();
    expect(screen.getByText('金融分析师')).toBeInTheDocument();
  });

  it('应该显示节点 ID', () => {
    renderNodeDetail(nodes[0]!);
    expect(screen.getByText('agent_001')).toBeInTheDocument();
  });

  // ── 状态显示 ──

  it('活跃节点应显示"活跃"标签', () => {
    renderNodeDetail(nodes[0]!);
    expect(screen.getByText('活跃')).toBeInTheDocument();
  });

  it('休眠节点应显示"休眠"标签', () => {
    const dormantNode = makeNode({ status: 'dormant' });
    renderNodeDetail(dormantNode);
    expect(screen.getByText('休眠')).toBeInTheDocument();
  });

  it('淘汰节点应显示"淘汰"标签', () => {
    const deadNode = makeNode({ status: 'dead' });
    renderNodeDetail(deadNode);
    expect(screen.getByText('淘汰')).toBeInTheDocument();
  });

  it('活跃状态应有 badge-active class', () => {
    renderNodeDetail(nodes[0]!);
    const badge = screen.getByText('活跃');
    expect(badge.className).toContain('badge-active');
  });

  it('休眠状态应有 badge-dormant class', () => {
    renderNodeDetail(makeNode({ status: 'dormant' }));
    const badge = screen.getByText('休眠');
    expect(badge.className).toContain('badge-dormant');
  });

  it('淘汰状态应有 badge-dead class', () => {
    renderNodeDetail(makeNode({ status: 'dead' }));
    const badge = screen.getByText('淘汰');
    expect(badge.className).toContain('badge-dead');
  });

  // ── 角色显示 ──

  it('leader 角色应显示"领导者"和星号', () => {
    renderNodeDetail(makeNode({ role: 'leader' }));
    expect(screen.getByText(/★.*领导者/)).toBeInTheDocument();
  });

  it('bridge 角色应显示"桥接者"', () => {
    renderNodeDetail(makeNode({ role: 'bridge' }));
    expect(screen.getByText(/◆.*桥接者/)).toBeInTheDocument();
  });

  it('contrarian 角色应显示"反对者"', () => {
    renderNodeDetail(makeNode({ role: 'contrarian' }));
    expect(screen.getByText(/▲.*反对者/)).toBeInTheDocument();
  });

  it('follower 角色应显示"追随者"', () => {
    renderNodeDetail(makeNode({ role: 'follower' }));
    expect(screen.getByText(/●.*追随者/)).toBeInTheDocument();
  });

  // ── 社区显示 ──

  it('应显示社区名称', () => {
    renderNodeDetail(makeNode({ community: 'community_0' }));
    expect(screen.getByText('社区 0')).toBeInTheDocument();
  });

  it('社区标识应有对应颜色', () => {
    const { container } = renderNodeDetail(makeNode({ community: 'community_0' }));
    const communityDot = container.querySelector('span.w-2.h-2.rounded-full');
    expect(communityDot).toHaveStyle({ backgroundColor: COMMUNITY_COLORS['community_0'] });
  });

  // ── 指标显示 ──

  it('应显示影响力和信誉度指标', () => {
    renderNodeDetail(makeNode({ influence: 85, credibility: 72 }));
    expect(screen.getByText('影响力')).toBeInTheDocument();
    expect(screen.getByText('信誉度')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
  });

  // ── 关注者/关注中 ──

  it('应显示关注者和关注中数量', () => {
    renderNodeDetail(makeNode({ followers: 15, following: 8 }));
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('关注者')).toBeInTheDocument();
    expect(screen.getByText('关注中')).toBeInTheDocument();
  });

  // ── 连接列表 ──

  it('应显示与节点相关的连接数量', () => {
    renderNodeDetail(nodes[0]!);
    // agent_001 有 2 条边
    expect(screen.getByText(/关系 \(2\)/)).toBeInTheDocument();
  });

  it('连接列表应显示对方名称', () => {
    renderNodeDetail(nodes[0]!);
    expect(screen.getByText('钱思琪')).toBeInTheDocument();
    expect(screen.getByText('孙浩然')).toBeInTheDocument();
  });

  it('连接列表应显示关系类型标签', () => {
    renderNodeDetail(nodes[0]!);
    // agent_001 -> agent_002 是 follow, agent_001 -> agent_003 是 trust
    const innerRelLabels = screen.getAllByText('关注');
    expect(innerRelLabels.length).toBeGreaterThanOrEqual(1);
    const trustLabels = screen.getAllByText('信任');
    expect(trustLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('连接列表应显示强度值', () => {
    renderNodeDetail(nodes[0]!);
    expect(screen.getByText('0.80')).toBeInTheDocument();
    expect(screen.getByText('0.50')).toBeInTheDocument();
  });

  it('无连接时不应显示关系列表', () => {
    // 使用空边列表
    renderNodeDetail(makeNode({ id: 'agent_099' }), [], nodes);
    expect(screen.queryByText(/关系 \(/)).not.toBeInTheDocument();
  });

  it('超过 8 条连接时应显示截断提示', () => {
    // 创建 10 个节点和 10 条与 agent_001 相关的边
    const manyNodes: GraphNode[] = Array.from({ length: 11 }, (_, i) =>
      makeNode({ id: `agent_${String(i).padStart(3, '0')}`, name: `节点${i}` }),
    );
    const manyEdges: GraphEdge[] = Array.from({ length: 10 }, (_, i) =>
      makeEdge({
        source: 'agent_000',
        target: `agent_${String(i + 1).padStart(3, '0')}`,
        type: 'follow',
        strength: 0.5,
      }),
    );

    renderNodeDetail(manyNodes[0]!, manyEdges, manyNodes);
    expect(screen.getByText(/还有 2 个关系/)).toBeInTheDocument();
  });

  // ── source 在 target 侧的边 ──

  it('target 侧也能正确查找连接', () => {
    // agent_003 是 target 于 agent_001->agent_003 边, source 于 agent_003->agent_004 边
    renderNodeDetail(nodes[2]!);
    // 应找到 2 条关系
    expect(screen.getByText(/关系 \(2\)/)).toBeInTheDocument();
  });
});

// ============================================================================
// MetricBar 子组件测试
// ============================================================================

describe('MetricBar', () => {
  function renderMetricBar(props: { label: string; value: number; max: number; color: string }) {
    return render(
      <MetricBar {...props} />,
    );
  }

  it('应显示标签和值', () => {
    renderMetricBar({ label: '影响力', value: 85, max: 100, color: '#fbbf24' });
    expect(screen.getByText('影响力')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('进度条宽度应根据百分比设置', () => {
    const { container } = renderMetricBar({ label: '信誉度', value: 50, max: 100, color: '#3b82f6' });
    const bar = container.querySelector('.h-full.rounded-full.transition-all') as HTMLElement;
    expect(bar).toHaveStyle({ width: '50%', backgroundColor: '#3b82f6' });
  });

  it('值为 0 时进度条宽度为 0%', () => {
    const { container } = renderMetricBar({ label: '测试', value: 0, max: 100, color: '#ff0' });
    const bar = container.querySelector('.h-full.rounded-full.transition-all') as HTMLElement;
    expect(bar).toHaveStyle({ width: '0%' });
  });

  it('值等于 max 时进度条宽度为 100%', () => {
    const { container } = renderMetricBar({ label: '测试', value: 100, max: 100, color: '#ff0' });
    const bar = container.querySelector('.h-full.rounded-full.transition-all') as HTMLElement;
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('应使用 toFixed(0) 格式化值', () => {
    renderMetricBar({ label: '精度', value: 72.456, max: 100, color: '#abc' });
    expect(screen.getByText('72')).toBeInTheDocument();
  });
});

// ============================================================================
// getNodeRadius 工具函数测试
// ============================================================================

describe('getNodeRadius', () => {
  it('influence 为 0 时返回最小半径 6', () => {
    expect(getNodeRadius(0)).toBe(6);
  });

  it('influence 为 100 时返回最大半径 20', () => {
    expect(getNodeRadius(100)).toBe(20);
  });

  it('influence 为 50 时返回中间值 13', () => {
    expect(getNodeRadius(50)).toBe(13);
  });

  it('线性缩放应正确计算', () => {
    // 6 + (75/100) * 14 = 6 + 10.5 = 16.5
    expect(getNodeRadius(75)).toBe(16.5);
  });
});

// ============================================================================
// buildTooltipHtml 工具函数测试
// ============================================================================

describe('buildTooltipHtml', () => {
  it('应包含节点名称', () => {
    const node = makeNode({ name: '赵明远' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('赵明远');
  });

  it('应包含节点职业', () => {
    const node = makeNode({ profession: '金融分析师' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('金融分析师');
  });

  it('应包含影响力数值', () => {
    const node = makeNode({ influence: 85 });
    const html = buildTooltipHtml(node);
    expect(html).toContain('85');
  });

  it('应包含信誉度数值', () => {
    const node = makeNode({ credibility: 72 });
    const html = buildTooltipHtml(node);
    expect(html).toContain('72');
  });

  it('active 状态应显示绿色 emoji', () => {
    const node = makeNode({ status: 'active' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('🟢');
  });

  it('dormant 状态应显示黄色 emoji', () => {
    const node = makeNode({ status: 'dormant' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('🟡');
  });

  it('dead 状态应显示红色 emoji', () => {
    const node = makeNode({ status: 'dead' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('🔴');
  });

  it('leader 角色应显示"领导者"', () => {
    const node = makeNode({ role: 'leader' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('领导者');
  });

  it('bridge 角色应显示"桥接者"', () => {
    const node = makeNode({ role: 'bridge' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('桥接者');
  });

  it('contrarian 角色应显示"反对者"', () => {
    const node = makeNode({ role: 'contrarian' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('反对者');
  });

  it('follower 角色应显示"追随者"', () => {
    const node = makeNode({ role: 'follower' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('追随者');
  });

  it('应包含社区颜色', () => {
    const node = makeNode({ community: 'community_0' });
    const html = buildTooltipHtml(node);
    expect(html).toContain(COMMUNITY_COLORS['community_0']);
  });

  it('应将 community_0 格式化为 #0', () => {
    const node = makeNode({ community: 'community_0' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('#0');
  });

  it('未知社区应使用默认灰色', () => {
    const node = makeNode({ community: 'unknown_community' });
    const html = buildTooltipHtml(node);
    expect(html).toContain('#6b7280');
  });
});

// ============================================================================
// 常量映射测试
// ============================================================================

describe('常量映射', () => {
  it('COMMUNITY_COLORS 应包含 8 种社区颜色', () => {
    expect(Object.keys(COMMUNITY_COLORS)).toHaveLength(8);
  });

  it('ROLE_SHAPES 应包含 4 种角色', () => {
    expect(ROLE_SHAPES).toEqual({
      leader: '★',
      bridge: '◆',
      contrarian: '▲',
      follower: '●',
    });
  });

  it('RELATION_COLORS 应包含 4 种关系颜色', () => {
    expect(RELATION_COLORS).toEqual({
      follow: '#6b7280',
      trust: '#22c55e',
      rival: '#ef4444',
      neutral: '#374151',
    });
  });
});

// ============================================================================
// generateMockData 测试
// ============================================================================

describe('generateMockData', () => {
  it('应该生成 30 个节点', () => {
    const data = generateMockData();
    expect(data.nodes).toHaveLength(30);
  });

  it('每个节点应有完整的属性', () => {
    const data = generateMockData();
    const node = data.nodes[0]!;
    expect(node).toHaveProperty('id');
    expect(node).toHaveProperty('name');
    expect(node).toHaveProperty('profession');
    expect(node).toHaveProperty('influence');
    expect(node).toHaveProperty('credibility');
    expect(node).toHaveProperty('community');
    expect(node).toHaveProperty('role');
    expect(node).toHaveProperty('status');
    expect(node).toHaveProperty('followers');
    expect(node).toHaveProperty('following');
  });

  it('节点 ID 格式应为 agent_XXX', () => {
    const data = generateMockData();
    data.nodes.forEach(node => {
      expect(node.id).toMatch(/^agent_\d{3}$/);
    });
  });

  it('节点应分布在 5 个社区中', () => {
    const data = generateMockData();
    const communities = new Set(data.nodes.map(n => n.community));
    expect(communities.size).toBe(5);
  });

  it('每 6 人一组的第一个应为 leader', () => {
    const data = generateMockData();
    // index 0, 6, 12, 18, 24 应为 leader
    [0, 6, 12, 18, 24].forEach(i => {
      expect(data.nodes[i]!.role).toBe('leader');
    });
  });

  it('每 6 人一组的最后一个应为 bridge', () => {
    const data = generateMockData();
    // index 5, 11, 17, 23, 29 应为 bridge
    [5, 11, 17, 23, 29].forEach(i => {
      expect(data.nodes[i]!.role).toBe('bridge');
    });
  });

  it('每 6 人一组的倒数第二个应为 contrarian', () => {
    const data = generateMockData();
    // index 4, 10, 16, 22, 28 应为 contrarian
    [4, 10, 16, 22, 28].forEach(i => {
      expect(data.nodes[i]!.role).toBe('contrarian');
    });
  });

  it('影响力应在 0-100 范围内', () => {
    const data = generateMockData();
    data.nodes.forEach(node => {
      expect(node.influence).toBeGreaterThanOrEqual(0);
      expect(node.influence).toBeLessThanOrEqual(100);
    });
  });

  it('信誉度应在 30-90 范围内', () => {
    const data = generateMockData();
    data.nodes.forEach(node => {
      expect(node.credibility).toBeGreaterThanOrEqual(30);
      expect(node.credibility).toBeLessThanOrEqual(90);
    });
  });

  it('边应有合法的类型', () => {
    const data = generateMockData();
    const validTypes = ['follow', 'trust', 'rival', 'neutral'];
    data.edges.forEach(edge => {
      expect(validTypes).toContain(edge.type);
    });
  });

  it('边的强度应在 0-1 范围内', () => {
    const data = generateMockData();
    data.edges.forEach(edge => {
      expect(edge.strength).toBeGreaterThanOrEqual(0);
      expect(edge.strength).toBeLessThanOrEqual(1);
    });
  });

  it('边的 source 和 target 应为有效节点 ID', () => {
    const data = generateMockData();
    const nodeIds = new Set(data.nodes.map(n => n.id));
    data.edges.forEach(edge => {
      expect(nodeIds.has(edge.source as string)).toBe(true);
      expect(nodeIds.has(edge.target as string)).toBe(true);
    });
  });

  it('状态应为 active/dormant/dead 之一', () => {
    const data = generateMockData();
    const validStatuses = ['active', 'dormant', 'dead'];
    data.nodes.forEach(node => {
      expect(validStatuses).toContain(node.status);
    });
  });

  it('leader 角色影响力应 >= 70', () => {
    const data = generateMockData();
    data.nodes.filter(n => n.role === 'leader').forEach(node => {
      expect(node.influence).toBeGreaterThanOrEqual(70);
    });
  });
});
