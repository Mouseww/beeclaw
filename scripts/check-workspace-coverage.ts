#!/usr/bin/env npx tsx
/**
 * check-workspace-coverage.ts
 *
 * 轻量校验脚本：确保 packages/* 下的所有工作区都被 build 脚本纳入构建。
 * - 扫描 packages/ 目录下所有带 package.json 的子目录
 * - 解析根 package.json 的 build 脚本
 * - 检查每个子包是否被 -w packages/<name> 引用
 *
 * 用法：
 *   npx tsx scripts/check-workspace-coverage.ts
 *   npm run check:workspaces  （如果在 package.json 中配置了该脚本）
 *
 * 退出码：
 *   0 - 所有工作区都已纳入构建
 *   1 - 存在遗漏的工作区
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';

const rootDir = process.cwd();
const packagesDir = join(rootDir, 'packages');

/**
 * 获取 packages 目录下所有有效的工作区名称
 */
function getWorkspaceNames(): string[] {
  if (!existsSync(packagesDir)) {
    console.error('❌ packages/ 目录不存在');
    process.exit(1);
  }

  const entries = readdirSync(packagesDir);
  const workspaces: string[] = [];

  for (const entry of entries) {
    const entryPath = join(packagesDir, entry);
    const packageJsonPath = join(entryPath, 'package.json');

    if (statSync(entryPath).isDirectory() && existsSync(packageJsonPath)) {
      workspaces.push(entry);
    }
  }

  return workspaces.sort();
}

/**
 * 从 build 脚本中提取被引用的包名称
 */
function extractBuildTargets(buildScript: string): Set<string> {
  const targets = new Set<string>();
  // 匹配 -w packages/<name> 模式
  const regex = /-w\s+packages\/([a-zA-Z0-9_-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(buildScript)) !== null) {
    targets.add(match[1]);
  }

  return targets;
}

/**
 * 主流程
 */
function main(): void {
  console.log('🔍 检查工作区构建覆盖情况...\n');

  // 读取根 package.json
  const rootPackageJsonPath = join(rootDir, 'package.json');
  if (!existsSync(rootPackageJsonPath)) {
    console.error('❌ 根目录下不存在 package.json');
    process.exit(1);
  }

  const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));
  const buildScript = rootPackageJson.scripts?.build;

  if (!buildScript) {
    console.error('❌ package.json 中没有 build 脚本');
    process.exit(1);
  }

  // 获取所有工作区
  const allWorkspaces = getWorkspaceNames();
  console.log(`📦 发现 ${allWorkspaces.length} 个工作区：`);
  allWorkspaces.forEach((ws) => console.log(`   - ${ws}`));
  console.log();

  // 提取 build 脚本中的目标
  const buildTargets = extractBuildTargets(buildScript);
  console.log(`🔨 build 脚本中引用了 ${buildTargets.size} 个包：`);
  Array.from(buildTargets)
    .sort()
    .forEach((t) => console.log(`   - ${t}`));
  console.log();

  // 检查差异
  const missingFromBuild: string[] = [];
  const extraInBuild: string[] = [];

  for (const ws of allWorkspaces) {
    if (!buildTargets.has(ws)) {
      missingFromBuild.push(ws);
    }
  }

  for (const target of buildTargets) {
    if (!allWorkspaces.includes(target)) {
      extraInBuild.push(target);
    }
  }

  // 输出结果
  if (missingFromBuild.length === 0 && extraInBuild.length === 0) {
    console.log('✅ 所有工作区都已纳入构建，无遗漏！');
    process.exit(0);
  }

  if (missingFromBuild.length > 0) {
    console.error('❌ 以下工作区未被纳入 build 脚本：');
    missingFromBuild.forEach((ws) => console.error(`   - packages/${ws}`));
  }

  if (extraInBuild.length > 0) {
    console.warn('⚠️  build 脚本中引用了不存在的包：');
    extraInBuild.forEach((t) => console.warn(`   - packages/${t}`));
  }

  console.log('\n💡 请更新根 package.json 的 build 脚本以修复遗漏。');
  process.exit(1);
}

main();
