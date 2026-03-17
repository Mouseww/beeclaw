// ============================================================================
// BeeClaw Dashboard — SentimentTrendChart 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SentimentTrendChart } from '../components/charts/SentimentTrendChart';
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
    // ResponsiveContainer 渲染了图表
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
});
