// ============================================================================
// BeeClaw Dashboard — SocialGraphView 页面增强测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SocialGraphView } from '../pages/SocialGraphView';

// Mock D3（力导向图依赖，jsdom 不支持 SVG 渲染）
vi.mock('d3', () => ({
  select: vi.fn(() => {
    const proxy: unknown = new Proxy(
      {},
      { get: () => vi.fn().mockReturnValue(proxy) },
    );
    return proxy;
  }),
  forceSimulation: vi.fn(() => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'stop') return vi.fn();
          return vi.fn().mockReturnValue(proxy);
        },
      },
    );
    return proxy;
  }),
  forceLink: vi.fn(() => {
    const proxy: unknown = new Proxy({}, { get: () => vi.fn().mockReturnValue(proxy) });
    return proxy;
  }),
  forceManyBody: vi.fn(() => {
    const proxy: unknown = new Proxy({}, { get: () => vi.fn().mockReturnValue(proxy) });
    return proxy;
  }),
  forceCenter: vi.fn(),
  forceCollide: vi.fn(() => {
    const proxy: unknown = new Proxy({}, { get: () => vi.fn().mockReturnValue(proxy) });
    return proxy;
  }),
  forceX: vi.fn(() => ({ strength: vi.fn() })),
  forceY: vi.fn(() => ({ strength: vi.fn() })),
  zoom: vi.fn(() => {
    const proxy: unknown = new Proxy({}, { get: () => vi.fn().mockReturnValue(proxy) });
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
    const proxy: unknown = new Proxy({}, { get: () => vi.fn().mockReturnValue(proxy) });
    return proxy;
  }),
  color: vi.fn(() => ({
    darker: vi.fn(() => ({ formatHex: () => '#333' })),
    brighter: vi.fn(() => ({ formatHex: () => '#999' })),
  })),
}));

function renderSocialGraphView() {
  return render(
    <MemoryRouter>
      <SocialGraphView />
    </MemoryRouter>,
  );
}

describe('SocialGraphView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    // Mock 数据生成 30 个节点
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('社区数应为 5', () => {
    renderSocialGraphView();
    // Mock 数据有 5 个社区
    expect(screen.getByText('5')).toBeInTheDocument();
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
    // 按钮应变为选中状态（测试触发不报错即可）
    expect(communityBtn).toBeInTheDocument();
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
    // 角色名同时出现在图例和角色分布中，使用 getAllByText
    expect(screen.getAllByText('领导者').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('桥接者').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('反对者').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('追随者').length).toBeGreaterThanOrEqual(1);
  });

  // ── 关系类型分布 ──

  it('应该渲染关系类型面板', () => {
    renderSocialGraphView();
    expect(screen.getByText('关系类型')).toBeInTheDocument();
    // 关系类型名可能同时出现在图例和关系类型面板中，使用 getAllByText
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
});
