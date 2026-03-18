// ============================================================================
// BeeClaw Dashboard — TimelineReplay 事件回放页面测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TimelineReplay } from '../pages/TimelineReplay';
import type { TickResult } from '../types';

// ── Mock usePolling ──

const mockPollingReturn = {
  data: null as { history: TickResult[] } | null,
  error: null as string | null,
  loading: false,
  refresh: vi.fn(),
};

vi.mock('../hooks/usePolling', () => ({
  usePolling: () => mockPollingReturn,
}));

// ── Mock api/client ──

const mockFetchTickEvents = vi.fn();
const mockFetchTickResponses = vi.fn();

vi.mock('../api/client', () => ({
  fetchHistory: vi.fn(),
  fetchTickEvents: (...args: unknown[]) => mockFetchTickEvents(...args),
  fetchTickResponses: (...args: unknown[]) => mockFetchTickResponses(...args),
}));

// ── 工具函数 ──

function makeTick(overrides: Partial<TickResult> = {}): TickResult {
  return {
    tick: 1,
    eventsProcessed: 0,
    responsesCollected: 0,
    agentsActivated: 0,
    durationMs: 100,
    signals: 0,
    timestamp: '2025-01-01T12:00:00Z',
    events: [],
    responses: [],
    ...overrides,
  };
}

function renderTimeline() {
  return render(
    <MemoryRouter>
      <TimelineReplay />
    </MemoryRouter>,
  );
}

// ── 测试分组 ──

