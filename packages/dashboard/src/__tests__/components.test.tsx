// ============================================================================
// BeeClaw Dashboard — 组件单元测试
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Card, StatCard, CardSkeleton, EmptyState, ErrorState } from '../components/Card';
import { ConnectionBadge, AgentStatusBadge, TrendBadge, ModelTierBadge } from '../components/StatusBadge';
import { SentimentBar } from '../components/SentimentBar';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';

// ── Card ──

describe('Card', () => {
  it('应该渲染标题和子内容', () => {
    render(<Card title="测试标题">内容</Card>);
    expect(screen.getByText('测试标题')).toBeInTheDocument();
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('没有标题时不渲染 h3', () => {
    const { container } = render(<Card>仅内容</Card>);
    expect(container.querySelector('h3')).toBeNull();
    expect(screen.getByText('仅内容')).toBeInTheDocument();
  });

  it('应该应用自定义 className', () => {
    const { container } = render(<Card className="custom-class">内容</Card>);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

// ── StatCard ──

describe('StatCard', () => {
  it('应该渲染标题和值', () => {
    render(<StatCard title="Agent 数量" value={42} />);
    expect(screen.getByText('Agent 数量')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('应该渲染副标题', () => {
    render(<StatCard title="当前 Tick" value={100} subtitle="运行中" trend="up" />);
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('应该渲染图标', () => {
    render(<StatCard title="测试" value={1} icon="🔥" />);
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });
});

// ── CardSkeleton ──

describe('CardSkeleton', () => {
  it('应该渲染指定数量的骨架', () => {
    const { container } = render(<CardSkeleton count={3} />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('默认渲染 1 个骨架', () => {
    const { container } = render(<CardSkeleton />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(1);
  });
});

// ── EmptyState ──

describe('EmptyState', () => {
  it('应该渲染图标和消息', () => {
    render(<EmptyState icon="📭" message="暂无数据" />);
    expect(screen.getByText('📭')).toBeInTheDocument();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });
});

// ── ErrorState ──

describe('ErrorState', () => {
  it('应该渲染错误消息', () => {
    render(<ErrorState message="连接失败" />);
    expect(screen.getByText('连接失败')).toBeInTheDocument();
  });

  it('应该渲染重试按钮并响应点击', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="出错了" onRetry={onRetry} />);
    const btn = screen.getByText('重试');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('没有 onRetry 时不渲染重试按钮', () => {
    render(<ErrorState message="出错了" />);
    expect(screen.queryByText('重试')).not.toBeInTheDocument();
  });
});

// ── ConnectionBadge ──

describe('ConnectionBadge', () => {
  it('连接状态应显示 "已连接"', () => {
    render(<ConnectionBadge state="connected" />);
    expect(screen.getByText('已连接')).toBeInTheDocument();
  });

  it('连接中状态应显示 "连接中"', () => {
    render(<ConnectionBadge state="connecting" />);
    expect(screen.getByText('连接中')).toBeInTheDocument();
  });

  it('断开状态应显示 "已断开"', () => {
    render(<ConnectionBadge state="disconnected" />);
    expect(screen.getByText('已断开')).toBeInTheDocument();
  });
});

// ── AgentStatusBadge ──

describe('AgentStatusBadge', () => {
  it.each([
    ['active', '活跃'],
    ['dormant', '休眠'],
    ['dead', '淘汰'],
  ] as const)('状态 "%s" 应显示 "%s"', (status, label) => {
    render(<AgentStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

// ── TrendBadge ──

describe('TrendBadge', () => {
  it.each([
    ['forming', '形成中'],
    ['strengthening', '增强'],
    ['weakening', '减弱'],
    ['reversing', '反转'],
  ])('趋势 "%s" 应显示 "%s"', (trend, label) => {
    render(<TrendBadge trend={trend} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('未知趋势应直接显示原文', () => {
    render(<TrendBadge trend="unknown-trend" />);
    expect(screen.getByText('unknown-trend')).toBeInTheDocument();
  });
});

// ── ModelTierBadge ──

describe('ModelTierBadge', () => {
  it.each([
    ['local', 'Local'],
    ['cheap', 'Cheap'],
    ['strong', 'Strong'],
  ] as const)('层级 "%s" 应显示 "%s"', (tier, label) => {
    render(<ModelTierBadge tier={tier} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

// ── SentimentBar ──

describe('SentimentBar', () => {
  it('应该渲染三个情绪段', () => {
    const { container } = render(
      <SentimentBar bullish={50} bearish={30} neutral={20} />,
    );
    // 应有三个带颜色的条
    const bars = container.querySelectorAll('[style*="width"]');
    expect(bars.length).toBeGreaterThanOrEqual(3);
  });

  it('总和为 0 时应渲染空条', () => {
    const { container } = render(
      <SentimentBar bullish={0} bearish={0} neutral={0} />,
    );
    // 不应有百分比标签
    expect(screen.queryByText(/看多/)).not.toBeInTheDocument();
    // 但应有一个空容器
    const bar = container.querySelector('.rounded-full');
    expect(bar).toBeInTheDocument();
  });

  it('showLabels=false 时不显示标签', () => {
    render(
      <SentimentBar bullish={50} bearish={30} neutral={20} showLabels={false} />,
    );
    expect(screen.queryByText(/看多/)).not.toBeInTheDocument();
    expect(screen.queryByText(/看空/)).not.toBeInTheDocument();
  });

  it('showLabels=true（默认）时显示百分比标签', () => {
    render(
      <SentimentBar bullish={60} bearish={30} neutral={10} />,
    );
    expect(screen.getByText(/看多/)).toBeInTheDocument();
    expect(screen.getByText(/看空/)).toBeInTheDocument();
    expect(screen.getByText(/中立/)).toBeInTheDocument();
  });
});

// ── Header ──

describe('Header', () => {
  it('应该渲染 logo 和 Tick 信息', () => {
    render(
      <MemoryRouter>
        <Header wsState="connected" tick={42} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Bee')).toBeInTheDocument();
    expect(screen.getByText('Claw')).toBeInTheDocument();
    expect(screen.getByText('Tick #42')).toBeInTheDocument();
    expect(screen.getByText('已连接')).toBeInTheDocument();
  });

  it('断开连接时应显示对应状态', () => {
    render(
      <MemoryRouter>
        <Header wsState="disconnected" tick={0} />
      </MemoryRouter>,
    );
    expect(screen.getByText('已断开')).toBeInTheDocument();
    expect(screen.getByText('Tick #0')).toBeInTheDocument();
  });
});

// ── Sidebar ──

describe('Sidebar', () => {
  it('应该渲染全部 5 个导航链接', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('世界总览')).toBeInTheDocument();
    expect(screen.getByText('Agent 列表')).toBeInTheDocument();
    expect(screen.getByText('事件流')).toBeInTheDocument();
    expect(screen.getByText('共识引擎')).toBeInTheDocument();
    expect(screen.getByText('社交网络')).toBeInTheDocument();
  });

  it('应该显示版本号', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('BeeClaw v0.1.0')).toBeInTheDocument();
  });
});
