// ============================================================================
// BeeClaw Dashboard — Settings 页面测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '../pages/Settings';

// Mock fetch
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
});

function mockLLMConfig() {
  return {
    local: {
      baseURL: 'http://localhost:11434',
      apiKey: '',
      model: 'qwen2.5:7b',
      maxTokens: 4096,
      temperature: 0.7,
    },
    cheap: {
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-cheap-key',
      model: 'gpt-4o-mini',
      maxTokens: 2048,
      temperature: 0.5,
    },
    strong: {
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-strong-key',
      model: 'gpt-4o',
      maxTokens: 8192,
      temperature: 0.3,
    },
  };
}

describe('Settings', () => {
  it('加载中应显示骨架屏', () => {
    // 让 fetch 保持 pending
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    const { container } = render(<Settings />);

    // 应有骨架动画
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('加载失败时应显示错误状态', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('500 Internal Server Error')).toBeInTheDocument();
    });
  });

  it('加载失败时点击重试应重新请求', async () => {
    const user = userEvent.setup();
    // 第一次失败
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('500 Internal Server Error')).toBeInTheDocument();
    });

    // 第二次成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    await user.click(screen.getByText('重试'));

    await waitFor(() => {
      expect(screen.getByText('⚙️ 系统设置')).toBeInTheDocument();
    });
  });

  it('成功加载后应渲染页面标题和描述', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('⚙️ 系统设置')).toBeInTheDocument();
    });
    expect(screen.getByText('LLM 模型配置 — 设置不同用途的模型端点')).toBeInTheDocument();
  });

  it('应渲染三个模型层级卡片', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Local 本地模型')).toBeInTheDocument();
    });
    expect(screen.getByText('Cheap 经济模型')).toBeInTheDocument();
    expect(screen.getByText('Strong 强力模型')).toBeInTheDocument();
  });

  it('每个层级卡片应显示对应的描述', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('低延迟本地推理，适合简单任务')).toBeInTheDocument();
    });
    expect(screen.getByText('性价比优先，日常批量推理')).toBeInTheDocument();
    expect(screen.getByText('最高质量推理，复杂决策场景')).toBeInTheDocument();
  });

  it('每个层级卡片应显示图标', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('🏠')).toBeInTheDocument();
    });
    expect(screen.getByText('💰')).toBeInTheDocument();
    expect(screen.getByText('🚀')).toBeInTheDocument();
  });

  it('初始状态下保存按钮应显示 "无更改" 且被禁用', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Local 本地模型')).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByText('无更改');
    expect(saveButtons).toHaveLength(3);
    saveButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('修改输入字段后保存按钮应启用', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Local 本地模型')).toBeInTheDocument();
    });

    // 找到第一个 Model 输入框并修改
    const modelInputs = screen.getAllByPlaceholderText('qwen2.5:7b');
    expect(modelInputs.length).toBeGreaterThanOrEqual(1);
    await user.clear(modelInputs[0]);
    await user.type(modelInputs[0], 'llama3:8b');

    // 应出现一个 "💾 保存配置" 按钮
    const saveButton = screen.getByText('💾 保存配置');
    expect(saveButton).toBeEnabled();
  });

  it('保存成功后应显示成功 toast', async () => {
    const user = userEvent.setup();
    const config = mockLLMConfig();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(config),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Local 本地模型')).toBeInTheDocument();
    });

    // 修改一个字段
    const modelInputs = screen.getAllByPlaceholderText('qwen2.5:7b');
    await user.clear(modelInputs[0]);
    await user.type(modelInputs[0], 'llama3:8b');

    // Mock PUT 请求成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, config }),
    });

    await user.click(screen.getByText('💾 保存配置'));

    await waitFor(() => {
      expect(screen.getByText(/Local 本地模型 配置已保存/)).toBeInTheDocument();
    });
  });

  it('保存失败时应显示失败 toast', async () => {
    const user = userEvent.setup();
    const config = mockLLMConfig();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(config),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Local 本地模型')).toBeInTheDocument();
    });

    // 修改一个字段
    const modelInputs = screen.getAllByPlaceholderText('qwen2.5:7b');
    await user.clear(modelInputs[0]);
    await user.type(modelInputs[0], 'bad-model');

    // Mock PUT 请求失败
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: '无效的模型名称' }),
    });

    await user.click(screen.getByText('💾 保存配置'));

    await waitFor(() => {
      expect(screen.getByText(/保存失败.*无效的模型名称/)).toBeInTheDocument();
    });
  });

  it('应渲染底部说明文字', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText(/配置修改即时生效/)).toBeInTheDocument();
    });
  });

  it('API Key 输入框默认应为密码类型', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Local 本地模型')).toBeInTheDocument();
    });

    const apiKeyInputs = screen.getAllByPlaceholderText('sk-...');
    apiKeyInputs.forEach((input) => {
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  it('点击显示/隐藏按钮应切换 API Key 可见性', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockLLMConfig()),
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Local 本地模型')).toBeInTheDocument();
    });

    const apiKeyInputs = screen.getAllByPlaceholderText('sk-...');
    // 找到第一个 API key 输入框旁边的 toggle 按钮
    const toggleButtons = screen.getAllByText('👁️');
    expect(toggleButtons.length).toBeGreaterThanOrEqual(1);

    // 点击第一个 toggle 切换为可见
    await user.click(toggleButtons[0]);
    expect(apiKeyInputs[0]).toHaveAttribute('type', 'text');

    // 再次点击切换回隐藏
    const hideButton = screen.getAllByText('🙈');
    await user.click(hideButton[0]);
    expect(apiKeyInputs[0]).toHaveAttribute('type', 'password');
  });
});