describe('TimelineReplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPollingReturn.data = null;
    mockPollingReturn.error = null;
    mockPollingReturn.loading = false;
    mockPollingReturn.refresh = vi.fn();

    // 默认 API 返回空数据
    mockFetchTickEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchTickResponses.mockResolvedValue({ responses: [], total: 0 });
  });

  // ── 基本渲染 ──

  it('应该渲染页面标题', () => {
    renderTimeline();
    expect(screen.getByText('事件回放')).toBeInTheDocument();
  });

  it('无历史数据时应显示空状态', () => {
    mockPollingReturn.data = { history: [] };
    renderTimeline();
    expect(screen.getByText('暂无历史数据，等待世界运行...')).toBeInTheDocument();
  });

  it('有历史数据时应显示帧数统计', () => {
    mockPollingReturn.data = {
      history: [makeTick({ tick: 1 }), makeTick({ tick: 2 }), makeTick({ tick: 3 })],
    };
    renderTimeline();
    expect(screen.getByText(/共 3 帧/)).toBeInTheDocument();
    expect(screen.getByText(/Tick 1–3/)).toBeInTheDocument();
  });

  it('error 时应显示错误状态', () => {
    mockPollingReturn.error = 'API 连接失败';
    renderTimeline();
    expect(screen.getByText('API 连接失败')).toBeInTheDocument();
  });

  // ── 播放控制 ──

  it('应该渲染播放控制按钮', () => {
    mockPollingReturn.data = { history: [makeTick({ tick: 1 })] };
    renderTimeline();
    expect(screen.getByTestId('btn-play')).toBeInTheDocument();
    expect(screen.getByTestId('btn-stop')).toBeInTheDocument();
    expect(screen.getByTestId('btn-step-backward')).toBeInTheDocument();
    expect(screen.getByTestId('btn-step-forward')).toBeInTheDocument();
  });

  it('点击播放后应显示暂停按钮', async () => {
    const user = userEvent.setup();
    mockPollingReturn.data = {
      history: [makeTick({ tick: 1 }), makeTick({ tick: 2 })],
    };
    renderTimeline();
    const playBtn = screen.getByTestId('btn-play');
    await user.click(playBtn);
    expect(screen.getByTestId('btn-pause')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-play')).not.toBeInTheDocument();
  });

  it('点击暂停后应恢复播放按钮', async () => {
    const user = userEvent.setup();
    mockPollingReturn.data = {
      history: [makeTick({ tick: 1 }), makeTick({ tick: 2 })],
    };
    renderTimeline();
    await user.click(screen.getByTestId('btn-play'));
    await user.click(screen.getByTestId('btn-pause'));
    expect(screen.getByTestId('btn-play')).toBeInTheDocument();
  });

  it('单帧时前进按钮应被禁用', () => {
    mockPollingReturn.data = { history: [makeTick({ tick: 5 })] };
    renderTimeline();
    const forwardBtn = screen.getByTestId('btn-step-forward');
    expect(forwardBtn).toBeDisabled();
  });

  it('第一帧时后退按钮应被禁用', async () => {
    const user = userEvent.setup();
    mockPollingReturn.data = {
      history: [makeTick({ tick: 1 }), makeTick({ tick: 2 })],
    };
    renderTimeline();
    // 点击停止回到第一帧
    await user.click(screen.getByTestId('btn-stop'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-step-backward')).toBeDisabled();
    });
  });

  it('点击前进应切换到下一帧', async () => {
    const user = userEvent.setup();
    mockPollingReturn.data = {
      history: [
        makeTick({ tick: 1, eventsProcessed: 1 }),
        makeTick({ tick: 2, eventsProcessed: 5 }),
      ],
    };
    // 先停止，确保在第 0 帧
    renderTimeline();
    await user.click(screen.getByTestId('btn-stop'));
    await user.click(screen.getByTestId('btn-step-forward'));
    await waitFor(() => {
      expect(screen.getByText('当前：Tick #2')).toBeInTheDocument();
    });
  });

  // ── 时间轴滑块 ──

  it('应该渲染时间轴滑块', () => {
    mockPollingReturn.data = {
      history: [makeTick({ tick: 1 }), makeTick({ tick: 2 }), makeTick({ tick: 3 })],
    };
    renderTimeline();
    expect(screen.getByTestId('timeline-slider')).toBeInTheDocument();
  });

  it('拖动滑块应跳转到对应 tick', async () => {
    mockPollingReturn.data = {
      history: [makeTick({ tick: 10 }), makeTick({ tick: 20 }), makeTick({ tick: 30 })],
    };
    renderTimeline();
    const slider = screen.getByTestId('timeline-slider');
    await act(async () => {
      fireEvent.change(slider, { target: { value: '1' } });
    });
    await waitFor(() => {
      expect(screen.getByText('当前：Tick #20')).toBeInTheDocument();
    });
  });

  // ── Tick 缩略时间轴 ──

  it('应该渲染 tick 块', () => {
    mockPollingReturn.data = {
      history: [makeTick({ tick: 1 }), makeTick({ tick: 2 }), makeTick({ tick: 3 })],
    };
    renderTimeline();
    expect(screen.getByTestId('tick-block-1')).toBeInTheDocument();
    expect(screen.getByTestId('tick-block-2')).toBeInTheDocument();
    expect(screen.getByTestId('tick-block-3')).toBeInTheDocument();
  });

  it('点击 tick 块应切换当前帧', async () => {
    const user = userEvent.setup();
    mockPollingReturn.data = {
      history: [makeTick({ tick: 1 }), makeTick({ tick: 2 }), makeTick({ tick: 3 })],
    };
    renderTimeline();
    await user.click(screen.getByTestId('tick-block-1'));
    await waitFor(() => {
      expect(screen.getByText('当前：Tick #1')).toBeInTheDocument();
    });
  });

  // ── 事件列表 ──

  it('有事件数据时应渲染事件列表', async () => {
    mockPollingReturn.data = { history: [makeTick({ tick: 7, eventsProcessed: 2 })] };
    mockFetchTickEvents.mockResolvedValue({
      events: [
        { id: 'e1', title: '央行降息', category: 'finance', importance: 0.8 },
        { id: 'e2', title: 'AI 突破', category: 'tech', importance: 0.6 },
      ],
      total: 2,
    });
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByText('央行降息')).toBeInTheDocument();
      expect(screen.getByText('AI 突破')).toBeInTheDocument();
    });
  });

  it('无事件时应显示空状态', async () => {
    mockPollingReturn.data = { history: [makeTick({ tick: 1 })] };
    mockFetchTickEvents.mockResolvedValue({ events: [], total: 0 });
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByText('该 Tick 无事件')).toBeInTheDocument();
    });
  });

  it('点击事件应高亮选中状态', async () => {
    const user = userEvent.setup();
    mockPollingReturn.data = { history: [makeTick({ tick: 1 })] };
    mockFetchTickEvents.mockResolvedValue({
      events: [{ id: 'e1', title: '测试事件', category: 'finance', importance: 0.7 }],
      total: 1,
    });
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByTestId('event-item-e1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('event-item-e1'));
    // 点击后应显示事件详情
    await waitFor(() => {
      expect(screen.getByText(/ID: e1/)).toBeInTheDocument();
    });
  });

  // ── Agent 响应列表 ──

  it('有响应数据时应渲染 Agent 响应', async () => {
    mockPollingReturn.data = { history: [makeTick({ tick: 1, responsesCollected: 2 })] };
    mockFetchTickResponses.mockResolvedValue({
      responses: [
        { agentId: 'a1', agentName: '张分析师', opinion: '看涨', action: 'buy', emotionalState: 0.5 },
        { agentId: 'a2', agentName: '李交易员', opinion: '看空', action: 'sell', emotionalState: -0.4 },
      ],
      total: 2,
    });
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByText('张分析师')).toBeInTheDocument();
      expect(screen.getByText('李交易员')).toBeInTheDocument();
    });
  });

  it('无响应时应显示空状态', async () => {
    mockPollingReturn.data = { history: [makeTick({ tick: 1 })] };
    mockFetchTickResponses.mockResolvedValue({ responses: [], total: 0 });
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByText('该 Tick 无 Agent 响应')).toBeInTheDocument();
    });
  });

  // ── 速度控制 ──

  it('应该渲染速度选择器', () => {
    mockPollingReturn.data = { history: [makeTick({ tick: 1 })] };
    renderTimeline();
    expect(screen.getByTestId('speed-select')).toBeInTheDocument();
  });

  it('改变速度选项应不报错', async () => {
    const user = userEvent.setup();
    mockPollingReturn.data = { history: [makeTick({ tick: 1 }), makeTick({ tick: 2 })] };
    renderTimeline();
    const select = screen.getByTestId('speed-select');
    await user.selectOptions(select, '500');
    expect((select as HTMLSelectElement).value).toBe('500');
  });

  // ── Tick 概要信息 ──

  it('应显示当前 Tick 的统计指标', async () => {
    mockPollingReturn.data = {
      history: [makeTick({ tick: 42, eventsProcessed: 3, responsesCollected: 12, durationMs: 567 })],
    };
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('567ms')).toBeInTheDocument();
    });
  });
});
