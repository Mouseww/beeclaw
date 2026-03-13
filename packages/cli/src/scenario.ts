#!/usr/bin/env node
// ============================================================================
// BeeClaw CLI — scenario 命令
// 管理和运行场景模板
// ============================================================================

import {
  ScenarioRegistry,
  BUILTIN_TEMPLATES,
} from '@beeclaw/shared';
import type { ScenarioTemplate } from '@beeclaw/shared';
import { ScenarioRunner } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';

// ── 子命令解析 ──

type SubCommand = 'list' | 'describe' | 'run' | 'help';

interface ScenarioArgs {
  subCommand: SubCommand;
  templateName?: string;
  maxTicks?: number;
  concurrency?: number;
}

function parseScenarioArgs(): ScenarioArgs {
  const args = process.argv.slice(2);
  let subCommand: SubCommand = 'help';
  let templateName: string | undefined;
  let maxTicks: number | undefined;
  let concurrency: number | undefined;

  if (args.length === 0) {
    return { subCommand: 'help' };
  }

  const cmd = args[0]!;
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

// ── 子命令实现 ──

function commandList(): void {
  const registry = new ScenarioRegistry();
  const templates = registry.list();

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🐝 可用场景模板');
  console.log('═══════════════════════════════════════');
  console.log('');

  for (const t of templates) {
    const totalAgents = t.agentProfiles.reduce((s, p) => s + p.count, 0);
    const roles = t.agentProfiles.map(p => `${p.role}(${p.count})`).join(', ');
    const sources = t.eventSources.map(s => s.name).join(', ');

    console.log(`  📋 ${t.name}`);
    console.log(`     ${t.description}`);
    console.log(`     角色: ${roles} (共 ${totalAgents} 个 Agent)`);
    console.log(`     事件源: ${sources}`);
    console.log(`     Duration: ${t.duration ?? '未指定'} ticks`);
    console.log('');
  }

  console.log(`  共 ${templates.length} 个可用模板`);
  console.log('');
}

function commandDescribe(templateName?: string): void {
  if (!templateName) {
    console.error('[scenario] 请指定模板名称: beeclaw-scenario describe <name>');
    console.error('[scenario] 使用 beeclaw-scenario list 查看可用模板');
    process.exit(1);
  }

  const registry = new ScenarioRegistry();
  const template = registry.get(templateName);

  if (!template) {
    console.error(`[scenario] 模板 "${templateName}" 不存在`);
    console.error(`[scenario] 可用模板: ${registry.listNames().join(', ')}`);
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`  📋 场景模板: ${template.name}`);
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log(`  描述: ${template.description}`);
  console.log('');

  // Agent 角色
  console.log('  ── Agent 角色 ──');
  const totalAgents = template.agentProfiles.reduce((s, p) => s + p.count, 0);
  for (const profile of template.agentProfiles) {
    console.log(`  🤖 ${profile.role} x ${profile.count} (${profile.modelTier})`);
    console.log(`     职业池: ${profile.template.professionPool.join(', ')}`);
    console.log(`     偏见池: ${profile.template.biasPool.join(', ')}`);
  }
  console.log(`  总计: ${totalAgents} 个 Agent`);
  console.log('');

  // 事件源
  console.log('  ── 事件源 ──');
  const descriptions = ScenarioRunner.describeEventSources(template.eventSources);
  for (const desc of descriptions) {
    console.log(`  📡 ${desc}`);
  }
  console.log('');

  // 世界配置
  console.log('  ── 世界配置 ──');
  const wc = template.worldConfig;
  if (wc.tickIntervalMs) console.log(`  Tick 间隔: ${wc.tickIntervalMs}ms`);
  if (wc.maxAgents) console.log(`  最大 Agent: ${wc.maxAgents}`);
  if (wc.eventRetentionTicks) console.log(`  事件保留: ${wc.eventRetentionTicks} ticks`);
  if (wc.enableNaturalSelection !== undefined) {
    console.log(`  自然选择: ${wc.enableNaturalSelection ? '启用' : '关闭'}`);
  }
  if (template.duration) console.log(`  默认 Duration: ${template.duration} ticks`);
  console.log('');

  // 孵化规则
  if (template.spawnRules && template.spawnRules.length > 0) {
    console.log('  ── 孵化规则 ──');
    for (const rule of template.spawnRules) {
      const trigger = rule.trigger;
      let triggerDesc: string;
      switch (trigger.type) {
        case 'event_keyword':
          triggerDesc = `关键词触发: [${trigger.keywords.join(', ')}]`;
          break;
        case 'population_drop':
          triggerDesc = `人口下降阈值: ${trigger.threshold}`;
          break;
        case 'scheduled':
          triggerDesc = `定时触发: 每 ${trigger.intervalTicks} tick`;
          break;
        default:
          triggerDesc = `类型: ${trigger.type}`;
      }
      console.log(`  🔄 ${triggerDesc} → 孵化 ${rule.count} 个 (${rule.modelTier})`);
    }
    console.log('');
  }

  // 种子事件
  if (template.seedEvents && template.seedEvents.length > 0) {
    console.log('  ── 种子事件 ──');
    for (const seed of template.seedEvents) {
      console.log(`  🌱 ${seed.title} (重要性: ${seed.importance}, 分类: ${seed.category})`);
    }
    console.log('');
  }
}

async function commandRun(templateName?: string, maxTicks?: number, concurrency?: number): Promise<void> {
  if (!templateName) {
    console.error('[scenario] 请指定模板名称: beeclaw-scenario run <name>');
    console.error('[scenario] 使用 beeclaw-scenario list 查看可用模板');
    process.exit(1);
  }

  const registry = new ScenarioRegistry();
  const template = registry.get(templateName);

  if (!template) {
    console.error(`[scenario] 模板 "${templateName}" 不存在`);
    console.error(`[scenario] 可用模板: ${registry.listNames().join(', ')}`);
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`  🐝 运行场景: ${template.name}`);
  console.log('═══════════════════════════════════════');
  console.log(`  ${template.description}`);
  console.log('');

  const modelRouter = new ModelRouter();
  const runner = new ScenarioRunner({
    modelRouter,
    concurrency: concurrency ?? 5,
    maxTicks,
    onTick: (result) => {
      console.log(
        `[Tick ${result.tick}] 事件:${result.eventsProcessed} ` +
        `激活:${result.agentsActivated} 响应:${result.responsesCollected} ` +
        `信号:${result.signals} 耗时:${result.durationMs}ms`
      );
    },
    onComplete: (results) => {
      const totalEvents = results.reduce((s, r) => s + r.eventsProcessed, 0);
      const totalResponses = results.reduce((s, r) => s + r.responsesCollected, 0);
      const totalSignals = results.reduce((s, r) => s + r.signals, 0);

      console.log('');
      console.log('═══════════════════════════════════════');
      console.log('  📊 场景运行完成');
      console.log('═══════════════════════════════════════');
      console.log(`  总 Tick: ${results.length}`);
      console.log(`  总事件: ${totalEvents}`);
      console.log(`  总响应: ${totalResponses}`);
      console.log(`  总信号: ${totalSignals}`);
      console.log('═══════════════════════════════════════');
      console.log('');
    },
  });

  // 优雅退出
  let stopping = false;
  const gracefulShutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log('\n[scenario] 收到退出信号，正在停止...');
    runner.stop();
  };
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  runner.loadTemplate(template);

  try {
    await runner.run(maxTicks);
  } catch (err) {
    console.error(`[scenario] 场景运行出错:`, err);
    process.exit(1);
  }
}

