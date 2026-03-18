// ============================================================================
// BeeClaw Dashboard — ForecastPage 组件测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  directAnswer: {
    questionType: 'judgement' as const,
    answer: '初步判断是：存在明显扰动，但仍要结合后续执行情况继续观察。',
    confidence: 'medium' as const,
    assumptions: ['政策信号延续', '市场没有出现额外黑天鹅'],
    drivers: ['政策预期', '市场情绪'],
  },
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
    expect(screen.getByText('直接回答')).toBeInTheDocument();
    expect(screen.getByText('判断预测')).toBeInTheDocument();
    expect(screen.getByText('置信度：medium')).toBeInTheDocument();
    expect(screen.getByText(MOCK_RESULT.directAnswer.answer)).toBeInTheDocument();
    expect(screen.getByText('关键假设')).toBeInTheDocument();
    expect(screen.getByText('政策信号延续')).toBeInTheDocument();
    expect(screen.getByText('核心驱动因素')).toBeInTheDocument();
    expect(screen.getByText('政策预期')).toBeInTheDocument();
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

  it('应该按 questionType 显示 directAnswer 标签并展示区间', async () => {
    mockForecast.mockResolvedValueOnce({
      ...MOCK_RESULT,
      directAnswer: {
        questionType: 'numeric-forecast',
        answer: '预计价格在区间内波动。',
        confidence: 'high',
        range: '¥620 ~ ¥780 / 克',
        assumptions: ['国际金价维持高位'],
        drivers: ['国际金价'],
      },
    });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByPlaceholderText(/如果 BeeClaw/), '2027 年黄金每克多少钱？');
    await user.click(screen.getByText('开始推演'));

    expect(await screen.findByText('数值预测')).toBeInTheDocument();
    expect(screen.getByText('置信度：high')).toBeInTheDocument();
    expect(screen.getByText('区间：¥620 ~ ¥780 / 克')).toBeInTheDocument();
  });

  it('没有 range 时不应显示区间标签', async () => {
    mockForecast.mockResolvedValueOnce(MOCK_RESULT);
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByPlaceholderText(/如果 BeeClaw/), '这项政策会不会导致房价下跌？');
    await user.click(screen.getByText('开始推演'));

    await screen.findByText('直接回答');
    expect(screen.queryByText(/区间：/)).not.toBeInTheDocument();
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
