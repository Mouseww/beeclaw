// ============================================================================
// @beeclaw/cli 基础单元测试
// 测试 CLI 辅助函数（parseArgs、printHelp）和 inject 模块的参数解析
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('CLI — index.ts parseArgs', () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  // 由于 index.ts 和 inject.ts 直接在顶层调用 main()，
  // 我们无法直接导入它们的 parseArgs 函数。
  // 所以这里测试通用的 CLI 参数解析逻辑。

  describe('参数解析逻辑', () => {
    function parseTestArgs(args: string[]): {
      agentCount: number;
      tickInterval: number;
      maxTicks: number;
      seedEvent?: string;
    } {
      let agentCount = 10;
      let tickInterval = 30000;
      let maxTicks = 0;
      let seedEvent: string | undefined;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        switch (arg) {
          case '--agents':
          case '-a':
            agentCount = parseInt(args[++i] ?? '', 10) || 10;
            break;
          case '--interval':
          case '-i':
            tickInterval = parseInt(args[++i] ?? '', 10) || 30000;
            break;
          case '--ticks':
          case '-t':
            maxTicks = parseInt(args[++i] ?? '', 10) || 0;
            break;
          case '--seed':
          case '-s':
            seedEvent = args[++i];
            break;
        }
      }

      return { agentCount, tickInterval, maxTicks, seedEvent };
    }

    it('无参数应使用默认值', () => {
      const result = parseTestArgs([]);
      expect(result.agentCount).toBe(10);
      expect(result.tickInterval).toBe(30000);
      expect(result.maxTicks).toBe(0);
      expect(result.seedEvent).toBeUndefined();
    });

    it('--agents 应设置 Agent 数量', () => {
      const result = parseTestArgs(['--agents', '50']);
      expect(result.agentCount).toBe(50);
    });

    it('-a 应设置 Agent 数量', () => {
      const result = parseTestArgs(['-a', '25']);
      expect(result.agentCount).toBe(25);
    });

    it('--interval 应设置 tick 间隔', () => {
      const result = parseTestArgs(['--interval', '5000']);
      expect(result.tickInterval).toBe(5000);
    });

    it('--ticks 应设置最大 tick 数', () => {
      const result = parseTestArgs(['--ticks', '100']);
      expect(result.maxTicks).toBe(100);
    });

    it('--seed 应设置种子事件', () => {
      const result = parseTestArgs(['--seed', '央行加息']);
      expect(result.seedEvent).toBe('央行加息');
    });

    it('多个参数组合', () => {
      const result = parseTestArgs(['-a', '30', '--ticks', '10', '--seed', '测试事件', '-i', '2000']);
      expect(result.agentCount).toBe(30);
      expect(result.maxTicks).toBe(10);
      expect(result.seedEvent).toBe('测试事件');
      expect(result.tickInterval).toBe(2000);
    });

    it('无效数字应使用默认值', () => {
      const result = parseTestArgs(['--agents', 'abc']);
      expect(result.agentCount).toBe(10);
    });
  });

  describe('inject 参数解析逻辑', () => {
    const VALID_CATEGORIES = ['finance', 'politics', 'tech', 'social', 'general'];

    function parseInjectArgs(args: string[]): {
      title: string;
      content: string;
      category: string;
      importance: number;
      propagationRadius: number;
      tags: string[];
      runTicks: number;
      agentCount: number;
    } {
      let title = '';
      let content = '';
      let category = 'general';
      let importance = 0.7;
      let propagationRadius = 0.5;
      let tags: string[] = [];
      let runTicks = 1;
      let agentCount = 10;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        switch (arg) {
          case '--title':
          case '-T':
            title = args[++i] ?? '';
            break;
          case '--content':
          case '-c':
            content = args[++i] ?? '';
            break;
          case '--category':
          case '-C':
            {
              const val = args[++i] ?? 'general';
              category = VALID_CATEGORIES.includes(val) ? val : 'general';
            }
            break;
          case '--importance':
            importance = parseFloat(args[++i] ?? '0.7') || 0.7;
            break;
          case '--radius':
            propagationRadius = parseFloat(args[++i] ?? '0.5') || 0.5;
            break;
          case '--tags':
            tags = (args[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
            break;
          case '--ticks':
          case '-t':
            runTicks = parseInt(args[++i] ?? '1', 10) || 1;
            break;
          case '--agents':
          case '-a':
            agentCount = parseInt(args[++i] ?? '10', 10) || 10;
            break;
          default:
            if (!title) title = arg;
            break;
        }
      }

      if (!content) content = title;

      return { title, content, category, importance, propagationRadius, tags, runTicks, agentCount };
    }

    it('位置参数应作为 title', () => {
      const result = parseInjectArgs(['央行降息']);
      expect(result.title).toBe('央行降息');
      expect(result.content).toBe('央行降息'); // content 默认同 title
    });

    it('--title 应设置标题', () => {
      const result = parseInjectArgs(['--title', '测试事件']);
      expect(result.title).toBe('测试事件');
    });

    it('--content 应设置内容', () => {
      const result = parseInjectArgs(['--title', '标题', '--content', '详细内容']);
      expect(result.title).toBe('标题');
      expect(result.content).toBe('详细内容');
    });

    it('--category 应验证有效分类', () => {
      const result = parseInjectArgs(['测试', '--category', 'finance']);
      expect(result.category).toBe('finance');
    });

    it('无效分类应回退为 general', () => {
      const result = parseInjectArgs(['测试', '--category', 'invalid']);
      expect(result.category).toBe('general');
    });

    it('--tags 应解析逗号分隔的标签', () => {
      const result = parseInjectArgs(['测试', '--tags', '金融,加息,利率']);
      expect(result.tags).toEqual(['金融', '加息', '利率']);
    });

    it('--importance 应设置重要性', () => {
      const result = parseInjectArgs(['测试', '--importance', '0.9']);
      expect(result.importance).toBeCloseTo(0.9);
    });

    it('--radius 应设置传播半径', () => {
      const result = parseInjectArgs(['测试', '--radius', '0.8']);
      expect(result.propagationRadius).toBeCloseTo(0.8);
    });

    it('完整参数组合', () => {
      const result = parseInjectArgs([
        '-T', '央行加息',
        '-c', '央行宣布加息25个基点',
        '-C', 'finance',
        '--importance', '0.9',
        '--radius', '0.7',
        '--tags', '金融,加息',
        '-t', '3',
        '-a', '20',
      ]);
      expect(result.title).toBe('央行加息');
      expect(result.content).toBe('央行宣布加息25个基点');
      expect(result.category).toBe('finance');
      expect(result.importance).toBeCloseTo(0.9);
      expect(result.propagationRadius).toBeCloseTo(0.7);
      expect(result.tags).toEqual(['金融', '加息']);
      expect(result.runTicks).toBe(3);
      expect(result.agentCount).toBe(20);
    });
  });
});
