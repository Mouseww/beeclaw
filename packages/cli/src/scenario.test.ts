// ============================================================================
// @beeclaw/cli scenario 模块单元测试
// 测试场景命令的参数解析和子命令路由
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// scenario.ts 在顶层调用 main()，无法直接导入。
// 按照 cli.test.ts 的模式，复现 parseScenarioArgs 逻辑并独立测试。

type SubCommand = 'list' | 'describe' | 'run' | 'help';

interface ScenarioArgs {
  subCommand: SubCommand;
  templateName?: string;
  maxTicks?: number;
  concurrency?: number;
}

/** 复现 scenario.ts 中的 parseScenarioArgs 逻辑 */
function parseScenarioArgs(args: string[]): ScenarioArgs {
  let templateName: string | undefined;
  let maxTicks: number | undefined;
  let concurrency: number | undefined;

  if (args.length === 0) {
    return { subCommand: 'help' };
  }

  const cmd = args[0]!;
  let subCommand: SubCommand;
  if (['list', 'describe', 'run', 'help'].includes(cmd)) {
    subCommand = cmd as SubCommand;
  } else {
    // 第一个参数不是子命令，当作模板名用 run
    subCommand = 'run';
    templateName = cmd;
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case '--name':
      case '-n':
        templateName = args[++i];
        break;
      case '--ticks':
      case '-t':
        maxTicks = parseInt(args[++i] ?? '', 10) || undefined;
        break;
      case '--concurrency':
      case '-c':
        concurrency = parseInt(args[++i] ?? '', 10) || undefined;
        break;
      case '--help':
      case '-h':
        subCommand = 'help';
        break;
      default:
        // 非 flag 参数作为模板名
        if (!templateName && !arg.startsWith('-')) {
          templateName = arg;
        }
        break;
    }
  }

  return { subCommand, templateName, maxTicks, concurrency };
}

describe('scenario — parseScenarioArgs', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 子命令解析 ──

  describe('子命令解析', () => {
    it('无参数应返回 help', () => {
      const result = parseScenarioArgs([]);
      expect(result.subCommand).toBe('help');
    });

    it('list 应被正确识别', () => {
      expect(parseScenarioArgs(['list']).subCommand).toBe('list');
    });

    it('describe 应被正确识别', () => {
      expect(parseScenarioArgs(['describe']).subCommand).toBe('describe');
    });

    it('run 应被正确识别', () => {
      expect(parseScenarioArgs(['run']).subCommand).toBe('run');
    });

    it('help 应被正确识别', () => {
      expect(parseScenarioArgs(['help']).subCommand).toBe('help');
    });

    it('非子命令参数应视为模板名并使用 run', () => {
      const result = parseScenarioArgs(['finance-market']);
      expect(result.subCommand).toBe('run');
      expect(result.templateName).toBe('finance-market');
    });
  });

  // ── 模板名解析 ──

  describe('模板名解析', () => {
    it('describe 后的位置参数应作为模板名', () => {
      const result = parseScenarioArgs(['describe', 'finance-market']);
      expect(result.subCommand).toBe('describe');
      expect(result.templateName).toBe('finance-market');
    });

    it('run 后的位置参数应作为模板名', () => {
      const result = parseScenarioArgs(['run', 'product-launch']);
      expect(result.subCommand).toBe('run');
      expect(result.templateName).toBe('product-launch');
    });

    it('--name / -n 应设置模板名', () => {
      expect(parseScenarioArgs(['run', '--name', 'my-scenario']).templateName).toBe('my-scenario');
      expect(parseScenarioArgs(['run', '-n', 'my-scenario']).templateName).toBe('my-scenario');
    });

    it('--name 应覆盖位置参数模板名', () => {
      // 位置参数先设置，但 --name 后覆盖
      const result = parseScenarioArgs(['run', 'pos-name', '--name', 'flag-name']);
      expect(result.templateName).toBe('flag-name');
    });
  });

  // ── 选项解析 ──

  describe('选项解析', () => {
    it('--ticks / -t 应设置 maxTicks', () => {
      expect(parseScenarioArgs(['run', 'test', '--ticks', '20']).maxTicks).toBe(20);
      expect(parseScenarioArgs(['run', 'test', '-t', '10']).maxTicks).toBe(10);
    });

    it('--concurrency / -c 应设置 concurrency', () => {
      expect(parseScenarioArgs(['run', 'test', '--concurrency', '3']).concurrency).toBe(3);
      expect(parseScenarioArgs(['run', 'test', '-c', '8']).concurrency).toBe(8);
    });

    it('--help / -h 应覆盖为 help 子命令', () => {
      expect(parseScenarioArgs(['run', 'test', '--help']).subCommand).toBe('help');
      expect(parseScenarioArgs(['list', '-h']).subCommand).toBe('help');
    });

    it('完整参数组合', () => {
      const result = parseScenarioArgs(['run', 'finance-market', '-t', '50', '-c', '10']);
      expect(result.subCommand).toBe('run');
      expect(result.templateName).toBe('finance-market');
      expect(result.maxTicks).toBe(50);
      expect(result.concurrency).toBe(10);
    });
  });

  // ── 边界情况 ──

  describe('边界情况', () => {
    it('无效数字应返回 undefined', () => {
      expect(parseScenarioArgs(['run', 'test', '--ticks', 'abc']).maxTicks).toBeUndefined();
      expect(parseScenarioArgs(['run', 'test', '-c', 'xyz']).concurrency).toBeUndefined();
    });

    it('缺少 --ticks 值应返回 undefined', () => {
      const result = parseScenarioArgs(['run', 'test', '--ticks']);
      expect(result.maxTicks).toBeUndefined();
    });

    it('以 - 开头的未知 flag 不应被当作模板名', () => {
      const result = parseScenarioArgs(['run', '--unknown-flag']);
      expect(result.templateName).toBeUndefined();
    });

    it('不以 - 开头的未知参数应被当作模板名', () => {
      const result = parseScenarioArgs(['run', 'my-template']);
      expect(result.templateName).toBe('my-template');
    });

    it('直接模板名加选项组合', () => {
      const result = parseScenarioArgs(['my-template', '-t', '30']);
      expect(result.subCommand).toBe('run');
      expect(result.templateName).toBe('my-template');
      expect(result.maxTicks).toBe(30);
    });

    it('list 子命令忽略额外位置参数', () => {
      const result = parseScenarioArgs(['list', 'extra-arg']);
      expect(result.subCommand).toBe('list');
      // extra-arg 被当作模板名（虽然 list 不使用它）
      expect(result.templateName).toBe('extra-arg');
    });
  });
});
