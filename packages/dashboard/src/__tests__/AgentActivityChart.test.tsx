// ============================================================================
// BeeClaw Dashboard — AgentActivityChart 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentActivityChart } from '../components/charts/AgentActivityChart';
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

describe('AgentActivityChart', () => {
  it('空历史数据应显示暂无数据提示', () => {
    render(<AgentActivityChart history={[]} />);
    expect(screen.getByText('暂无历史数据')).toBeInTheDocument();
  });

  it('有数据时应渲染图表容器', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 10, agentsFiltered: 3, agentsEliminated: 1 }),
      createTickResult({ tick: 2, agentsActivated: 15, agentsFiltered: 5, agentsEliminated: 2 }),
    ];
    const { container } = render(<AgentActivityChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('缺少 agentsFiltered/agentsEliminated 字段时应使用默认 0', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 10 }),
      createTickResult({ tick: 2, agentsActivated: 20 }),
    ];
    // toActivityData 中 ?? 0 分支
    const { container } = render(<AgentActivityChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('乱序数据应能正确处理', () => {
    const history = [
      createTickResult({ tick: 3, agentsActivated: 30, agentsFiltered: 10, agentsEliminated: 5 }),
      createTickResult({ tick: 1, agentsActivated: 10, agentsFiltered: 2, agentsEliminated: 0 }),
      createTickResult({ tick: 2, agentsActivated: 20, agentsFiltered: 5, agentsEliminated: 1 }),
    ];
    const { container } = render(<AgentActivityChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('所有值为 0 时应正常渲染', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 0, agentsFiltered: 0, agentsEliminated: 0 }),
    ];
    const { container } = render(<AgentActivityChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('大量数据应正常渲染', () => {
    const history = Array.from({ length: 50 }, (_, i) =>
      createTickResult({
        tick: i + 1,
        agentsActivated: 10 + i,
        agentsFiltered: Math.floor(i / 2),
        agentsEliminated: i > 20 ? 1 : 0,
      })
    );
    const { container } = render(<AgentActivityChart history={history} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});