function printScenarioHelp(): void {
  console.log(`
🐝 BeeClaw — 场景模板管理器

用法:
  npx beeclaw-scenario <子命令> [选项]

子命令:
  list                         列出所有可用场景模板
  describe <name>              查看场景模板详情
  run <name> [选项]            运行指定场景模板
  help                         显示此帮助信息

run 选项:
  -n, --name <模板名>          场景模板名称
  -t, --ticks <数量>           最大运行 tick 数（覆盖模板默认值）
  -c, --concurrency <数量>     LLM 并发调用数（默认: 5）

示例:
  npx beeclaw-scenario list
  npx beeclaw-scenario describe finance-market
  npx beeclaw-scenario run finance-market --ticks 20
  npx beeclaw-scenario run product-launch -t 10 -c 3
`);
}

// ── 主入口 ──

async function main(): Promise<void> {
  const args = parseScenarioArgs();

  switch (args.subCommand) {
    case 'list':
      commandList();
      break;
    case 'describe':
      commandDescribe(args.templateName);
      break;
    case 'run':
      await commandRun(args.templateName, args.maxTicks, args.concurrency);
      break;
    case 'help':
    default:
      printScenarioHelp();
      break;
  }
}

main().catch((err) => {
  console.error('[scenario] 失败:', err);
  process.exit(1);
});
