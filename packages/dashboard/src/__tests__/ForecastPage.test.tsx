// ============================================================================
// BeeClaw Dashboard — ForecastPage 组件测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ForecastPage } from '../pages/ForecastPage';

// Mock API client
vi.mock('../api/client', () => ({
  forecastScenario: vi.fn(),
}));

import { forecastScenario } from '../api/client';
const mockForecast = vi.mocked(forecastScenario);

function renderPage() {
  return render(
    <MemoryRouter>
      <ForecastPage />
    </MemoryRouter>,
  );
}

const MOCK_RESULT = {
  scenario: 'hot-event' as const,
  scenarioLabel: '热点事件预测',
  event: '央行加息 25 个基点',
  summary: '多数 Agent 认为短期利空股市，长期提升储蓄收益。',
  factions: [
    { name: '看空派', share: 55, summary: '预计市场回调 3-5%' },
    { name: '温和派', share: 30, summary: '影响有限，震荡消化' },
    { name: '看多派', share: 15, summary: '利空出尽即反弹' },
  ],
  keyReactions: [
    { actor: '金融分析师', reaction: '建议减仓科技股' },
    { actor: '散户投资者', reaction: '恐慌性抛售' },
  ],
  risks: ['流动性紧缩传导到实体经济', '新兴市场资本外流'],
  recommendations: ['关注国债收益率曲线变化', '配置防御性板块'],
  metrics: {
    agentCount: 80,
    ticks: 4,
    responsesCollected: 240,
    averageActivatedAgents: 60,
    consensusSignals: 5,
    finalTick: 4,
  },
};

describe('ForecastPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 基本渲染 ──

  it('应该渲染页面标题和输入表单', () => {
    renderPage();

    expect(screen.getByText('推演预测')).toBeInTheDocument();
    expect(screen.getByText('输入一个你想预测的事情')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/如果 BeeClaw/)).toBeInTheDocument();
    expect(screen.getByText('开始推演')).toBeInTheDocument();
  });

  it('应该显示场景选择器和推演轮数', () => {
    renderPage();

    expect(screen.getByText('场景类型')).toBeInTheDocument();
    expect(screen.getByText('推演轮数')).toBeInTheDocument();
    expect(screen.getByText('4 轮')).toBeInTheDocument();
  });

  it('提交按钮在输入为空时应该禁用', () => {
    renderPage();

    const button = screen.getByText('开始推演');
    expect(button).toBeDisabled();
  });

  // ── 成功推演 ──

  it('应该成功提交推演并展示结果', async () => {
    mockForecast.mockResolvedValueOnce(MOCK_RESULT);
    const user = userEvent.setup();

    renderPage();

    const textarea = screen.getByPlaceholderText(/如果 BeeClaw/);
    await user.type(textarea, '央行加息 25 个基点');

    const button = screen.getByText('开始推演');
    expect(button).not.toBeDisabled();
    await user.click(button);

    // 等待结果
    expect(await screen.findByText('推演摘要')).toBeInTheDocument();
    expect(screen.getByText(MOCK_RESULT.summary)).toBeInTheDocument();
    expect(screen.getAllByText('热点事件预测').length).toBeGreaterThanOrEqual(1);

    // 阵营
    expect(screen.getByText('主要阵营')).toBeInTheDocument();
    expect(screen.getByText('看空派')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();

    // 关键反应
    expect(screen.getByText('关键反应')).toBeInTheDocument();
    expect(screen.getByText('金融分析师')).toBeInTheDocument();

    // 风险点和建议
    expect(screen.getByText('风险点')).toBeInTheDocument();
    expect(screen.getByText('流动性紧缩传导到实体经济')).toBeInTheDocument();
    expect(screen.getByText('建议动作')).toBeInTheDocument();
    expect(screen.getByText('关注国债收益率曲线变化')).toBeInTheDocument();

    // 验证 API 调用参数
    expect(mockForecast).toHaveBeenCalledTimes(1);
    expect(mockForecast).toHaveBeenCalledWith({
      event: '央行加息 25 个基点',
      scenario: 'hot-event',
      ticks: 4,
    });
  });

  it('提交中应该显示 "推演中..." 按钮文字', async () => {
    let resolve: (v: typeof MOCK_RESULT) => void;
    mockForecast.mockImplementationOnce(
      () => new Promise((r) => { resolve = r; }),
    );
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByPlaceholderText(/如果 BeeClaw/), '测试');
    await user.click(screen.getByText('开始推演'));

    expect(screen.getByText('推演中...')).toBeInTheDocument();

    // 完成请求
    resolve!(MOCK_RESULT);
    await waitFor(() => expect(screen.queryByText('推演中...')).not.toBeInTheDocument());
  });

  // ── 失败处理 ──

  it('API 失败时应该显示错误信息', async () => {
    mockForecast.mockRejectedValueOnce(new Error('API Error: 500 Internal Server Error'));
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByPlaceholderText(/如果 BeeClaw/), '失败测试');
    await user.click(screen.getByText('开始推演'));

    expect(await screen.findByText('API Error: 500 Internal Server Error')).toBeInTheDocument();
  });

  it('非 Error 类型的异常应该显示通用错误信息', async () => {
    mockForecast.mockRejectedValueOnce('unknown error');
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByPlaceholderText(/如果 BeeClaw/), '失败测试');
    await user.click(screen.getByText('开始推演'));

    expect(await screen.findByText('推演失败')).toBeInTheDocument();
  });

  // ── 交互式行为 ──

  it('空白输入不应该触发 API 调用', async () => {
    const user = userEvent.setup();

    renderPage();

    // 输入空格
    const textarea = screen.getByPlaceholderText(/如果 BeeClaw/);
    await user.type(textarea, '   ');

    const button = screen.getByText('开始推演');
    expect(button).toBeDisabled();

    expect(mockForecast).not.toHaveBeenCalled();
  });
});
