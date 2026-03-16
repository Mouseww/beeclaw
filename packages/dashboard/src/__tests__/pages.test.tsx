// ============================================================================
// BeeClaw Dashboard — Pages 页面组件渲染测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorldOverview } from '../pages/WorldOverview';
import { AgentList } from '../pages/AgentList';
import { AgentDetail } from '../pages/AgentDetail';
import { EventFeed } from '../pages/EventFeed';
import { ConsensusView } from '../pages/ConsensusView';
import { SocialGraphView } from '../pages/SocialGraphView';
import { usePolling } from '../hooks/usePolling';

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
    expect(screen.getByText(/实时事件和 Agent 响应/)).toBeInTheDocument();
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

// ── AgentDetail ──

describe('AgentDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderAgentDetail() {
    return render(
      <MemoryRouter initialEntries={['/agents/test-agent-id']}>
        <Routes>
          <Route path="/agents/:id" element={<AgentDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('无数据时应显示加载骨架或 Agent 未找到', () => {
    renderAgentDetail();
    // usePolling 返回 data=null, loading=false → 应显示 Agent 未找到
    expect(screen.getByText('Agent 未找到')).toBeInTheDocument();
  });

  it('有数据时应渲染 Agent 基本信息', () => {
    (usePolling as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: 'agent-001',
        name: '张分析师',
        persona: {
          background: '资深金融分析师',
          profession: '金融分析师',
          traits: {
            riskTolerance: 0.7,
            informationSensitivity: 0.8,
            conformity: 0.3,
            emotionality: 0.4,
            analyticalDepth: 0.9,
          },
          expertise: ['宏观经济', '股票分析'],
          biases: ['确认偏误'],
          communicationStyle: '专业严谨',
        },
        memory: {
          shortTerm: [
            { tick: 5, type: 'event', content: '央行宣布降息', importance: 0.9, emotionalImpact: 0.3 },
          ],
          longTerm: [],
          opinions: {
            'BTC走势': {
              topic: 'BTC走势',
              stance: 0.6,
              confidence: 0.8,
              reasoning: '技术面看涨',
              lastUpdatedTick: 10,
            },
          },
          predictions: [],
        },
        relationships: [],
        followers: ['agent-002', 'agent-003'],
        following: ['agent-004'],
        influence: 75,
        status: 'active' as const,
        credibility: 80,
        spawnedAtTick: 1,
        lastActiveTick: 10,
        modelTier: 'strong' as const,
        modelId: 'strong-default',
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();

    // 基本信息
    expect(screen.getByText('张分析师')).toBeInTheDocument();
    expect(screen.getAllByText(/金融分析师/).length).toBeGreaterThanOrEqual(1);

    // 人格画像
    expect(screen.getByText('人格画像')).toBeInTheDocument();
    expect(screen.getByText('资深金融分析师')).toBeInTheDocument();
    expect(screen.getByText('专业严谨')).toBeInTheDocument();
    expect(screen.getByText('宏观经济')).toBeInTheDocument();
    expect(screen.getByText('股票分析')).toBeInTheDocument();
    expect(screen.getByText('确认偏误')).toBeInTheDocument();

    // 性格特征
    expect(screen.getByText('性格特征')).toBeInTheDocument();
    expect(screen.getByText('风险偏好')).toBeInTheDocument();
    expect(screen.getByText('分析深度')).toBeInTheDocument();

    // 观点立场
    expect(screen.getByText('观点立场')).toBeInTheDocument();
    expect(screen.getByText('BTC走势')).toBeInTheDocument();
    expect(screen.getByText('技术面看涨')).toBeInTheDocument();

    // 短期记忆
    expect(screen.getByText('短期记忆')).toBeInTheDocument();
    expect(screen.getByText('央行宣布降息')).toBeInTheDocument();

    // 统计
    expect(screen.getByText('75')).toBeInTheDocument();   // 影响力
    expect(screen.getByText('80')).toBeInTheDocument();   // 信誉度
    expect(screen.getByText('2')).toBeInTheDocument();    // 粉丝数
    expect(screen.getByText('1')).toBeInTheDocument();    // 关注数

    // 返回链接
    expect(screen.getByText('← 返回 Agent 列表')).toBeInTheDocument();
  });

  it('错误时应显示错误状态', () => {
    (usePolling as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      error: 'Agent not found',
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();

    expect(screen.getByText('Agent not found')).toBeInTheDocument();
  });

  it('无观点时应显示暂无观点记录', () => {
    (usePolling as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: 'agent-002',
        name: '李散户',
        persona: {
          background: '普通投资者',
          profession: '散户',
          traits: { riskTolerance: 0.5, informationSensitivity: 0.5, conformity: 0.5, emotionality: 0.5, analyticalDepth: 0.5 },
          expertise: [],
          biases: [],
          communicationStyle: '随意',
        },
        memory: { shortTerm: [], longTerm: [], opinions: {}, predictions: [] },
        relationships: [],
        followers: [],
        following: [],
        influence: 10,
        status: 'active' as const,
        credibility: 50,
        spawnedAtTick: 1,
        lastActiveTick: 5,
        modelTier: 'local' as const,
        modelId: 'local-default',
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();

    expect(screen.getByText('暂无观点记录')).toBeInTheDocument();
    expect(screen.getByText('暂无记忆')).toBeInTheDocument();
  });
});
