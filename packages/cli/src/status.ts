#!/usr/bin/env node
// ============================================================================
// BeeClaw CLI — 状态查看工具
// 检查系统环境、依赖、构建产物
// ============================================================================

import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── 常量 ──

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

// ── 工具函数 ──

function findMonorepoRoot(): string {
  let dir = resolve(__dirname);
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces || pkg.name === 'beeclaw') {
          return dir;
        }
      } catch {
        // ignore
      }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(__dirname, '../../..');
}

function getPackageVersion(root: string, pkgName: string): string | null {
  const pkgPath = join(root, 'packages', pkgName, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

function checkBuildArtifacts(root: string, pkgName: string): boolean {
  const distPath = join(root, 'packages', pkgName, 'dist');
  return existsSync(distPath);
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

// ── 输出 ──

function printHeader(): void {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  🐝 BeeClaw — 系统状态检查');
  console.log('═══════════════════════════════════════════════');
  console.log('');
}

function printSection(title: string): void {
  console.log(`── ${title} ${'─'.repeat(Math.max(0, 40 - title.length))}`)
  console.log('');
}

function printPackages(root: string): void {
  printSection('📦 包状态');

  const maxName = Math.max(...PACKAGES.map(p => `@beeclaw/${p}`.length));

  for (const pkg of PACKAGES) {
    const fullName = `@beeclaw/${pkg}`;
    const version = getPackageVersion(root, pkg);
    const built = checkBuildArtifacts(root, pkg);

    const nameCol = fullName.padEnd(maxName + 2);
    const versionCol = version ? `v${version}` : '?';
    const buildIcon = built ? '✅ built' : '❌ no dist';

    console.log(`  ${nameCol} ${versionCol.padEnd(10)} ${buildIcon}`);
  }
  console.log('');
}

function printEnvVars(): void {
  printSection('🔧 环境变量');

  let allRequiredSet = true;

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.key];
    const isSet = !!value;
    const reqTag = envVar.required ? '(必需)' : '(可选)';

    let displayValue: string;
    if (!isSet) {
      displayValue = '未设置';
      if (envVar.required) allRequiredSet = false;
    } else if (envVar.key.includes('KEY') || envVar.key.includes('SECRET')) {
      displayValue = maskSecret(value!);
    } else {
      displayValue = value!;
    }

    const icon = isSet ? '✅' : (envVar.required ? '❌' : '⚪');
    console.log(`  ${icon} ${envVar.key} ${reqTag}`);
    console.log(`     ${envVar.desc}: ${displayValue}`);
  }

  console.log('');

  if (!allRequiredSet) {
    console.log('  ⚠️  缺少必需的环境变量，运行仿真前请配置！');
    console.log('');
    console.log('  设置示例:');
    console.log('    export BEECLAW_LLM_BASE_URL=https://api.openai.com');
    console.log('    export BEECLAW_LLM_API_KEY=sk-...');
    console.log('');
  }
}

function printSystemInfo(root: string): void {
  printSection('🖥️  系统信息');

  const rootPkg = join(root, 'package.json');
  let projectVersion = '?';
  try {
    const pkg = JSON.parse(readFileSync(rootPkg, 'utf-8'));
    projectVersion = pkg.version ?? '?';
  } catch {
    // ignore
  }

  console.log(`  项目版本:     v${projectVersion}`);
  console.log(`  Node.js:      ${process.version}`);
  console.log(`  平台:         ${process.platform} ${process.arch}`);
  console.log(`  项目根目录:   ${root}`);
  console.log('');
}

function printUsage(): void {
  printSection('🚀 快速开始');

  console.log('  # 启动仿真（5 个 Agent，3 个 tick）');
  console.log('  npx beeclaw --agents 5 --ticks 3 --seed "央行宣布降息"');
  console.log('');
  console.log('  # 注入事件');
  console.log('  npx beeclaw-inject --title "重大新闻" --content "..." --category finance');
  console.log('');
}

// ── 主入口 ──

function main(): void {
  printHeader();

  const root = findMonorepoRoot();

  printSystemInfo(root);
  printPackages(root);
  printEnvVars();
  printUsage();

  console.log('═══════════════════════════════════════════════');
  console.log('');
}

main();
