// ============================================================================
// BeeClaw Dashboard — LandingPage 页面组件渲染测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('LandingPage', () => {
  it('应该渲染主标题', () => {
    renderWithRouter(<LandingPage />);
    expect(
      screen.getByRole('heading', {
        name: '把 AI 变成真正能协作、能执行、能持续工作的数字员工。',
      }),
    ).toBeInTheDocument();
  });

  it('应该渲染 BeeClaw 品牌标识', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText('🐝')).toBeInTheDocument();
    expect(screen.getByText('BeeClaw')).toBeInTheDocument();
    expect(screen.getByText('AI Agent 执行平台')).toBeInTheDocument();
  });

  it('应该渲染进入控制台链接', () => {
    renderWithRouter(<LandingPage />);
    const consoleLink = screen.getByRole('link', { name: '进入 BeeClaw 控制台' });
    expect(consoleLink).toHaveAttribute('href', '/dashboard');
  });

  it('应该渲染查看 GitHub 链接', () => {
    renderWithRouter(<LandingPage />);
    const githubLinks = screen.getAllByRole('link', { name: /查看 GitHub|查看源码与项目说明/ });
    expect(githubLinks.length).toBeGreaterThanOrEqual(1);
    githubLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', 'https://github.com/Mouseww/beeclaw');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  it('应该渲染执行/协作/连接三个核心卡片', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText('执行')).toBeInTheDocument();
    expect(screen.getByText('不是回答建议，而是实际推进任务')).toBeInTheDocument();
    expect(screen.getByText('协作')).toBeInTheDocument();
    expect(screen.getByText('多个 Agent 分工协同，覆盖完整流程')).toBeInTheDocument();
    expect(screen.getByText('连接')).toBeInTheDocument();
    expect(screen.getByText('接入消息、浏览器、GitHub、服务器和定时任务')).toBeInTheDocument();
  });

  it('应该渲染"为什么是 BeeClaw"特性卡片', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText('为什么是 BeeClaw')).toBeInTheDocument();
    expect(screen.getByText('不只是聊天，而是执行')).toBeInTheDocument();
    expect(screen.getByText('多 Agent 协作')).toBeInTheDocument();
    expect(screen.getByText('连接真实世界')).toBeInTheDocument();
  });

  it('应该渲染典型场景列表', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText('典型场景')).toBeInTheDocument();
    expect(screen.getByText('团队内部 AI 助理与自动化运营')).toBeInTheDocument();
    expect(screen.getByText('开发任务协作、巡检与发布流程')).toBeInTheDocument();
    expect(screen.getByText('信息采集、工作流编排与提醒跟进')).toBeInTheDocument();
    expect(screen.getByText('面向企业的数字员工与 Agent 基础设施')).toBeInTheDocument();
  });

  it('应该渲染工作方式三步骤', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText('工作方式')).toBeInTheDocument();
    expect(screen.getByText('你提出目标')).toBeInTheDocument();
    expect(screen.getByText('BeeClaw 调工具与流程')).toBeInTheDocument();
    expect(screen.getByText('结果返回并持续推进')).toBeInTheDocument();
  });

  it('应该渲染一句话总结区域', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText('一句话总结')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'BeeClaw 是一个可执行、可协作、可接入真实业务的 AI Agent 平台。',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('不是只会聊天，而是能真正干活的数字员工系统。')).toBeInTheDocument();
  });

  it('应该渲染立即查看控制台链接', () => {
    renderWithRouter(<LandingPage />);
    const consoleLink = screen.getByRole('link', { name: '立即查看控制台' });
    expect(consoleLink).toHaveAttribute('href', '/dashboard');
  });

  it('应该渲染深色主题背景', () => {
    const { container } = renderWithRouter(<LandingPage />);
    const rootDiv = container.querySelector('.bg-slate-950');
    expect(rootDiv).toBeInTheDocument();
  });
});
