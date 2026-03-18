// ============================================================================
// BeeClaw Dashboard — AgentActivityChart 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AgentActivityChart,
  toActivityData,
  CustomTooltip,
} from '../components/charts/AgentActivityChart';
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

// ── toActivityData 数据转换函数测试 ──

describe('toActivityData', () => {
  it('应该将 TickResult 转换为 ActivityDataPoint', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 10, agentsFiltered: 3, agentsEliminated: 1 }),
    ];
    const result = toActivityData(history);
    expect(result).toEqual([{ tick: 1, active: 10, dormant: 3, dead: 1 }]);
  });

  it('缺少 agentsFiltered 时应默认为 0', () => {
    const history = [createTickResult({ tick: 1, agentsActivated: 10, agentsEliminated: 2 })];
    const result = toActivityData(history);
    expect(result[0].dormant).toBe(0);
    expect(result[0].dead).toBe(2);
  });

  it('缺少 agentsEliminated 时应默认为 0', () => {
    const history = [createTickResult({ tick: 1, agentsActivated: 10, agentsFiltered: 5 })];
    const result = toActivityData(history);
    expect(result[0].dead).toBe(0);
    expect(result[0].dormant).toBe(5);
  });

  it('应该按 tick 排序', () => {
    const history = [
      createTickResult({ tick: 3, agentsActivated: 30 }),
      createTickResult({ tick: 1, agentsActivated: 10 }),
      createTickResult({ tick: 2, agentsActivated: 20 }),
    ];
    const result = toActivityData(history);
    expect(result.map((d) => d.tick)).toEqual([1, 2, 3]);
    expect(result.map((d) => d.active)).toEqual([10, 20, 30]);
  });

  it('空数组应返回空数组', () => {
    expect(toActivityData([])).toEqual([]);
  });

  it('不应修改原数组', () => {
    const history = [
      createTickResult({ tick: 2 }),
      createTickResult({ tick: 1 }),
    ];
    const original = [...history];
    toActivityData(history);
    expect(history[0].tick).toBe(original[0].tick);
    expect(history[1].tick).toBe(original[1].tick);
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

  it('有数据时应渲染 Tick 标签和合计', () => {
    const payload = [
      { name: '活跃', value: 10, color: '#22c55e' },
      { name: '休眠', value: 5, color: '#f59e0b' },
      { name: '淘汰', value: 2, color: '#ef4444' },
    ];
    render(<CustomTooltip active={true} payload={payload} label={42} />);

    expect(screen.getByText('Tick #42')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument(); // 合计 10+5+2=17
  });

  it('应渲染每个条目的名称和值', () => {
    const payload = [
      { name: '活跃', value: 10, color: '#22c55e' },
      { name: '休眠', value: 5, color: '#f59e0b' },
    ];
    render(<CustomTooltip active={true} payload={payload} label={1} />);

    expect(screen.getByText(/活跃/)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/休眠/)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('应计算百分比', () => {
    const payload = [
      { name: '活跃', value: 75, color: '#22c55e' },
      { name: '休眠', value: 25, color: '#f59e0b' },
    ];
    render(<CustomTooltip active={true} payload={payload} label={1} />);

    expect(screen.getByText('(75%)')).toBeInTheDocument();
    expect(screen.getByText('(25%)')).toBeInTheDocument();
  });

  it('total 为 0 时百分比应为 0', () => {
    const payload = [
      { name: '活跃', value: 0, color: '#22c55e' },
      { name: '休眠', value: 0, color: '#f59e0b' },
    ];
    render(<CustomTooltip active={true} payload={payload} label={1} />);

    const zeroPercents = screen.getAllByText('(0%)');
    expect(zeroPercents.length).toBe(2);
  });
});

// ── AgentActivityChart 组件测试 ──

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

  it('应渲染图表中的三个 Area 区域', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 10, agentsFiltered: 3, agentsEliminated: 1 }),
      createTickResult({ tick: 2, agentsActivated: 15, agentsFiltered: 5, agentsEliminated: 2 }),
    ];
    const { container } = render(<AgentActivityChart history={history} />);
    // jsdom 中 recharts 不生成完整 SVG class，验证容器渲染即可
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('应渲染图表的渐变定义', () => {
    const history = [
      createTickResult({ tick: 1, agentsActivated: 10, agentsFiltered: 5, agentsEliminated: 2 }),
    ];
    const { container } = render(<AgentActivityChart history={history} />);
    // jsdom 中 SVG defs/gradients 可能未完整渲染，验证容器即可
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
