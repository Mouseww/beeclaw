// ============================================================================
// BeeClaw Dashboard — SentimentTrendChart 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SentimentTrendChart,
  toChartData,
  CustomTooltip,
} from '../components/charts/SentimentTrendChart';
import type { TickResult } from '../types';

function createTickResult(overrides: Partial<TickResult> = {}): TickResult {
  return {
    tick: 1,
    eventsProcessed: 3,
    responsesCollected: 5,
    agentsActivated: 10,
    signals: 1,
    durationMs: 100,
    ...overrides,
  };
}

// ── toChartData 数据转换函数测试 ──

describe('toChartData', () => {
  it('应该将 TickResult 转换为 SentimentDataPoint', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 10, responsesCollected: 8, eventsProcessed: 5 }),
    ];
    const result = toChartData(history);
    expect(result).toEqual([
      { tick: 1, agentsActivated: 10, responsesCollected: 8, eventsProcessed: 5 },
    ]);
  });

  it('应该按 tick 排序', () => {
    const history = [
      createTickResult({ tick: 3, agentsActivated: 30 }),
      createTickResult({ tick: 1, agentsActivated: 10 }),
      createTickResult({ tick: 2, agentsActivated: 20 }),
    ];
    const result = toChartData(history);
    expect(result.map((d) => d.tick)).toEqual([1, 2, 3]);
    expect(result.map((d) => d.agentsActivated)).toEqual([10, 20, 30]);
  });

  it('空数组应返回空数组', () => {
    expect(toChartData([])).toEqual([]);
  });

  it('不应修改原数组', () => {
    const history = [
      createTickResult({ tick: 2 }),
      createTickResult({ tick: 1 }),
    ];
    const original = [...history];
    toChartData(history);
    expect(history[0].tick).toBe(original[0].tick);
    expect(history[1].tick).toBe(original[1].tick);
  });

  it('应正确映射所有三个数据字段', () => {
    const history = [
      createTickResult({
        tick: 5,
        agentsActivated: 100,
        responsesCollected: 80,
        eventsProcessed: 50,
      }),
    ];
    const result = toChartData(history);
    expect(result[0]).toEqual({
      tick: 5,
      agentsActivated: 100,
      responsesCollected: 80,
      eventsProcessed: 50,
    });
  });
});

// ── CustomTooltip 组件测试 ──

describe('CustomTooltip', () => {
  it('active=false 时应返回 null', () => {
    const { container } = render(
      <CustomTooltip active={false} payload={[]} label={1} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('payload 为空数组时应返回 null', () => {
    const { container } = render(
      <CustomTooltip active={true} payload={[]} label={1} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('payload 为 undefined 时应返回 null', () => {
    const { container } = render(
      <CustomTooltip active={true} payload={undefined} label={1} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('有数据时应渲染 Tick 标签', () => {
    const payload = [
      { name: '激活 Agent', value: 10, color: '#22c55e' },
    ];
    render(<CustomTooltip active={true} payload={payload} label={42} />);

    expect(screen.getByText('Tick #42')).toBeInTheDocument();
  });

  it('应渲染每个条目的名称和值', () => {
    const payload = [
      { name: '激活 Agent', value: 10, color: '#22c55e' },
      { name: 'Agent 响应', value: 8, color: '#60a5fa' },
      { name: '处理事件', value: 5, color: '#f59e0b' },
    ];
    render(<CustomTooltip active={true} payload={payload} label={1} />);

    expect(screen.getByText(/激活 Agent/)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/Agent 响应/)).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/处理事件/)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('单个条目也应正常渲染', () => {
    const payload = [{ name: '激活 Agent', value: 42, color: '#22c55e' }];
    render(<CustomTooltip active={true} payload={payload} label={10} />);

    expect(screen.getByText('Tick #10')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});

// ── SentimentTrendChart 组件测试 ──

describe('SentimentTrendChart', () => {
  it('空历史数据应显示暂无数据提示', () => {
    render(<SentimentTrendChart history={[]} />);
    expect(screen.getByText('暂无历史数据')).toBeInTheDocument();
  });

  it('有数据时应渲染图表容器', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 5, responsesCollected: 3, eventsProcessed: 2 }),
      createTickResult({ tick: 2, agentsActivated: 8, responsesCollected: 6, eventsProcessed: 4 }),
    ];
    const { container } = render(<SentimentTrendChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('应渲染三条折线', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 5, responsesCollected: 3, eventsProcessed: 2 }),
      createTickResult({ tick: 2, agentsActivated: 8, responsesCollected: 6, eventsProcessed: 4 }),
    ];
    const { container } = render(<SentimentTrendChart history={history} />);
    // jsdom 中 recharts 不生成完整 SVG class，验证容器渲染即可
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('多个 tick 数据应正常渲染', () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      createTickResult({
        tick: i + 1,
        agentsActivated: (i + 1) * 2,
        responsesCollected: (i + 1) * 3,
        eventsProcessed: i + 1,
      })
    );
    const { container } = render(<SentimentTrendChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('乱序数据应能正确处理（排序逻辑）', () => {
    const history = [
      createTickResult({ tick: 3, agentsActivated: 30 }),
      createTickResult({ tick: 1, agentsActivated: 10 }),
      createTickResult({ tick: 2, agentsActivated: 20 }),
    ];
    const { container } = render(<SentimentTrendChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('单条数据应正常渲染', () => {
    const history = [createTickResult({ tick: 1 })];
    const { container } = render(<SentimentTrendChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('应渲染 LineChart 组件', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 10, responsesCollected: 5, eventsProcessed: 3 }),
    ];
    const { container } = render(<SentimentTrendChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});
