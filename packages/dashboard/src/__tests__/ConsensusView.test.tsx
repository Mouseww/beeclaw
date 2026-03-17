// ============================================================================
// BeeClaw Dashboard — ConsensusView 页面增强测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConsensusView } from '../pages/ConsensusView';
import { usePolling } from '../hooks/usePolling';
import type { ConsensusResponse, ConsensusSignal } from '../types';

// Mock usePolling
vi.mock('../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}));

const mockUsePolling = usePolling as ReturnType<typeof vi.fn>;

function makeSignal(overrides: Partial<ConsensusSignal> = {}): ConsensusSignal {
  return {
    topic: 'BTC 走势',
    tick: 42,
    sentimentDistribution: { bullish: 60, bearish: 25, neutral: 15 },
    intensity: 0.75,
    consensus: 0.65,
    trend: 'strengthening',
    topArguments: [],
    alerts: [],
    ...overrides,
  };
}

function makeConsensusData(overrides: Partial<ConsensusResponse> = {}): ConsensusResponse {
  return {
    topics: ['BTC 走势', 'A股大盘'],
    latest: [makeSignal()],
    ...overrides,
  };
}

function renderConsensusView() {
  return render(
    <MemoryRouter>
      <ConsensusView />
    </MemoryRouter>,
  );
}

describe('ConsensusView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 基本渲染 ──

  it('应该渲染页面标题和描述', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('共识引擎')).toBeInTheDocument();
    expect(screen.getByText('群体情绪聚合与趋势信号')).toBeInTheDocument();
  });

  // ── 空状态 ──

  it('无数据时应显示空状态', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('暂无共识信号，等待引擎运行...')).toBeInTheDocument();
  });

  it('latest 数组为空时应显示空状态', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({ latest: [], topics: [] }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('暂无共识信号，等待引擎运行...')).toBeInTheDocument();
  });

  // ── 加载状态 ──

  it('loading 且无数据时应显示骨架屏', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: true,
      refresh: vi.fn(),
    });

    const { container } = renderConsensusView();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // ── 错误状态 ──

  it('错误时应显示错误信息和重试按钮', () => {
    const refresh = vi.fn();
    mockUsePolling.mockReturnValue({
      data: null,
      error: 'Network Error',
      loading: false,
      refresh,
    });

    renderConsensusView();
    expect(screen.getByText('Network Error')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  // ── 话题列表 ──

  it('有话题数据时应渲染活跃话题标签', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({ topics: ['BTC 走势', 'A股大盘', '美联储利率'] }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('活跃话题')).toBeInTheDocument();
    // "BTC 走势" 同时出现在话题标签和信号卡片中，使用 getAllByText
    expect(screen.getAllByText('BTC 走势').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('A股大盘').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('美联储利率')).toBeInTheDocument();
  });

  it('topics 为空时不应渲染活跃话题卡片', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({ topics: [] }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.queryByText('活跃话题')).not.toBeInTheDocument();
  });

  // ── 共识信号卡片 ──

  it('有数据时应渲染信号卡片的话题名和 Tick', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    // 信号卡片中的话题（注意 "BTC 走势" 同时出现在话题列表和信号卡片中）
    expect(screen.getAllByText('BTC 走势').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Tick #42')).toBeInTheDocument();
  });

  it('应渲染趋势 Badge', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({ trend: 'strengthening' })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    // TrendBadge 应出现，"strengthening" 对应 "增强"
    expect(screen.getByText('增强')).toBeInTheDocument();
  });

  it('应渲染指标框（情绪强度、共识度、看多比例、看空比例）', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({
          intensity: 0.75,
          consensus: 0.65,
          sentimentDistribution: { bullish: 60, bearish: 25, neutral: 15 },
        })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('情绪强度')).toBeInTheDocument();
    expect(screen.getByText('共识度')).toBeInTheDocument();
    expect(screen.getByText('看多比例')).toBeInTheDocument();
    expect(screen.getByText('看空比例')).toBeInTheDocument();
    // intensity 0.75 → 显示 "0.8" (toFixed(1))
    expect(screen.getByText('0.8')).toBeInTheDocument();
    // consensus 0.65 → 显示 "0.7" (toFixed(1))
    expect(screen.getByText('0.7')).toBeInTheDocument();
    // 看多比例 60 → 显示 "60%"
    expect(screen.getByText('60%')).toBeInTheDocument();
    // 看空比例 25 → 显示 "25%"
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  // ── 关键论点 ──

  it('有关键论点时应渲染论点列表', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({
          topArguments: [
            { position: '减半效应利好', supporters: 15, avgCredibility: 72.5 },
            { position: '监管风险加剧', supporters: 8, avgCredibility: 65.3 },
          ],
        })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('关键论点')).toBeInTheDocument();
    expect(screen.getByText('减半效应利好')).toBeInTheDocument();
    expect(screen.getByText('15 支持者')).toBeInTheDocument();
    expect(screen.getByText('信誉 72.5')).toBeInTheDocument();
    expect(screen.getByText('监管风险加剧')).toBeInTheDocument();
    expect(screen.getByText('8 支持者')).toBeInTheDocument();
  });

  it('无关键论点时不应渲染论点区域', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({ topArguments: [] })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.queryByText('关键论点')).not.toBeInTheDocument();
  });

  // ── 预警信号 ──

  it('有预警信号时应渲染预警列表', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({
          alerts: [
            {
              type: 'sentiment_reversal',
              description: '情绪正在逆转',
              confidence: 0.85,
              triggeredBy: ['agent-1'],
            },
          ],
        })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('预警信号')).toBeInTheDocument();
    expect(screen.getByText('情绪正在逆转')).toBeInTheDocument();
    expect(screen.getByText('sentiment_reversal')).toBeInTheDocument();
    expect(screen.getByText('置信度 85%')).toBeInTheDocument();
  });

  it('无预警时不应渲染预警区域', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({ alerts: [] })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.queryByText('预警信号')).not.toBeInTheDocument();
  });

  // ── 受影响标的 ──

  it('有标的情绪数据时应渲染受影响标的', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({
          // 使用和指标框不冲突的数值
          sentimentDistribution: { bullish: 55, bearish: 30, neutral: 15 },
          targetSentiments: [
            { name: 'BTC', category: 'crypto', bullish: 30, bearish: 10, neutral: 10, avgStance: 0.5, avgConfidence: 0.7 },
          ],
        })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.getByText('受影响标的')).toBeInTheDocument();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('₿')).toBeInTheDocument(); // crypto 图标
    expect(screen.getByText('(50人)')).toBeInTheDocument();
  });

  it('无标的数据时不应渲染受影响标的区域', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [makeSignal({ targetSentiments: undefined })],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    expect(screen.queryByText('受影响标的')).not.toBeInTheDocument();
  });

  // ── 多信号渲染 ──

  it('多个信号应全部渲染', () => {
    mockUsePolling.mockReturnValue({
      data: makeConsensusData({
        latest: [
          makeSignal({ topic: 'BTC走势', tick: 10 }),
          makeSignal({ topic: 'A股大盘', tick: 11 }),
          makeSignal({ topic: '黄金价格', tick: 12 }),
        ],
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderConsensusView();
    // 话题名称同时出现在 topics 列表和信号卡片中
    expect(screen.getAllByText('BTC走势').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('A股大盘').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('黄金价格').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Tick #10')).toBeInTheDocument();
    expect(screen.getByText('Tick #11')).toBeInTheDocument();
    expect(screen.getByText('Tick #12')).toBeInTheDocument();
  });
});
