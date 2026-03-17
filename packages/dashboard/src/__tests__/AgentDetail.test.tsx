// ============================================================================
// BeeClaw Dashboard — AgentDetail 页面增强测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AgentDetail } from '../pages/AgentDetail';
import { usePolling } from '../hooks/usePolling';
import type { AgentDetailData } from '../types';

// Mock usePolling
vi.mock('../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}));

const mockUsePolling = usePolling as ReturnType<typeof vi.fn>;

function makeAgentDetail(overrides: Partial<AgentDetailData> = {}): AgentDetailData {
  return {
    id: 'agent-001-long-uuid-string',
    name: '张分析师',
    persona: {
      background: '资深金融分析师，长期从事宏观经济研究',
      profession: '金融分析师',
      traits: {
        riskTolerance: 0.7,
        informationSensitivity: 0.8,
        conformity: 0.3,
        emotionality: 0.4,
        analyticalDepth: 0.9,
      },
      expertise: ['宏观经济', '股票分析'],
      biases: ['确认偏误', '锚定效应'],
      communicationStyle: '专业严谨',
    },
    memory: {
      shortTerm: [
        { tick: 5, type: 'event', content: '央行宣布降息25个基点', importance: 0.9, emotionalImpact: 0.3 },
        { tick: 4, type: 'opinion', content: '市场对降息有强烈预期', importance: 0.7, emotionalImpact: 0.1 },
      ],
      longTerm: [],
      opinions: {
        'BTC走势': {
          topic: 'BTC走势',
          stance: 0.6,
          confidence: 0.8,
          reasoning: '技术面看涨，减半效应',
          lastUpdatedTick: 10,
        },
        'A股大盘': {
          topic: 'A股大盘',
          stance: -0.3,
          confidence: 0.6,
          reasoning: '政策面不确定性较大',
          lastUpdatedTick: 8,
        },
      },
      predictions: [],
    },
    relationships: [],
    followers: ['agent-002', 'agent-003'],
    following: ['agent-004'],
    influence: 75,
    status: 'active',
    credibility: 80,
    spawnedAtTick: 1,
    lastActiveTick: 10,
    modelTier: 'strong',
    modelId: 'strong-default',
    ...overrides,
  };
}

function renderAgentDetail() {
  return render(
    <MemoryRouter initialEntries={['/agents/agent-001-long-uuid-string']}>
      <Routes>
        <Route path="/agents/:id" element={<AgentDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgentDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 加载状态 ──

  it('loading 且无数据时应显示骨架屏', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: true,
      refresh: vi.fn(),
    });

    const { container } = renderAgentDetail();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // ── 空状态 ──

  it('无数据且未加载时应显示 Agent 未找到', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('Agent 未找到')).toBeInTheDocument();
  });

  // ── 错误状态 ──

  it('错误时应显示错误信息和重试按钮', () => {
    const refresh = vi.fn();
    mockUsePolling.mockReturnValue({
      data: null,
      error: 'Agent not found',
      loading: false,
      refresh,
    });

    renderAgentDetail();
    expect(screen.getByText('Agent not found')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  // ── 基本信息 ──

  it('应渲染 Agent 基本信息', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();

    // 名称
    expect(screen.getByText('张分析师')).toBeInTheDocument();
    // 职业在副标题中
    expect(screen.getAllByText(/金融分析师/).length).toBeGreaterThanOrEqual(1);
    // ID 前 12 位
    expect(screen.getByText(/agent-001-lo/)).toBeInTheDocument();
  });

  it('应渲染面包屑导航链接', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();

    const link = screen.getByText('← 返回 Agent 列表');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/agents');
  });

  it('应渲染头像首字母', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({ name: '李交易员' }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    // 头像应显示 "李"
    expect(screen.getByText('李', { selector: 'span' })).toBeInTheDocument();
  });

  // ── 状态 Badge ──

  it('应渲染 AgentStatusBadge 和 ModelTierBadge', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({ status: 'active', modelTier: 'strong' }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('活跃')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('休眠状态应正确显示', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({ status: 'dormant', modelTier: 'cheap' }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('休眠')).toBeInTheDocument();
    expect(screen.getByText('Cheap')).toBeInTheDocument();
  });

  // ── 统计卡片 ──

  it('应渲染 4 个统计卡片（影响力、信誉度、粉丝、关注）', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({ influence: 75, credibility: 80, followers: ['a', 'b'], following: ['c'] }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('影响力')).toBeInTheDocument();
    expect(screen.getByText('信誉度')).toBeInTheDocument();
    expect(screen.getByText('粉丝')).toBeInTheDocument();
    expect(screen.getByText('关注')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  // ── 人格画像 ──

  it('应渲染人格画像卡片', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('人格画像')).toBeInTheDocument();
    expect(screen.getByText('资深金融分析师，长期从事宏观经济研究')).toBeInTheDocument();
    expect(screen.getByText('专业严谨')).toBeInTheDocument();
    expect(screen.getByText('宏观经济')).toBeInTheDocument();
    expect(screen.getByText('股票分析')).toBeInTheDocument();
    expect(screen.getByText('确认偏误')).toBeInTheDocument();
    expect(screen.getByText('锚定效应')).toBeInTheDocument();
  });

  // ── 性格特征 ──

  it('应渲染性格特征卡片', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('性格特征')).toBeInTheDocument();
    expect(screen.getByText('风险偏好')).toBeInTheDocument();
    expect(screen.getByText('信息敏感')).toBeInTheDocument();
    expect(screen.getByText('从众性')).toBeInTheDocument();
    expect(screen.getByText('情绪化')).toBeInTheDocument();
    expect(screen.getByText('分析深度')).toBeInTheDocument();
  });

  it('应渲染生命周期信息', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({ spawnedAtTick: 1, lastActiveTick: 10 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('生命周期')).toBeInTheDocument();
    expect(screen.getByText('出生 Tick')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('最后活跃')).toBeInTheDocument();
    expect(screen.getByText('#10')).toBeInTheDocument();
  });

  // ── 观点立场 ──

  it('有观点时应渲染观点列表', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('观点立场')).toBeInTheDocument();
    expect(screen.getByText('BTC走势')).toBeInTheDocument();
    expect(screen.getByText('技术面看涨，减半效应')).toBeInTheDocument();
    expect(screen.getByText('Tick #10')).toBeInTheDocument();
    expect(screen.getByText('A股大盘')).toBeInTheDocument();
    expect(screen.getByText('政策面不确定性较大')).toBeInTheDocument();
  });

  it('无观点时应显示空状态', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({
        memory: {
          shortTerm: [],
          longTerm: [],
          opinions: {},
          predictions: [],
        },
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('暂无观点记录')).toBeInTheDocument();
  });

  // ── 短期记忆 ──

  it('有短期记忆时应渲染记忆列表', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('短期记忆')).toBeInTheDocument();
    expect(screen.getByText('央行宣布降息25个基点')).toBeInTheDocument();
    expect(screen.getByText('市场对降息有强烈预期')).toBeInTheDocument();
  });

  it('无记忆时应显示空状态', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({
        memory: {
          shortTerm: [],
          longTerm: [],
          opinions: {},
          predictions: [],
        },
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('暂无记忆')).toBeInTheDocument();
  });

  // ── 长期记忆（可选渲染） ──

  it('有长期记忆时应渲染长期记忆卡片', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({
        memory: {
          shortTerm: [],
          longTerm: [
            {
              summary: '市场经历了一波大幅调整',
              tickRange: [1, 20] as [number, number],
              keyInsights: ['流动性紧缩', '政策转向'],
              createdAt: 20,
            },
          ],
          opinions: {},
          predictions: [],
        },
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('长期记忆')).toBeInTheDocument();
    expect(screen.getByText('市场经历了一波大幅调整')).toBeInTheDocument();
    expect(screen.getByText('Tick #1 ~ #20')).toBeInTheDocument();
    expect(screen.getByText('流动性紧缩')).toBeInTheDocument();
    expect(screen.getByText('政策转向')).toBeInTheDocument();
  });

  it('无长期记忆时不应渲染长期记忆卡片', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    // 组件只在 longTerm.length > 0 时渲染 "长期记忆" 标题
    expect(screen.queryByText('长期记忆')).not.toBeInTheDocument();
  });

  // ── 预测记录（可选渲染） ──

  it('有预测记录时应渲染预测卡片', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({
        memory: {
          shortTerm: [],
          longTerm: [],
          opinions: {},
          predictions: [
            { tick: 5, prediction: 'BTC 将突破 10 万美元', outcome: '达到 10.2 万', accurate: true },
            { tick: 3, prediction: 'A股将下跌', outcome: '小幅上涨', accurate: false },
          ],
        },
      }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('预测记录')).toBeInTheDocument();
    expect(screen.getByText('BTC 将突破 10 万美元')).toBeInTheDocument();
    expect(screen.getByText('结果: 达到 10.2 万')).toBeInTheDocument();
    expect(screen.getByText('准确')).toBeInTheDocument();
    expect(screen.getByText('A股将下跌')).toBeInTheDocument();
    expect(screen.getByText('偏差')).toBeInTheDocument();
  });

  it('无预测记录时不应渲染预测卡片', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.queryByText('预测记录')).not.toBeInTheDocument();
  });

  // ── 信誉度颜色 ──

  it('信誉度 >= 50 应显示绿色', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({ credibility: 80 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('80')).toHaveClass('text-green-400');
  });

  it('信誉度 < 50 应显示红色', () => {
    mockUsePolling.mockReturnValue({
      data: makeAgentDetail({ credibility: 30 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentDetail();
    expect(screen.getByText('30')).toHaveClass('text-red-400');
  });
});
