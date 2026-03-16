// ============================================================================
// @beeclaw/cli inject 模块单元测试
// 测试事件注入命令的参数解析、校验和主流程
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventCategory } from '@beeclaw/shared';

// inject.ts 在顶层调用 main()，无法直接导入。
// 按照 cli.test.ts 的模式，复现 parseArgs 逻辑并独立测试。

const VALID_CATEGORIES: EventCategory[] = ['finance', 'politics', 'tech', 'social', 'general'];

/** 复现 inject.ts 中的 parseArgs 逻辑，供单元测试使用 */
function parseInjectArgs(args: string[]): {
  title: string;
  content: string;
  category: EventCategory;
  importance: number;
  propagationRadius: number;
  tags: string[];
  runTicks: number;
  agentCount: number;
  help: boolean;
  missingTitle: boolean;
} {
  let title = '';
  let content = '';
  let category: EventCategory = 'general';
  let importance = 0.7;
  let propagationRadius = 0.5;
  let tags: string[] = [];
  let runTicks = 1;
  let agentCount = 10;
  let help = false;

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
          category = VALID_CATEGORIES.includes(val as EventCategory) ? val as EventCategory : 'general';
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
      case '--help':
      case '-h':
        help = true;
        break;
      default:
        // 无标志的第一个参数视为 title
        if (!title) title = arg;
        break;
    }
  }

  // content 默认与 title 相同
  if (!content) content = title;

  return {
    title, content, category, importance, propagationRadius,
    tags, runTicks, agentCount, help,
    missingTitle: !title,
  };
}

describe('inject — parseArgs', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 正常路径 ──

  describe('正常路径', () => {
    it('位置参数应作为 title', () => {
      const result = parseInjectArgs(['央行降息']);
      expect(result.title).toBe('央行降息');
      expect(result.content).toBe('央行降息');
    });

    it('--title / -T 应设置标题', () => {
      expect(parseInjectArgs(['--title', '事件A']).title).toBe('事件A');
      expect(parseInjectArgs(['-T', '事件B']).title).toBe('事件B');
    });

    it('--content / -c 应设置独立内容', () => {
      const result = parseInjectArgs(['-T', '标题', '-c', '详细内容']);
      expect(result.title).toBe('标题');
      expect(result.content).toBe('详细内容');
    });

    it('--category / -C 应设置有效分类', () => {
      for (const cat of VALID_CATEGORIES) {
        expect(parseInjectArgs(['test', '--category', cat]).category).toBe(cat);
      }
      expect(parseInjectArgs(['test', '-C', 'finance']).category).toBe('finance');
    });

    it('--importance 应设置重要性', () => {
      expect(parseInjectArgs(['test', '--importance', '0.9']).importance).toBeCloseTo(0.9);
    });

    it('--radius 应设置传播半径', () => {
      expect(parseInjectArgs(['test', '--radius', '0.3']).propagationRadius).toBeCloseTo(0.3);
    });

    it('--tags 应解析逗号分隔标签', () => {
      const result = parseInjectArgs(['test', '--tags', '金融, 加息, 利率 ']);
      expect(result.tags).toEqual(['金融', '加息', '利率']);
    });

    it('--ticks / -t 应设置运行 tick 数', () => {
      expect(parseInjectArgs(['test', '--ticks', '5']).runTicks).toBe(5);
      expect(parseInjectArgs(['test', '-t', '3']).runTicks).toBe(3);
    });

    it('--agents / -a 应设置 agent 数量', () => {
      expect(parseInjectArgs(['test', '--agents', '50']).agentCount).toBe(50);
      expect(parseInjectArgs(['test', '-a', '20']).agentCount).toBe(20);
    });

    it('--help / -h 应标记 help', () => {
      expect(parseInjectArgs(['--help']).help).toBe(true);
      expect(parseInjectArgs(['-h']).help).toBe(true);
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

  // ── 边界情况 ──

  describe('边界情况', () => {
    it('无参数应标记 missingTitle', () => {
      const result = parseInjectArgs([]);
      expect(result.missingTitle).toBe(true);
    });

    it('无效 category 应回退为 general', () => {
      expect(parseInjectArgs(['test', '-C', 'invalid']).category).toBe('general');
      expect(parseInjectArgs(['test', '-C', '']).category).toBe('general');
    });

    it('无效数值应使用默认值', () => {
      expect(parseInjectArgs(['test', '--importance', 'abc']).importance).toBeCloseTo(0.7);
      expect(parseInjectArgs(['test', '--radius', 'xyz']).propagationRadius).toBeCloseTo(0.5);
      expect(parseInjectArgs(['test', '-t', 'abc']).runTicks).toBe(1);
      expect(parseInjectArgs(['test', '-a', 'xyz']).agentCount).toBe(10);
    });

    it('--tags 为空字符串应返回空数组', () => {
      expect(parseInjectArgs(['test', '--tags', '']).tags).toEqual([]);
    });

    it('--tags 包含空格应被 trim 和过滤', () => {
      const result = parseInjectArgs(['test', '--tags', ' , a , , b ']);
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('多个位置参数只有第一个作为 title', () => {
      const result = parseInjectArgs(['第一个', '第二个', '第三个']);
      expect(result.title).toBe('第一个');
    });

    it('content 不提供时默认等于 title', () => {
      const result = parseInjectArgs(['-T', '仅标题']);
      expect(result.content).toBe('仅标题');
    });

    it('--importance 为 0 应使用默认值', () => {
      // parseFloat('0') = 0, 0 || 0.7 = 0.7 — 这是源码行为
      expect(parseInjectArgs(['test', '--importance', '0']).importance).toBeCloseTo(0.7);
    });

    it('缺少 flag 值时应使用默认值', () => {
      // --title 后无值
      const result = parseInjectArgs(['--title']);
      expect(result.title).toBe('');
      expect(result.missingTitle).toBe(true);
    });
  });

  // ── 默认值 ──

  describe('默认值', () => {
    it('所有默认值应正确', () => {
      const result = parseInjectArgs(['测试标题']);
      expect(result.category).toBe('general');
      expect(result.importance).toBeCloseTo(0.7);
      expect(result.propagationRadius).toBeCloseTo(0.5);
      expect(result.tags).toEqual([]);
      expect(result.runTicks).toBe(1);
      expect(result.agentCount).toBe(10);
      expect(result.help).toBe(false);
      expect(result.missingTitle).toBe(false);
    });
  });
});
