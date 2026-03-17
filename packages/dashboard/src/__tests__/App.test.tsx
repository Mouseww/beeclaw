// ============================================================================
// BeeClaw Dashboard — App.tsx 路由渲染测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';

// Mock useWebSocket — 避免真实 WebSocket 连接
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    state: 'disconnected' as const,
    lastTick: null,
    lastConsensus: [],
    tickHistory: [],
  }),
}));

// Mock usePolling — 避免真实 API 调用
vi.mock('../hooks/usePolling', () => ({
  usePolling: () => ({
    data: null,
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
}));

// Mock D3（SocialGraphView 依赖）
vi.mock('d3', () => ({
  select: vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const proxy = new Proxy(chain, {
      get: () => vi.fn().mockReturnValue(proxy),
    }) as unknown;
    return proxy;
  }),
  forceSimulation: vi.fn(() => {
    const sim: Record<string, unknown> = {};
    const proxy = new Proxy(sim, {
      get: (_t, prop) => {
        if (prop === 'stop') return vi.fn();
        return vi.fn().mockReturnValue(proxy);
      },
    }) as unknown;
    return proxy;
  }),
  forceLink: vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const proxy = new Proxy(chain, {
      get: () => vi.fn().mockReturnValue(proxy),
    }) as unknown;
    return proxy;
  }),
  forceManyBody: vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const proxy = new Proxy(chain, {
      get: () => vi.fn().mockReturnValue(proxy),
    }) as unknown;
    return proxy;
  }),
  forceCenter: vi.fn(),
  forceCollide: vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const proxy = new Proxy(chain, {
      get: () => vi.fn().mockReturnValue(proxy),
    }) as unknown;
    return proxy;
  }),
  forceX: vi.fn(() => ({ strength: vi.fn() })),
  forceY: vi.fn(() => ({ strength: vi.fn() })),
  zoom: vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const proxy = new Proxy(chain, {
      get: () => vi.fn().mockReturnValue(proxy),
    }) as unknown;
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
    const chain: Record<string, unknown> = {};
    const proxy = new Proxy(chain, {
      get: () => vi.fn().mockReturnValue(proxy),
    }) as unknown;
    return proxy;
  }),
  color: vi.fn(() => ({
    darker: vi.fn(() => ({ formatHex: () => '#333333' })),
    brighter: vi.fn(() => ({ formatHex: () => '#999999' })),
  })),
}));

function renderWithRouter(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染 Header 和 Sidebar', async () => {
    renderWithRouter();
    // Header 应包含 BeeClaw logo
    expect(screen.getByText('Bee')).toBeInTheDocument();
    expect(screen.getByText('Claw')).toBeInTheDocument();
    // Sidebar 应包含导航链接（使用 getAllByText 因为页面标题可能重复）
    const sidebar = document.querySelector('aside')!;
    expect(within(sidebar).getByText('世界总览')).toBeInTheDocument();
    expect(within(sidebar).getByText('Agent 列表')).toBeInTheDocument();
    expect(within(sidebar).getByText('事件流')).toBeInTheDocument();
    expect(within(sidebar).getByText('共识引擎')).toBeInTheDocument();
    expect(within(sidebar).getByText('社交网络')).toBeInTheDocument();
  });

  it('默认路由 "/" 应该显示世界总览页面', async () => {
    renderWithRouter('/');
    // 页面主内容区的标题（lazy 加载需等待异步渲染）
    expect(await screen.findByText('BeeClaw 仿真世界实时状态')).toBeInTheDocument();
  });

  it('"/agents" 路由应该显示 Agent 列表页面', async () => {
    renderWithRouter('/agents');
    // Agent 列表页有空状态提示
    expect(await screen.findByText('暂无 Agent，等待世界引擎启动...')).toBeInTheDocument();
  });

  it('"/events" 路由应该显示事件流页面', async () => {
    renderWithRouter('/events');
    expect(await screen.findByText(/实时事件和 Agent 响应/)).toBeInTheDocument();
  });

  it('"/consensus" 路由应该显示共识引擎页面', async () => {
    renderWithRouter('/consensus');
    expect(await screen.findByText('群体情绪聚合与趋势信号')).toBeInTheDocument();
  });

  it('"/social-graph" 路由应该显示社交网络页面', async () => {
    renderWithRouter('/social-graph');
    // 社交网络页面有 Mock 数据标签
    expect(await screen.findByText('Mock 数据')).toBeInTheDocument();
  });

  it('未知路由应该重定向到首页', async () => {
    renderWithRouter('/unknown-route');
    expect(await screen.findByText('BeeClaw 仿真世界实时状态')).toBeInTheDocument();
  });

  it('"/agents/:id" 路由应该显示 Agent 详情页面', async () => {
    renderWithRouter('/agents/test-agent-123');
    // usePolling 返回 null → 显示 Agent 未找到
    expect(await screen.findByText('Agent 未找到')).toBeInTheDocument();
  });

  it('Header 应该显示 WebSocket 断开状态', async () => {
    renderWithRouter();
    expect(screen.getByText('已断开')).toBeInTheDocument();
    expect(screen.getByText('Tick #0')).toBeInTheDocument();
  });
});
