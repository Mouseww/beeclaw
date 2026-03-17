// ============================================================================
// BeeClaw Dashboard — WorldOverview 页面增强测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorldOverview } from '../pages/WorldOverview';
import { usePolling } from '../hooks/usePolling';
import type { ServerStatus, HistoryResponse, TickResult } from '../types';

// Mock usePolling — 使用 call index 区分两次调用
vi.mock('../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}));

// Mock 图表组件（避免 recharts 依赖问题）
vi.mock('../components/charts/SentimentTrendChart', () => ({
  SentimentTrendChart: () => <div data-testid="sentiment-trend-chart">Mock SentimentTrendChart</div>,
}));

vi.mock('../components/charts/AgentActivityChart', () => ({
  AgentActivityChart: () => <div data-testid="agent-activity-chart">Mock AgentActivityChart</div>,
}));

const mockUsePolling = usePolling as ReturnType<typeof vi.fn>;

function makeStatus(overrides: Partial<ServerStatus> = {}): ServerStatus {
  return {
    tick: 42,
    agentCount: 100,
    activeAgents: 80,
    activeEvents: 5,
    wsConnections: 3,
    running: true,
    uptime: 3600,
    sentiment: {
      bullish: 45,
      bearish: 30,
      neutral: 25,
      topicBreakdown: [],
      targetBreakdown: [],
    },
    lastTick: null,
    ...overrides,
  };
}

function makeTick(overrides: Partial<TickResult> = {}): TickResult {
  return {
    tick: 42,
    eventsProcessed: 3,
    responsesCollected: 10,
    agentsActivated: 8,
    signals: 2,
    durationMs: 150,
    timestamp: '2025-01-01T12:00:00Z',
    events: [],
    responses: [],
    ...overrides,
  };
}

function makeHistoryData(ticks: TickResult[] = []): HistoryResponse {
  return {
    history: ticks,
    source: 'memory',
  };
}

/**
 * 设置 usePolling mock 返回值。
 * WorldOverview 调用 usePolling 两次：
 *   1. fetchStatus (3000ms)
 *   2. fetchHistory (5000ms)
 */
function setupPollingMock(
  statusData: ServerStatus | null = null,
  historyData: HistoryResponse | null = null,
  opts: {
    statusError?: string | null;
    statusLoading?: boolean;
    historyError?: string | null;
    historyLoading?: boolean;
  } = {},
) {
  let callIndex = 0;
  mockUsePolling.mockImplementation(() => {
    const idx = callIndex++;
    if (idx === 0) {
      // First call: fetchStatus
      return {
        data: statusData,
        error: opts.statusError ?? null,
        loading: opts.statusLoading ?? false,
        refresh: vi.fn(),
      };
    }
    // Second call: fetchHistory
    return {
      data: historyData,
      error: opts.historyError ?? null,
      loading: opts.historyLoading ?? false,
      refresh: vi.fn(),
    };
  });
}

function renderWorldOverview() {
  return render(
    <MemoryRouter>
      <WorldOverview />
    </MemoryRouter>,
  );
}

describe('WorldOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 基本渲染 ──

  it('应渲染页面标题和描述', () => {
    setupPollingMock();
    renderWorldOverview();
    expect(screen.getByText('世界总览')).toBeInTheDocument();
    expect(screen.getByText('BeeClaw 仿真世界实时状态')).toBeInTheDocument();
  });

  // ── 错误状态 ──

  it('错误时应显示错误信息和重试按钮', () => {
    setupPollingMock(null, null, { statusError: 'Server Error' });
    renderWorldOverview();
    expect(screen.getByText('Server Error')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  // ── 加载状态 ──

  it('loading 时应显示骨架屏', () => {
    setupPollingMock(null, null, { statusLoading: true });
    const { container } = renderWorldOverview();
    // CardSkeleton 会渲染骨架占位
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // ── 统计卡片 ──

  it('有状态数据时应渲染 4 个统计卡片', () => {
    setupPollingMock(makeStatus({
      tick: 42,
      agentCount: 100,
      activeEvents: 5,
      wsConnections: 3,
    }));
    renderWorldOverview();

    expect(screen.getByText('当前 Tick')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Agent 总数')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('活跃事件')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('WebSocket 连接')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('运行中显示 "运行中"，暂停显示 "已暂停"', () => {
    setupPollingMock(makeStatus({ running: true }));
    renderWorldOverview();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('暂停状态应显示 "已暂停"', () => {
    setupPollingMock(makeStatus({ running: false }));
    renderWorldOverview();
    expect(screen.getByText('已暂停')).toBeInTheDocument();
  });

  it('应渲染运行时间', () => {
    setupPollingMock(makeStatus({ uptime: 7200 }));
    renderWorldOverview();
    expect(screen.getByText('运行 2h 0m')).toBeInTheDocument();
  });

  // ── 全局情绪 ──

  it('有情绪数据时应渲染情绪分布', () => {
    setupPollingMock(makeStatus({
      sentiment: {
        bullish: 45,
        bearish: 30,
        neutral: 25,
        topicBreakdown: [],
      },
    }));
    renderWorldOverview();

    expect(screen.getByText('全局情绪分布')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('看多')).toBeInTheDocument();
    expect(screen.getByText('中立')).toBeInTheDocument();
    expect(screen.getByText('看空')).toBeInTheDocument();
  });

  it('无情绪数据时应显示暂无情绪数据', () => {
    setupPollingMock(makeStatus({
      sentiment: {
        bullish: 0,
        bearish: 0,
        neutral: 0,
        topicBreakdown: [],
      },
    }));
    renderWorldOverview();
    expect(screen.getByText('暂无情绪数据')).toBeInTheDocument();
  });

  // ── 话题分布 ──

  it('有话题情绪时应渲染话题分布', () => {
    setupPollingMock(makeStatus({
      sentiment: {
        bullish: 45,
        bearish: 30,
        neutral: 25,
        topicBreakdown: [
          { topic: 'BTC走势', bullish: 20, bearish: 5, neutral: 5, tick: 1 },
          { topic: 'A股大盘', bullish: 10, bearish: 15, neutral: 10, tick: 1 },
        ],
      },
    }));
    renderWorldOverview();

    expect(screen.getByText('各话题情绪')).toBeInTheDocument();
    expect(screen.getByText('BTC走势')).toBeInTheDocument();
    expect(screen.getByText('A股大盘')).toBeInTheDocument();
  });

  // ── 最新 Tick 结果 ──

  it('有 lastTick 时应渲染 Tick 结果', () => {
    setupPollingMock(makeStatus({
      lastTick: makeTick({
        tick: 42,
        eventsProcessed: 3,
        responsesCollected: 10,
        durationMs: 150,
      }),
    }));
    renderWorldOverview();

    expect(screen.getByText('最新 Tick 结果')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  it('无 lastTick 时应显示等待提示', () => {
    setupPollingMock(makeStatus({ lastTick: null }));
    renderWorldOverview();
    expect(screen.getByText('等待第一个 Tick...')).toBeInTheDocument();
  });

  it('Tick 包含事件列表时应渲染事件', () => {
    setupPollingMock(makeStatus({
      lastTick: makeTick({
        events: [
          { id: 'e1', title: '央行降息', category: 'finance', importance: 0.9 },
          { id: 'e2', title: 'AI 突破', category: 'tech', importance: 0.7 },
        ],
      }),
    }));
    renderWorldOverview();

    expect(screen.getByText('事件列表')).toBeInTheDocument();
    expect(screen.getByText('央行降息')).toBeInTheDocument();
    expect(screen.getByText('AI 突破')).toBeInTheDocument();
  });

  // ── 标的情绪分布 ──

  it('有标的情绪数据时应渲染标的分布', () => {
    setupPollingMock(makeStatus({
      sentiment: {
        bullish: 45,
        bearish: 30,
        neutral: 25,
        topicBreakdown: [],
        targetBreakdown: [
          { name: 'BTC', category: 'crypto', bullish: 30, bearish: 10, neutral: 10, avgStance: 0.5, avgConfidence: 0.7 },
        ],
      },
    }));
    renderWorldOverview();

    expect(screen.getByText('标的情绪分布')).toBeInTheDocument();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('₿')).toBeInTheDocument(); // crypto icon
  });

  // ── Tick 历史表格 ──

  it('有历史数据时应渲染历史表格', () => {
    setupPollingMock(
      makeStatus(),
      makeHistoryData([
        makeTick({ tick: 1, eventsProcessed: 2, responsesCollected: 5, agentsActivated: 4, durationMs: 100 }),
        makeTick({ tick: 2, eventsProcessed: 3, responsesCollected: 8, agentsActivated: 6, durationMs: 200 }),
      ]),
    );
    renderWorldOverview();

    expect(screen.getByText('Tick 历史记录')).toBeInTheDocument();
    // 表头
    expect(screen.getByText('Tick')).toBeInTheDocument();
    expect(screen.getByText('时间')).toBeInTheDocument();
    expect(screen.getByText('事件')).toBeInTheDocument();
    expect(screen.getByText('响应')).toBeInTheDocument();
    expect(screen.getByText('激活 Agent')).toBeInTheDocument();
    expect(screen.getByText('耗时')).toBeInTheDocument();
    // 数据行
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('100ms')).toBeInTheDocument();
    expect(screen.getByText('200ms')).toBeInTheDocument();
  });

  it('无历史数据时应显示暂无历史记录', () => {
    setupPollingMock(makeStatus(), null);
    renderWorldOverview();
    expect(screen.getByText('暂无历史记录')).toBeInTheDocument();
  });

  it('历史为空数组时应显示暂无历史记录', () => {
    setupPollingMock(makeStatus(), makeHistoryData([]));
    renderWorldOverview();
    expect(screen.getByText('暂无历史记录')).toBeInTheDocument();
  });

  // ── 实时图表 ──

  it('有历史数据时应渲染图表组件', () => {
    setupPollingMock(
      makeStatus(),
      makeHistoryData([makeTick()]),
    );
    renderWorldOverview();

    expect(screen.getByTestId('sentiment-trend-chart')).toBeInTheDocument();
    expect(screen.getByTestId('agent-activity-chart')).toBeInTheDocument();
  });

  it('无历史数据时不应渲染图表', () => {
    setupPollingMock(makeStatus(), null);
    renderWorldOverview();

    expect(screen.queryByTestId('sentiment-trend-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-activity-chart')).not.toBeInTheDocument();
  });

  // ── uptime 格式化 ──

  it('uptime 不足 1 小时时应只显示分钟', () => {
    setupPollingMock(makeStatus({ uptime: 300 }));
    renderWorldOverview();
    expect(screen.getByText('运行 5m')).toBeInTheDocument();
  });

  // ── 活跃 Agent 数显示 ──

  it('应显示活跃 Agent 数', () => {
    setupPollingMock(makeStatus({ activeAgents: 80, agentCount: 100 }));
    renderWorldOverview();
    expect(screen.getByText('80 个活跃')).toBeInTheDocument();
  });
});
