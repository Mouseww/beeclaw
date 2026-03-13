// ============================================================================
// BeeClaw Dashboard — Pages 页面组件渲染测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorldOverview } from '../pages/WorldOverview';
import { AgentList } from '../pages/AgentList';
import { EventFeed } from '../pages/EventFeed';
import { ConsensusView } from '../pages/ConsensusView';
import { SocialGraphView } from '../pages/SocialGraphView';

// ── 通用 Mock ──

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    state: 'disconnected' as const,
    lastTick: null,
    lastConsensus: [],
    tickHistory: [],
  }),
}));

// 默认 usePolling 返回空数据
const mockPolling = {
  data: null,
  error: null,
  loading: false,
  refresh: vi.fn(),
};

vi.mock('../hooks/usePolling', () => ({
  usePolling: vi.fn(() => mockPolling),
}));

// Mock D3
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

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ── WorldOverview ──

describe('WorldOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染页面标题', () => {
    renderInRouter(<WorldOverview />);
    expect(screen.getByText('世界总览')).toBeInTheDocument();
    expect(screen.getByText('BeeClaw 仿真世界实时状态')).toBeInTheDocument();
  });

  it('无数据时应显示空白情绪提示', () => {
    renderInRouter(<WorldOverview />);
    expect(screen.getByText('暂无情绪数据')).toBeInTheDocument();
  });

  it('无历史记录时应显示提示', () => {
    renderInRouter(<WorldOverview />);
    expect(screen.getByText('暂无历史记录')).toBeInTheDocument();
  });
});

// ── AgentList ──

describe('AgentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染页面标题', () => {
    renderInRouter(<AgentList />);
    expect(screen.getByText('Agent 列表')).toBeInTheDocument();
  });

  it('无数据时应显示空状态', () => {
    renderInRouter(<AgentList />);
    expect(screen.getByText('暂无 Agent，等待世界引擎启动...')).toBeInTheDocument();
  });
});

// ── EventFeed ──

describe('EventFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染页面标题', () => {
    renderInRouter(<EventFeed />);
    expect(screen.getByText('事件流')).toBeInTheDocument();
    expect(screen.getByText('实时事件和 Agent 响应')).toBeInTheDocument();
  });

  it('应该渲染事件注入表单', () => {
    renderInRouter(<EventFeed />);
    expect(screen.getByText('注入新事件')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('事件标题...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('事件详情...')).toBeInTheDocument();
  });

  it('无事件流数据时应显示等待提示', () => {
    renderInRouter(<EventFeed />);
    expect(screen.getByText('等待事件流数据...（需要 WebSocket 连接）')).toBeInTheDocument();
  });
});

// ── ConsensusView ──

describe('ConsensusView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染页面标题', () => {
    renderInRouter(<ConsensusView />);
    expect(screen.getByText('共识引擎')).toBeInTheDocument();
    expect(screen.getByText('群体情绪聚合与趋势信号')).toBeInTheDocument();
  });

  it('无数据时应显示空状态', () => {
    renderInRouter(<ConsensusView />);
    expect(screen.getByText('暂无共识信号，等待引擎运行...')).toBeInTheDocument();
  });
});

// ── SocialGraphView ──

describe('SocialGraphView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染页面标题', () => {
    renderInRouter(<SocialGraphView />);
    expect(screen.getByText('社交网络')).toBeInTheDocument();
  });

  it('应该显示 Mock 数据标签', () => {
    renderInRouter(<SocialGraphView />);
    expect(screen.getByText('Mock 数据')).toBeInTheDocument();
  });

  it('应该渲染统计卡片', () => {
    renderInRouter(<SocialGraphView />);
    expect(screen.getByText('节点数')).toBeInTheDocument();
    expect(screen.getByText('关系边')).toBeInTheDocument();
    expect(screen.getByText('社区数')).toBeInTheDocument();
    expect(screen.getByText('平均影响力')).toBeInTheDocument();
  });

  it('应该渲染社区过滤器按钮', () => {
    renderInRouter(<SocialGraphView />);
    expect(screen.getByText('全部社区')).toBeInTheDocument();
  });

  it('应该渲染角色分布面板', () => {
    renderInRouter(<SocialGraphView />);
    expect(screen.getByText('角色分布')).toBeInTheDocument();
    expect(screen.getByText('关系类型')).toBeInTheDocument();
  });

  it('未选中节点时应显示提示文字', () => {
    renderInRouter(<SocialGraphView />);
    expect(screen.getByText('节点详情')).toBeInTheDocument();
  });
});
