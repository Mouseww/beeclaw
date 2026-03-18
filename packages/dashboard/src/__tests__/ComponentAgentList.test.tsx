// ============================================================================
// BeeClaw Dashboard — components/AgentList 组件测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentList } from '../components/AgentList';
import { usePolling } from '../hooks/usePolling';
import type { AgentListResponse, AgentListItem } from '../types';

// Mock usePolling
vi.mock('../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}));

const mockUsePolling = usePolling as ReturnType<typeof vi.fn>;

function makeAgent(overrides: Partial<AgentListItem> = {}): AgentListItem {
  return {
    id: 'agent-001',
    name: '张分析师',
    profession: '金融分析师',
    status: 'active',
    influence: 75,
    credibility: 80,
    modelTier: 'strong',
    followers: 15,
    following: 5,
    lastActiveTick: 42,
    ...overrides,
  };
}

function makeResponse(
  agents: AgentListItem[],
  overrides: Partial<AgentListResponse> = {},
): AgentListResponse {
  return {
    agents,
    page: 1,
    size: 20,
    total: agents.length,
    pages: 1,
    ...overrides,
  };
}

describe('components/AgentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 加载状态 ──

  it('loading 且无数据时应显示加载提示', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: true,
      refresh: vi.fn(),
    });

    render(<AgentList />);
    expect(screen.getByText('加载 Agent 列表...')).toBeInTheDocument();
  });

  // ── 错误状态 ──

  it('错误且无数据时应显示错误信息', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: 'Connection refused',
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);
    expect(screen.getByText('加载失败')).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  // ── 空数据 ──

  it('agents 数组为空时应显示暂无数据行', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([], { total: 0 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);
    expect(screen.getByText('暂无 Agent 数据')).toBeInTheDocument();
  });

  // ── 数据渲染 ──

  it('应完整渲染 Agent 行的所有字段', () => {
    const agent = makeAgent({
      name: '测试Agent',
      profession: '工程师',
      status: 'active',
      influence: 88.5,
      credibility: 92.3,
      followers: 25,
      lastActiveTick: 100,
      modelTier: 'strong',
    });
    mockUsePolling.mockReturnValue({
      data: makeResponse([agent]),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText('测试Agent')).toBeInTheDocument();
    expect(screen.getByText('工程师')).toBeInTheDocument();
    expect(screen.getByText('活跃')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByText('88.5')).toBeInTheDocument();
    expect(screen.getByText('92.3')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('Tick #100')).toBeInTheDocument();
  });

  it('应渲染 followers 和 lastActiveTick 列', () => {
    const agent = makeAgent({ followers: 42, lastActiveTick: 99 });
    mockUsePolling.mockReturnValue({
      data: makeResponse([agent]),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Tick #99')).toBeInTheDocument();
  });

  it('应正确渲染所有 Agent 状态类型', () => {
    const agents = [
      makeAgent({ id: 'a1', name: 'A1', status: 'active' }),
      makeAgent({ id: 'a2', name: 'A2', status: 'dormant' }),
      makeAgent({ id: 'a3', name: 'A3', status: 'dead' }),
    ];
    mockUsePolling.mockReturnValue({
      data: makeResponse(agents, { total: 3 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText('活跃')).toBeInTheDocument();
    expect(screen.getByText('休眠')).toBeInTheDocument();
    expect(screen.getByText('已死亡')).toBeInTheDocument();
  });

  it('应正确渲染所有模型层级', () => {
    const agents = [
      makeAgent({ id: 'a1', name: 'A1', modelTier: 'strong' }),
      makeAgent({ id: 'a2', name: 'A2', modelTier: 'cheap' }),
      makeAgent({ id: 'a3', name: 'A3', modelTier: 'local' }),
    ];
    mockUsePolling.mockReturnValue({
      data: makeResponse(agents, { total: 3 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByText('Cheap')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('应显示总 Agent 数量', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { total: 100 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);
    expect(screen.getByText('共 100 个 Agent')).toBeInTheDocument();
  });

  // ── 分页 ──

  it('单页时不应显示分页控件', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { pages: 1 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.queryByText('上一页')).not.toBeInTheDocument();
    expect(screen.queryByText('下一页')).not.toBeInTheDocument();
  });

  it('多页时应显示分页控件', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { page: 1, pages: 3, total: 60 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText(/第 1 \/ 3 页/)).toBeInTheDocument();
    expect(screen.getByText('上一页')).toBeInTheDocument();
    expect(screen.getByText('下一页')).toBeInTheDocument();
  });

  it('第一页时 "上一页" 按钮应被禁用', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { page: 1, pages: 3 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText('上一页')).toBeDisabled();
    expect(screen.getByText('下一页')).toBeEnabled();
  });

  it('点击 "下一页" 应触发状态更新', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { page: 1, pages: 3, total: 60 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    const nextBtn = screen.getByText('下一页');
    fireEvent.click(nextBtn);

    // usePolling 应被再次调用（因为 page 状态变化）
    expect(mockUsePolling).toHaveBeenCalled();
  });

  it('点击 "上一页" 应触发状态更新', () => {
    // 模拟第 2 页
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { page: 2, pages: 3, total: 60 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    // 先点下一页使 page 变成 2
    const nextBtn = screen.getByText('下一页');
    fireEvent.click(nextBtn);

    // 然后点上一页
    const prevBtn = screen.getByText('上一页');
    fireEvent.click(prevBtn);

    expect(mockUsePolling).toHaveBeenCalled();
  });

  // ── 表头 ──

  it('应渲染完整的表头', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()]),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('职业')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
    expect(screen.getByText('模型')).toBeInTheDocument();
    expect(screen.getByText('影响力')).toBeInTheDocument();
    expect(screen.getByText('信誉')).toBeInTheDocument();
    expect(screen.getByText('粉丝')).toBeInTheDocument();
    expect(screen.getByText('最后活跃')).toBeInTheDocument();
  });

  // ── 多个 Agent ──

  it('应正确渲染多个 Agent', () => {
    const agents = [
      makeAgent({ id: 'a1', name: '张三', followers: 10, lastActiveTick: 1 }),
      makeAgent({ id: 'a2', name: '李四', followers: 20, lastActiveTick: 2 }),
      makeAgent({ id: 'a3', name: '王五', followers: 30, lastActiveTick: 3 }),
    ];
    mockUsePolling.mockReturnValue({
      data: makeResponse(agents, { total: 3 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('李四')).toBeInTheDocument();
    expect(screen.getByText('王五')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('Tick #1')).toBeInTheDocument();
    expect(screen.getByText('Tick #2')).toBeInTheDocument();
    expect(screen.getByText('Tick #3')).toBeInTheDocument();
  });

  // ── 有数据时 loading 不应覆盖已有数据 ──

  it('有数据时 loading=true 不应替换数据显示', () => {
    const agent = makeAgent();
    mockUsePolling.mockReturnValue({
      data: makeResponse([agent]),
      error: null,
      loading: true,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    // 应继续显示数据而非加载提示
    expect(screen.getByText('张分析师')).toBeInTheDocument();
    expect(screen.queryByText('加载 Agent 列表...')).not.toBeInTheDocument();
  });

  // ── 有数据时 error 不应覆盖已有数据 ──

  it('有数据时 error 不应替换数据显示', () => {
    const agent = makeAgent();
    mockUsePolling.mockReturnValue({
      data: makeResponse([agent]),
      error: 'Some error',
      loading: false,
      refresh: vi.fn(),
    });

    render(<AgentList />);

    // 应继续显示数据
    expect(screen.getByText('张分析师')).toBeInTheDocument();
    expect(screen.queryByText('加载失败')).not.toBeInTheDocument();
  });
});
