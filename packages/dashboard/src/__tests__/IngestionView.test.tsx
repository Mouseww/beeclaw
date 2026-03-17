// ============================================================================
// BeeClaw Dashboard — IngestionView 页面增强测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IngestionView } from '../pages/IngestionView';
import { fetchIngestionStatus } from '../api/client';
import type { IngestionStatus } from '../types';

// Mock API 客户端
vi.mock('../api/client', () => ({
  fetchIngestionStatus: vi.fn(),
}));

const mockFetchIngestionStatus = fetchIngestionStatus as ReturnType<typeof vi.fn>;

function makeIngestionStatus(overrides: Partial<IngestionStatus> = {}): IngestionStatus {
  return {
    running: true,
    sourceCount: 3,
    financeSourceCount: 2,
    deduplicationCacheSize: 150,
    sources: [],
    financeSources: [],
    ...overrides,
  };
}

function renderIngestionView() {
  return render(
    <MemoryRouter>
      <IngestionView />
    </MemoryRouter>,
  );
}

describe('IngestionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 基本渲染 ──

  it('应渲染页面标题和描述', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus());

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('事件接入')).toBeInTheDocument();
    });
    expect(screen.getByText('RSS 和金融数据源状态监控')).toBeInTheDocument();
  });

  // ── 加载状态 ──

  it('初始加载时应显示加载提示', () => {
    // 永远不 resolve 的 promise 模拟加载中
    mockFetchIngestionStatus.mockReturnValue(new Promise(() => {}));

    renderIngestionView();
    expect(screen.getByText('正在加载事件接入状态...')).toBeInTheDocument();
  });

  // ── 错误状态 ──

  it('加载失败应显示错误信息和重试按钮', async () => {
    mockFetchIngestionStatus.mockRejectedValue(new Error('连接失败'));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('连接失败')).toBeInTheDocument();
    });
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  it('点击重试按钮应重新加载', async () => {
    mockFetchIngestionStatus.mockRejectedValueOnce(new Error('连接失败'));
    mockFetchIngestionStatus.mockResolvedValueOnce(makeIngestionStatus());

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('重试')).toBeInTheDocument();
    });

    await user.click(screen.getByText('重试'));

    await waitFor(() => {
      expect(screen.getByText('运行状态')).toBeInTheDocument();
    });
  });

  // ── 统计卡片 ──

  it('应渲染 4 个统计卡片', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      running: true,
      sourceCount: 3,
      financeSourceCount: 2,
      deduplicationCacheSize: 150,
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('运行状态')).toBeInTheDocument();
    });
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('RSS 数据源')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('金融数据源')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('去重缓存')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('运行状态停止时应显示 "已停止"', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({ running: false }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('已停止')).toBeInTheDocument();
    });
  });

  // ── RSS 数据源行 ──

  it('应渲染 RSS 数据源列表', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      sources: [
        {
          id: 'rss-1',
          name: '36氪',
          url: 'https://36kr.com/feed',
          enabled: true,
          itemsFetched: 42,
          eventsEmitted: 30,
          lastPollTime: '2025-01-01T12:00:00Z',
          lastError: null,
        },
      ],
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('36氪')).toBeInTheDocument();
    });
    expect(screen.getByText('https://36kr.com/feed')).toBeInTheDocument();
  });

  it('禁用的 RSS 数据源应显示 "已禁用" badge', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      sources: [
        {
          id: 'rss-1',
          name: 'Disabled Source',
          url: 'https://example.com/feed',
          enabled: false,
          itemsFetched: 0,
          eventsEmitted: 0,
          lastPollTime: null,
          lastError: null,
        },
      ],
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('已禁用')).toBeInTheDocument();
    });
  });

  it('有错误的 RSS 数据源应显示错误提示', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      sources: [
        {
          id: 'rss-1',
          name: 'Error Source',
          url: 'https://example.com/bad-feed',
          enabled: true,
          itemsFetched: 10,
          eventsEmitted: 5,
          lastPollTime: '2025-01-01T12:00:00Z',
          lastError: 'DNS resolution failed',
        },
      ],
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText(/DNS resolution failed/)).toBeInTheDocument();
    });
  });

  // ── 金融数据源行 ──

  it('应渲染金融数据源列表', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      financeSources: [
        {
          id: 'fin-1',
          name: 'Yahoo Finance',
          enabled: true,
          running: true,
          symbolCount: 50,
          quotesPolled: 1000,
          eventsEmitted: 120,
          lastPollTime: '2025-01-01T12:00:00Z',
          lastError: null,
        },
      ],
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('Yahoo Finance')).toBeInTheDocument();
    });
    // "运行中" 同时出现在统计卡片和金融数据源 badge 中，使用 getAllByText
    expect(screen.getAllByText('运行中').length).toBeGreaterThanOrEqual(1);
  });

  it('停止的金融数据源应显示 "已停止" badge', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      financeSources: [
        {
          id: 'fin-1',
          name: 'Stopped Source',
          enabled: true,
          running: false,
          symbolCount: 10,
          quotesPolled: 0,
          eventsEmitted: 0,
          lastPollTime: null,
          lastError: null,
        },
      ],
    }));

    renderIngestionView();

    await waitFor(() => {
      // "已停止" 来自金融数据源的 badge
      expect(screen.getAllByText('已停止').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('禁用的金融数据源应显示 "已禁用" badge', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      financeSources: [
        {
          id: 'fin-1',
          name: 'Disabled Finance',
          enabled: false,
          running: false,
          symbolCount: 0,
          quotesPolled: 0,
          eventsEmitted: 0,
          lastPollTime: null,
          lastError: null,
        },
      ],
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('已禁用')).toBeInTheDocument();
    });
  });

  // ── 空源列表 ──

  it('无数据源时应显示空状态', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      sources: [],
      financeSources: [],
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('暂无已配置的数据源')).toBeInTheDocument();
    });
  });

  // ── 混合数据源 ──

  it('应同时渲染 RSS 和金融数据源', async () => {
    mockFetchIngestionStatus.mockResolvedValue(makeIngestionStatus({
      sources: [
        {
          id: 'rss-1',
          name: 'RSS Feed',
          url: 'https://rss.example.com',
          enabled: true,
          itemsFetched: 10,
          eventsEmitted: 5,
          lastPollTime: null,
          lastError: null,
        },
      ],
      financeSources: [
        {
          id: 'fin-1',
          name: 'Finance API',
          enabled: true,
          running: true,
          symbolCount: 20,
          quotesPolled: 100,
          eventsEmitted: 50,
          lastPollTime: null,
          lastError: null,
        },
      ],
    }));

    renderIngestionView();

    await waitFor(() => {
      expect(screen.getByText('RSS Feed')).toBeInTheDocument();
    });
    expect(screen.getByText('Finance API')).toBeInTheDocument();
  });
});
