// ============================================================================
// BeeClaw Dashboard — EventInjectForm 组件测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventInjectForm } from '../components/EventInjectForm';

// Mock API client
vi.mock('../api/client', () => ({
  injectEvent: vi.fn(),
}));

import { injectEvent } from '../api/client';

const mockInject = injectEvent as ReturnType<typeof vi.fn>;

describe('EventInjectForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染标题输入框', () => {
    render(<EventInjectForm />);
    expect(screen.getByPlaceholderText('事件标题...')).toBeInTheDocument();
  });

  it('应该渲染详情文本框', () => {
    render(<EventInjectForm />);
    expect(screen.getByPlaceholderText('事件详情...')).toBeInTheDocument();
  });

  it('应该渲染分类选择器并包含全部 5 个分类', () => {
    render(<EventInjectForm />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(5);
    expect(options.map((o) => o.textContent)).toEqual([
      'finance',
      'politics',
      'tech',
      'social',
      'general',
    ]);
  });

  it('应该渲染重要性滑块', () => {
    render(<EventInjectForm />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByText('重要性')).toBeInTheDocument();
    expect(screen.getByText('0.5')).toBeInTheDocument();
  });

  it('应该渲染提交按钮，默认文本为 "注入事件"', () => {
    render(<EventInjectForm />);
    expect(screen.getByRole('button', { name: '注入事件' })).toBeInTheDocument();
  });

  it('标题和内容为空时提交按钮应被禁用', () => {
    render(<EventInjectForm />);
    const button = screen.getByRole('button', { name: '注入事件' });
    expect(button).toBeDisabled();
  });

  it('仅填写标题时提交按钮仍应被禁用', async () => {
    const user = userEvent.setup();
    render(<EventInjectForm />);

    await user.type(screen.getByPlaceholderText('事件标题...'), '测试标题');

    const button = screen.getByRole('button', { name: '注入事件' });
    expect(button).toBeDisabled();
  });

  it('标题和内容都填写后提交按钮应启用', async () => {
    const user = userEvent.setup();
    render(<EventInjectForm />);

    await user.type(screen.getByPlaceholderText('事件标题...'), '测试标题');
    await user.type(screen.getByPlaceholderText('事件详情...'), '测试内容');

    const button = screen.getByRole('button', { name: '注入事件' });
    expect(button).toBeEnabled();
  });

  it('提交成功后应清空表单并调用 onInjected', async () => {
    const user = userEvent.setup();
    const onInjected = vi.fn();
    mockInject.mockResolvedValueOnce({ ok: true });

    render(<EventInjectForm onInjected={onInjected} />);

    await user.type(screen.getByPlaceholderText('事件标题...'), '央行降息');
    await user.type(screen.getByPlaceholderText('事件详情...'), '央行宣布降息25个基点');
    await user.click(screen.getByRole('button', { name: '注入事件' }));

    await waitFor(() => {
      expect(mockInject).toHaveBeenCalledWith({
        title: '央行降息',
        content: '央行宣布降息25个基点',
        category: 'general',
        importance: 0.5,
      });
    });

    await waitFor(() => {
      expect(onInjected).toHaveBeenCalledTimes(1);
    });

    // 表单应被清空
    expect(screen.getByPlaceholderText('事件标题...')).toHaveValue('');
    expect(screen.getByPlaceholderText('事件详情...')).toHaveValue('');
  });

  it('提交失败时应显示错误消息', async () => {
    const user = userEvent.setup();
    mockInject.mockRejectedValueOnce(new Error('服务器错误'));

    render(<EventInjectForm />);

    await user.type(screen.getByPlaceholderText('事件标题...'), '测试');
    await user.type(screen.getByPlaceholderText('事件详情...'), '内容');
    await user.click(screen.getByRole('button', { name: '注入事件' }));

    await waitFor(() => {
      expect(screen.getByText('服务器错误')).toBeInTheDocument();
    });
  });

  it('提交失败时非 Error 对象应显示默认错误消息', async () => {
    const user = userEvent.setup();
    mockInject.mockRejectedValueOnce('unknown');

    render(<EventInjectForm />);

    await user.type(screen.getByPlaceholderText('事件标题...'), '测试');
    await user.type(screen.getByPlaceholderText('事件详情...'), '内容');
    await user.click(screen.getByRole('button', { name: '注入事件' }));

    await waitFor(() => {
      expect(screen.getByText('注入失败')).toBeInTheDocument();
    });
  });

  it('可以切换分类并以选定分类提交', async () => {
    const user = userEvent.setup();
    mockInject.mockResolvedValueOnce({ ok: true });

    render(<EventInjectForm />);

    await user.type(screen.getByPlaceholderText('事件标题...'), '科技突破');
    await user.type(screen.getByPlaceholderText('事件详情...'), 'AGI 实现');
    await user.selectOptions(screen.getByRole('combobox'), 'tech');
    await user.click(screen.getByRole('button', { name: '注入事件' }));

    await waitFor(() => {
      expect(mockInject).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'tech' }),
      );
    });
  });
});
