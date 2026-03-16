// ============================================================================
// BeeClaw Dashboard — ThemeToggle 组件测试
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../components/ThemeToggle';

describe('ThemeToggle', () => {
  it('system 主题应显示跟随系统图标和标签', () => {
    render(<ThemeToggle theme="system" onCycle={() => {}} />);

    expect(screen.getByText('🖥️')).toBeInTheDocument();
    expect(screen.getByText('跟随系统')).toBeInTheDocument();
  });

  it('light 主题应显示亮色模式图标和标签', () => {
    render(<ThemeToggle theme="light" onCycle={() => {}} />);

    expect(screen.getByText('☀️')).toBeInTheDocument();
    expect(screen.getByText('亮色模式')).toBeInTheDocument();
  });

  it('dark 主题应显示暗色模式图标和标签', () => {
    render(<ThemeToggle theme="dark" onCycle={() => {}} />);

    expect(screen.getByText('🌙')).toBeInTheDocument();
    expect(screen.getByText('暗色模式')).toBeInTheDocument();
  });

  it('按钮 title 属性应与当前主题标签一致', () => {
    const { rerender } = render(<ThemeToggle theme="system" onCycle={() => {}} />);
    expect(screen.getByTitle('跟随系统')).toBeInTheDocument();

    rerender(<ThemeToggle theme="light" onCycle={() => {}} />);
    expect(screen.getByTitle('亮色模式')).toBeInTheDocument();

    rerender(<ThemeToggle theme="dark" onCycle={() => {}} />);
    expect(screen.getByTitle('暗色模式')).toBeInTheDocument();
  });

  it('点击按钮应调用 onCycle 回调', async () => {
    const user = userEvent.setup();
    const onCycle = vi.fn();
    render(<ThemeToggle theme="system" onCycle={onCycle} />);

    await user.click(screen.getByRole('button'));

    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it('多次点击应多次触发 onCycle', async () => {
    const user = userEvent.setup();
    const onCycle = vi.fn();
    render(<ThemeToggle theme="system" onCycle={onCycle} />);

    const button = screen.getByRole('button');
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(onCycle).toHaveBeenCalledTimes(3);
  });
});
