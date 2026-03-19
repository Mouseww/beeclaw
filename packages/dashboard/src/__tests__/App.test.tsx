// ============================================================================
// BeeClaw Dashboard — App.tsx 路由渲染测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('首页应该显示宣传主页', async () => {
    renderWithRouter('/');
    expect(await screen.findByText('把 AI 变成真正能协作、能执行、能持续工作的数字员工。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入 BeeClaw 控制台' })).toHaveAttribute('href', '/dashboard');
  });

  it('dashboard 路由应该渲染 Header 和 Sidebar', async () => {
    renderWithRouter('/dashboard');
    expect(screen.getByText('Bee')).toBeInTheDocument();
    expect(screen.getByText('Claw')).toBeInTheDocument();
    const sidebar = document.querySelector('aside')!;
    expect(within(sidebar).getByText('世界总览')).toBeInTheDocument();
    expect(within(sidebar).getByText('推演预测')).toBeInTheDocument();
    expect(within(sidebar).getByText('事件流')).toBeInTheDocument();
    expect(within(sidebar).getByText('共识引擎')).toBeInTheDocument();
    expect(within(sidebar).getByText('社交网络')).toBeInTheDocument();
    expect(within(sidebar).getByText('查看宣传主页')).toBeInTheDocument();
  });

  it('"/dashboard" 路由应该显示世界总览页面', async () => {
    renderWithRouter('/dashboard');
    expect(await screen.findByText('BeeClaw 仿真世界实时状态')).toBeInTheDocument();
  });

  it('"/agents" 路由应该显示 Agent 列表页面', async () => {
    renderWithRouter('/agents');
    expect(await screen.findByText('暂无 Agent，等待世界引擎启动...')).toBeInTheDocument();
  });

  it('"/forecast" 路由应该显示推演预测页面', async () => {
    renderWithRouter('/forecast');
    expect(await screen.findByText('输入一个你想预测的事情')).toBeInTheDocument();
  });

  it('"/consensus" 路由应该显示共识引擎页面', async () => {
    renderWithRouter('/consensus');
    expect(await screen.findByText('群体情绪聚合与趋势信号')).toBeInTheDocument();
  });

  it('"/social-graph" 路由应该显示社交网络页面', async () => {
    renderWithRouter('/social-graph');
    expect(await screen.findByText('Mock 数据')).toBeInTheDocument();
  });

  it('未知路由应该重定向到 dashboard', async () => {
    renderWithRouter('/unknown-route');
    expect(await screen.findByText('BeeClaw 仿真世界实时状态')).toBeInTheDocument();
  });

  it('"/agents/:id" 路由应该显示 Agent 详情页面', async () => {
    renderWithRouter('/agents/test-agent-123');
    expect(await screen.findByText('Agent 未找到')).toBeInTheDocument();
  });

  it('Header 应该显示 WebSocket 断开状态', async () => {
    renderWithRouter('/dashboard');
    expect(screen.getByText('已断开')).toBeInTheDocument();
    expect(screen.getByText('Tick #0')).toBeInTheDocument();
  });
});
