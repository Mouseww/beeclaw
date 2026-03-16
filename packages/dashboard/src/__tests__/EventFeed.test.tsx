// ============================================================================
// BeeClaw Dashboard — EventFeed 页面增强测试（含 tick 数据渲染）
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EventFeed } from '../pages/EventFeed';
import type { TickResult } from '../types';

// Mock useWebSocket
const mockWebSocket = {
  state: 'disconnected' as const,
  lastTick: null as TickResult | null,
  lastConsensus: [],
  tickHistory: [] as TickResult[],
};

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => mockWebSocket,
}));

// Mock EventInjectForm（避免 api/client 依赖）
vi.mock('../components/EventInjectForm', () => ({
  EventInjectForm: () => <div data-testid="event-inject-form">Mock EventInjectForm</div>,
}));

function renderEventFeed() {
  return render(
    <MemoryRouter>
      <EventFeed />
    </MemoryRouter>,
  );
}

function makeTick(overrides: Partial<TickResult> = {}): TickResult {
  return {
    tick: 1,
    eventsProcessed: 2,
    responsesCollected: 3,
    agentsActivated: 4,
    durationMs: 150,
    timestamp: '2025-01-01T12:00:00Z',
    events: [],
    responses: [],
    ...overrides,
  };
}

describe('EventFeed', () => {
  beforeEach(() => {
    // 重置 mock 数据
    mockWebSocket.state = 'disconnected';
    mockWebSocket.lastTick = null;
    mockWebSocket.lastConsensus = [];
    mockWebSocket.tickHistory = [];
  });

  // ── 基本渲染 ──

  it('应该渲染页面标题和描述', () => {
    renderEventFeed();
    expect(screen.getByText('事件流')).toBeInTheDocument();
    expect(screen.getByText(/实时事件和 Agent 响应/)).toBeInTheDocument();
  });

  it('应该渲染事件注入表单', () => {
    renderEventFeed();
    expect(screen.getByText('注入新事件')).toBeInTheDocument();
    expect(screen.getByTestId('event-inject-form')).toBeInTheDocument();
  });

  it('无事件数据时应显示等待提示', () => {
    renderEventFeed();
    expect(screen.getByText('等待事件流数据...（需要 WebSocket 连接）')).toBeInTheDocument();
  });

  // ── 有 tick 数据时 ──

  it('有 tick 数据时应渲染 TickCard', () => {
    const tick = makeTick({
      tick: 10,
      eventsProcessed: 3,
      agentsActivated: 5,
      durationMs: 200,
    });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    expect(screen.getByText('Tick #10')).toBeInTheDocument();
    expect(screen.getByText('3 事件')).toBeInTheDocument();
    expect(screen.getByText('5 Agent')).toBeInTheDocument();
    expect(screen.getByText('0.2s')).toBeInTheDocument();
  });

  it('最新 tick 应显示 "最新" 标记', () => {
    const tick = makeTick({ tick: 5 });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    expect(screen.getByText('最新')).toBeInTheDocument();
  });

  it('多个 tick 应倒序显示（最新在前）', () => {
    const tick1 = makeTick({ tick: 1 });
    const tick2 = makeTick({ tick: 2 });
    const tick3 = makeTick({ tick: 3 });
    mockWebSocket.tickHistory = [tick1, tick2, tick3];
    mockWebSocket.lastTick = tick3;

    renderEventFeed();

    const tickLabels = screen.getAllByText(/Tick #\d+/);
    expect(tickLabels[0].textContent).toBe('Tick #3');
    expect(tickLabels[1].textContent).toBe('Tick #2');
    expect(tickLabels[2].textContent).toBe('Tick #1');
  });

  // ── 事件列表 ──

  it('tick 包含事件时应渲染事件列表', () => {
    const tick = makeTick({
      tick: 1,
      events: [
        { id: 'e1', title: '央行降息', category: 'finance', importance: 0.9 },
        { id: 'e2', title: 'AI 突破', category: 'tech', importance: 0.7 },
      ],
    });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    expect(screen.getByText('央行降息')).toBeInTheDocument();
    expect(screen.getByText('AI 突破')).toBeInTheDocument();
    // 分类图标
    expect(screen.getByText('💰')).toBeInTheDocument(); // finance
    expect(screen.getByText('💻')).toBeInTheDocument(); // tech
  });

  it('事件分类图标应正确映射', () => {
    const tick = makeTick({
      tick: 1,
      events: [
        { id: 'e1', title: '政策变化', category: 'politics', importance: 0.5 },
        { id: 'e2', title: '社会事件', category: 'social', importance: 0.3 },
        { id: 'e3', title: '一般事件', category: 'general', importance: 0.2 },
        { id: 'e4', title: '未知类型', category: 'unknown', importance: 0.1 },
      ],
    });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    expect(screen.getByText('🏛️')).toBeInTheDocument(); // politics
    expect(screen.getByText('👥')).toBeInTheDocument(); // social
    // general 和 unknown 都应映射为 📋
    const clipboards = screen.getAllByText('📋');
    expect(clipboards.length).toBe(2);
  });

  it('重要性指示器应显示百分比', () => {
    const tick = makeTick({
      tick: 1,
      events: [
        { id: 'e1', title: '高重要', category: 'finance', importance: 0.85 },
      ],
    });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  // ── Agent 响应 ──

  it('tick 包含 Agent 响应时应渲染响应卡片', () => {
    const tick = makeTick({
      tick: 1,
      responses: [
        {
          agentId: 'a1',
          agentName: '张分析师',
          opinion: '看涨后市',
          action: 'buy',
          emotionalState: 0.5,
        },
        {
          agentId: 'a2',
          agentName: '李交易员',
          opinion: '保持观望',
          action: 'hold',
          emotionalState: -0.1,
        },
      ],
    });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    expect(screen.getByText(/Agent 响应（2）/)).toBeInTheDocument();
    expect(screen.getByText('张分析师')).toBeInTheDocument();
    expect(screen.getByText('看涨后市')).toBeInTheDocument();
    expect(screen.getByText('+0.50')).toBeInTheDocument();
    expect(screen.getByText('李交易员')).toBeInTheDocument();
    expect(screen.getByText('保持观望')).toBeInTheDocument();
    expect(screen.getByText('-0.10')).toBeInTheDocument();
  });

  it('正面情绪应显示绿色，负面情绪应显示红色', () => {
    const tick = makeTick({
      tick: 1,
      responses: [
        {
          agentId: 'a1',
          agentName: '乐观者',
          opinion: '看好',
          action: 'buy',
          emotionalState: 0.5,
        },
        {
          agentId: 'a2',
          agentName: '悲观者',
          opinion: '看空',
          action: 'sell',
          emotionalState: -0.5,
        },
        {
          agentId: 'a3',
          agentName: '中立者',
          opinion: '观望',
          action: 'hold',
          emotionalState: 0.1,
        },
      ],
    });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    expect(screen.getByText('+0.50')).toHaveClass('text-green-400');
    expect(screen.getByText('-0.50')).toHaveClass('text-red-400');
    expect(screen.getByText('+0.10')).toHaveClass('text-gray-400');
  });

  it('超过 8 个响应时应显示更多提示', () => {
    const responses = Array.from({ length: 10 }, (_, i) => ({
      agentId: `a${i}`,
      agentName: `Agent ${i}`,
      opinion: `观点 ${i}`,
      action: 'hold',
      emotionalState: 0,
    }));
    const tick = makeTick({ tick: 1, responses });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    // 只显示前 8 个
    expect(screen.getByText('Agent 0')).toBeInTheDocument();
    expect(screen.getByText('Agent 7')).toBeInTheDocument();
    expect(screen.queryByText('Agent 8')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent 9')).not.toBeInTheDocument();

    // 显示剩余数量
    expect(screen.getByText('+2 更多响应')).toBeInTheDocument();
  });

  // ── 空事件和响应 ──

  it('tick 无事件和响应时应不渲染事件/响应区域', () => {
    const tick = makeTick({ tick: 1, events: [], responses: [] });
    mockWebSocket.tickHistory = [tick];
    mockWebSocket.lastTick = tick;

    renderEventFeed();

    // "事件" 小标题不应存在（注意页面描述 "实时事件和 Agent 响应 ·..." 会存在）
    expect(screen.queryByText('事件', { selector: 'p.text-xs' })).not.toBeInTheDocument();
    // "Agent 响应 (N)" 格式的标题不应存在
    expect(screen.queryByText(/^Agent 响应 \(\d+\)$/)).not.toBeInTheDocument();
  });
});
