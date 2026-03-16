// ============================================================================
// BeeClaw Dashboard — AgentList 页面增强测试（含数据渲染和分页交互）
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AgentList } from '../pages/AgentList';
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

function renderAgentList() {
  return render(
    <MemoryRouter>
      <AgentList />
    </MemoryRouter>,
  );
}

describe('AgentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 基本渲染 ──

  it('应该渲染页面标题', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();
    expect(screen.getByText('Agent 列表')).toBeInTheDocument();
  });

  it('无数据时应显示空状态', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();
    expect(screen.getByText('暂无 Agent，等待世界引擎启动...')).toBeInTheDocument();
  });

  it('loading 状态且无数据时应显示骨架屏', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      loading: true,
      refresh: vi.fn(),
    });

    const { container } = renderAgentList();
    const skeletons = container.querySelectorAll('[style*="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // ── 错误处理 ──

  it('错误时应显示错误状态和重试按钮', () => {
    const refresh = vi.fn();
    mockUsePolling.mockReturnValue({
      data: null,
      error: 'Network Error',
      loading: false,
      refresh,
    });

    renderAgentList();
    expect(screen.getByText('Network Error')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  // ── 数据渲染 ──

  it('有数据时应渲染 Agent 表格', () => {
    const agent = makeAgent();
    mockUsePolling.mockReturnValue({
      data: makeResponse([agent]),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('共 1 个 Agent')).toBeInTheDocument();
    expect(screen.getByText('张分析师')).toBeInTheDocument();
    expect(screen.getByText('金融分析师')).toBeInTheDocument();
    expect(screen.getByText('活跃')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Tick #42')).toBeInTheDocument();
  });

  it('应渲染表格表头', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()]),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('职业')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
    expect(screen.getByText('模型')).toBeInTheDocument();
    expect(screen.getByText('影响力')).toBeInTheDocument();
    expect(screen.getByText('信誉')).toBeInTheDocument();
    expect(screen.getByText('粉丝')).toBeInTheDocument();
    expect(screen.getByText('最后活跃')).toBeInTheDocument();
  });

  it('Agent 名称应是可点击的链接', () => {
    const agent = makeAgent({ id: 'agent-xyz' });
    mockUsePolling.mockReturnValue({
      data: makeResponse([agent]),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    const link = screen.getByText('张分析师').closest('a');
    expect(link).toHaveAttribute('href', '/agents/agent-xyz');
  });

  it('信誉 >= 50 应显示绿色，< 50 应显示红色', () => {
    const agents = [
      makeAgent({ id: 'a1', name: 'Agent高信誉', credibility: 80 }),
      makeAgent({ id: 'a2', name: 'Agent低信誉', credibility: 30 }),
    ];
    mockUsePolling.mockReturnValue({
      data: makeResponse(agents, { total: 2 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('80')).toHaveClass('text-green-400');
    expect(screen.getByText('30')).toHaveClass('text-red-400');
  });

  it('多个 Agent 应全部渲染', () => {
    const agents = [
      makeAgent({ id: 'a1', name: '张三' }),
      makeAgent({ id: 'a2', name: '李四' }),
      makeAgent({ id: 'a3', name: '王五' }),
    ];
    mockUsePolling.mockReturnValue({
      data: makeResponse(agents, { total: 3 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('共 3 个 Agent')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('李四')).toBeInTheDocument();
    expect(screen.getByText('王五')).toBeInTheDocument();
  });

  // ── 不同状态的 Agent ──

  it('应正确渲染不同状态的 Agent badge', () => {
    const agents = [
      makeAgent({ id: 'a1', name: 'Active', status: 'active' }),
      makeAgent({ id: 'a2', name: 'Dormant', status: 'dormant' }),
      makeAgent({ id: 'a3', name: 'Dead', status: 'dead' }),
    ];
    mockUsePolling.mockReturnValue({
      data: makeResponse(agents, { total: 3 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('活跃')).toBeInTheDocument();
    expect(screen.getByText('休眠')).toBeInTheDocument();
    expect(screen.getByText('淘汰')).toBeInTheDocument();
  });

  it('应正确渲染不同模型层级的 badge', () => {
    const agents = [
      makeAgent({ id: 'a1', name: 'A1', modelTier: 'local' }),
      makeAgent({ id: 'a2', name: 'A2', modelTier: 'cheap' }),
      makeAgent({ id: 'a3', name: 'A3', modelTier: 'strong' }),
    ];
    mockUsePolling.mockReturnValue({
      data: makeResponse(agents, { total: 3 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getByText('Cheap')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  // ── 分页 ──

  it('无需分页时不应显示分页控件', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { pages: 1 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.queryByText('上一页')).not.toBeInTheDocument();
    expect(screen.queryByText('下一页')).not.toBeInTheDocument();
  });

  it('多页时应显示分页控件和当前页码', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([makeAgent()], { page: 1, pages: 5, total: 100 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('第 1 / 5 页')).toBeInTheDocument();
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

    renderAgentList();

    expect(screen.getByText('上一页')).toBeDisabled();
    expect(screen.getByText('下一页')).toBeEnabled();
  });

  it('Agent ID 前 8 位应显示在名称下方', () => {
    const agent = makeAgent({ id: 'agent-123456789-abc' });
    mockUsePolling.mockReturnValue({
      data: makeResponse([agent]),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('agent-12')).toBeInTheDocument();
  });

  // ── 空数据集 ──

  it('agents 数组为空时应显示空状态', () => {
    mockUsePolling.mockReturnValue({
      data: makeResponse([], { total: 0 }),
      error: null,
      loading: false,
      refresh: vi.fn(),
    });

    renderAgentList();

    expect(screen.getByText('暂无 Agent，等待世界引擎启动...')).toBeInTheDocument();
  });
});
