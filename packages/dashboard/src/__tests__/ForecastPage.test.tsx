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
  resultType: 'Judgment' as const,
  mainResult: {
    type: 'Judgment' as const,
    headline: '直接判断：存在明显扰动，但仍要结合后续执行情况继续观察。',
    verdict: '有条件成立',
    reasoning: ['政策预期', '市场情绪'],
    conditions: ['政策信号延续', '市场没有出现额外黑天鹅'],
  },
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
    expect(screen.getByText('主结果')).toBeInTheDocument();
    expect(screen.getByText('判断结果')).toBeInTheDocument();
    expect(screen.getByText('类型：Judgment')).toBeInTheDocument();
    expect(screen.getByText(MOCK_RESULT.mainResult.headline)).toBeInTheDocument();
    expect(screen.getByText('明确判断')).toBeInTheDocument();
    expect(screen.getByText('有条件成立')).toBeInTheDocument();
    expect(screen.getByText('判断依据')).toBeInTheDocument();
    expect(screen.getByText('政策预期')).toBeInTheDocument();
    expect(screen.getByText(MOCK_RESULT.summary)).toBeInTheDocument();
    expect(screen.getAllByText('热点事件预测').length).toBeGreaterThanOrEqual(1);

    // 阵营
    expect(screen.getByText('推演中的主要视角')).toBeInTheDocument();
    expect(screen.getByText('看空派')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();

    // 关键反应
    expect(screen.getByText('支撑证据 / 关键反应')).toBeInTheDocument();
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
      resultType: 'ForecastValue',
      mainResult: {
        type: 'ForecastValue',
        headline: '我判断 2027 年黄金价格大概率在区间内波动。',
        pointEstimate: '¥690/克',
        range: '¥620 ~ ¥780 / 克',
        confidence: 'high',
        timepoint: '2027 年',
        assumptions: ['国际金价维持高位'],
        drivers: ['国际金价'],
      },
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
    expect(screen.getByText('类型：ForecastValue')).toBeInTheDocument();
    expect(screen.getByText('预测值')).toBeInTheDocument();
    expect(screen.getByText('¥690/克')).toBeInTheDocument();
    expect(screen.getByText('预测区间')).toBeInTheDocument();
    expect(screen.getByText('¥620 ~ ¥780 / 克')).toBeInTheDocument();
    expect(screen.getByText('时间点')).toBeInTheDocument();
    expect(screen.getByText('2027 年')).toBeInTheDocument();
  });

  it('没有 range 时不应显示区间标签', async () => {
    mockForecast.mockResolvedValueOnce(MOCK_RESULT);
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByPlaceholderText(/如果 BeeClaw/), '这项政策会不会导致房价下跌？');
    await user.click(screen.getByText('开始推演'));

    await screen.findByText('主结果');
    expect(screen.queryByText(/区间：/)).not.toBeInTheDocument();
  });


  it('Reaction 类型应优先展示 mainResult 的反应顺序', async () => {
    mockForecast.mockResolvedValueOnce({
      ...MOCK_RESULT,
      resultType: 'Reaction',
      mainResult: {
        type: 'Reaction',
        headline: '市场短期会先兴奋，中期会迅速分化。',
        sequence: [
          { actor: '媒体', reaction: '会先把它定义成新叙事', timing: '第一波' },
          { actor: '投资人', reaction: '会转向看留存和商业化', timing: '第二波' },
        ],
        divergence: ['短期热度高', '中期重新定价'],
        consensus: ['不会快速收敛成单一观点'],
      },
    });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByPlaceholderText(/如果 BeeClaw/), '如果 OpenAI 发布 AI 浏览器，市场会怎么反应？');
    await user.click(screen.getByText('开始推演'));

    expect(await screen.findByText('市场反应')).toBeInTheDocument();
    expect(screen.getByText('反应顺序')).toBeInTheDocument();
    expect(screen.getByText('媒体')).toBeInTheDocument();
    expect(screen.getByText('会先把它定义成新叙事')).toBeInTheDocument();
    expect(screen.getByText('第一波')).toBeInTheDocument();
  });

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
