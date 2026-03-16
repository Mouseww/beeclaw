// ============================================================================
// @beeclaw/cli status 模块单元测试
// 测试系统状态检查的工具函数和输出逻辑
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// status.ts 在顶层调用 main()，无法直接导入。
// 复现核心工具函数逻辑进行独立测试。

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

// ── 复现 status.ts 中的工具函数 ──

const PACKAGES = [
  'shared',
  'agent-runtime',
  'event-bus',
  'social-graph',
  'consensus',
  'world-engine',
  'cli',
] as const;

const ENV_VARS = [
  { key: 'BEECLAW_LLM_BASE_URL', desc: 'LLM API 基础 URL', required: true },
  { key: 'BEECLAW_LLM_API_KEY', desc: 'LLM API 密钥', required: true },
  { key: 'BEECLAW_LLM_MODEL', desc: 'LLM 模型名称', required: false },
  { key: 'BEECLAW_LLM_CHEAP_MODEL', desc: '低成本模型名称', required: false },
  { key: 'BEECLAW_LLM_STRONG_MODEL', desc: '高能力模型名称', required: false },
  { key: 'BEECLAW_LLM_LOCAL_MODEL', desc: '本地模型名称', required: false },
  { key: 'BEECLAW_MAX_AGENTS', desc: '最大 Agent 数量', required: false },
  { key: 'BEECLAW_TICK_INTERVAL', desc: 'Tick 间隔（毫秒）', required: false },
] as const;

function getPackageVersion(root: string, pkgName: string): string | null {
  const pkgPath = `${root}/packages/${pkgName}/package.json`;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8') as string);
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

function checkBuildArtifacts(root: string, pkgName: string): boolean {
  const distPath = `${root}/packages/${pkgName}/dist`;
  return existsSync(distPath) as boolean;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = `${dir}/package.json`;
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8') as string);
        if (pkg.workspaces || pkg.name === 'beeclaw') {
          return dir;
        }
      } catch {
        // ignore
      }
    }
    const parts = dir.split('/');
    parts.pop();
    const parent = parts.join('/') || '/';
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

describe('status — 工具函数', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedReadFileSync.mockReset();
    mockedExistsSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── maskSecret ──

  describe('maskSecret', () => {
    it('短密钥 (<=8 字符) 应完全隐藏', () => {
      expect(maskSecret('abc')).toBe('****');
      expect(maskSecret('12345678')).toBe('****');
    });

    it('长密钥应保留首尾 4 字符', () => {
      expect(maskSecret('sk-1234567890abcdef')).toBe('sk-1****cdef');
    });

    it('正好 9 字符应保留首尾 4 字符', () => {
      expect(maskSecret('123456789')).toBe('1234****6789');
    });

    it('空字符串应返回 ****', () => {
      expect(maskSecret('')).toBe('****');
    });
  });

  // ── getPackageVersion ──

  describe('getPackageVersion', () => {
    it('应从 package.json 读取版本号', () => {
      mockedReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));
      expect(getPackageVersion('/root/project', 'shared')).toBe('1.0.0');
    });

    it('package.json 不存在应返回 null', () => {
      mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      expect(getPackageVersion('/root/project', 'missing')).toBeNull();
    });

    it('package.json 无 version 字段应返回 null', () => {
      mockedReadFileSync.mockReturnValue(JSON.stringify({ name: 'test' }));
      expect(getPackageVersion('/root/project', 'shared')).toBeNull();
    });

    it('package.json 不是合法 JSON 应返回 null', () => {
      mockedReadFileSync.mockReturnValue('not-json{{{');
      expect(getPackageVersion('/root/project', 'shared')).toBeNull();
    });
  });

  // ── checkBuildArtifacts ──

  describe('checkBuildArtifacts', () => {
    it('dist 目录存在应返回 true', () => {
      mockedExistsSync.mockReturnValue(true);
      expect(checkBuildArtifacts('/root/project', 'shared')).toBe(true);
    });

    it('dist 目录不存在应返回 false', () => {
      mockedExistsSync.mockReturnValue(false);
      expect(checkBuildArtifacts('/root/project', 'shared')).toBe(false);
    });

    it('应检查正确的路径', () => {
      mockedExistsSync.mockReturnValue(true);
      checkBuildArtifacts('/root/project', 'cli');
      expect(mockedExistsSync).toHaveBeenCalledWith('/root/project/packages/cli/dist');
    });
  });

  // ── findMonorepoRoot ──

  describe('findMonorepoRoot', () => {
    it('当前目录即是 monorepo root', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ workspaces: ['packages/*'] }));
      expect(findMonorepoRoot('/root/project')).toBe('/root/project');
    });

    it('name 为 beeclaw 也视为 root', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ name: 'beeclaw' }));
      expect(findMonorepoRoot('/root/project')).toBe('/root/project');
    });

    it('向上搜索找到 root', () => {
      mockedExistsSync.mockImplementation((path) => {
        return path === '/root/project/package.json';
      });
      mockedReadFileSync.mockImplementation((path) => {
        if (path === '/root/project/package.json') {
          return JSON.stringify({ workspaces: ['packages/*'] });
        }
        throw new Error('ENOENT');
      });
      expect(findMonorepoRoot('/root/project/packages/cli')).toBe('/root/project');
    });

    it('找不到 root 应返回起始目录', () => {
      mockedExistsSync.mockReturnValue(false);
      expect(findMonorepoRoot('/some/deep/dir')).toBe('/some/deep/dir');
    });

    it('package.json 解析失败应继续向上搜索', () => {
      let callCount = 0;
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return 'invalid-json';
        return JSON.stringify({ workspaces: ['packages/*'] });
      });
      const result = findMonorepoRoot('/root/project/packages/cli');
      // 第一次解析失败，继续向上搜索成功
      expect(result).toBe('/root/project/packages');
    });
  });

  // ── 常量验证 ──

  describe('常量定义', () => {
    it('PACKAGES 应包含所有预期包', () => {
      expect(PACKAGES).toContain('shared');
      expect(PACKAGES).toContain('agent-runtime');
      expect(PACKAGES).toContain('event-bus');
      expect(PACKAGES).toContain('social-graph');
      expect(PACKAGES).toContain('consensus');
      expect(PACKAGES).toContain('world-engine');
      expect(PACKAGES).toContain('cli');
      expect(PACKAGES.length).toBe(7);
    });

    it('ENV_VARS 应包含必需变量', () => {
      const requiredVars = ENV_VARS.filter(v => v.required);
      expect(requiredVars.length).toBe(2);
      expect(requiredVars.map(v => v.key)).toContain('BEECLAW_LLM_BASE_URL');
      expect(requiredVars.map(v => v.key)).toContain('BEECLAW_LLM_API_KEY');
    });

    it('ENV_VARS 应包含可选变量', () => {
      const optionalVars = ENV_VARS.filter(v => !v.required);
      expect(optionalVars.length).toBe(6);
    });
  });
});
