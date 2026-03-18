#!/usr/bin/env node
// ============================================================================
// BeeClaw CLI — 事件注入工具
// 从命令行参数读取事件并注入 EventBus
// ============================================================================

import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, EventCategory } from '@beeclaw/shared';

const VALID_CATEGORIES: EventCategory[] = ['finance', 'politics', 'tech', 'social', 'general'];

function parseArgs(): {
  title: string;
  content: string;
  category: EventCategory;
  importance: number;
  propagationRadius: number;
  tags: string[];
  runTicks: number;
  agentCount: number;
} {
  const args = process.argv.slice(2);
  let title = '';
  let content = '';
  let category: EventCategory = 'general';
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
        printHelp();
        process.exit(0);
        break;
      default:
        // 无标志的第一个参数视为 title
        if (!title) title = arg;
        break;
    }
  }

  if (!title) {
    console.error('[inject] 错误：必须提供事件标题');
    console.error('  使用 --help 查看帮助');
    process.exit(1);
  }

  // content 默认与 title 相同
  if (!content) content = title;

  return { title, content, category, importance, propagationRadius, tags, runTicks, agentCount };
}

function printHelp(): void {
  console.log(`
🐝 BeeClaw — 事件注入工具

用法:
  node packages/cli/dist/inject.js <事件标题> [选项]
  npm run inject -- <事件标题> [选项]

选项:
  -T, --title <标题>       事件标题（也可直接作为第一个参数）
  -c, --content <内容>     事件详细内容（默认同标题）
  -C, --category <分类>    事件分类: finance|politics|tech|social|general (默认: general)
      --importance <0-1>  事件重要性 (默认: 0.7)
      --radius <0-1>      传播半径 (默认: 0.5)
      --tags <标签列表>     逗号分隔的标签 (例: 金融,加息)
  -t, --ticks <数量>       注入后运行的 tick 数 (默认: 1)
  -a, --agents <数量>      Agent 数量 (默认: 10)
  -h, --help              显示帮助信息

示例:
  node packages/cli/dist/inject.js "央行宣布加息25个基点" --category finance --tags 金融,加息,利率 --ticks 3
  node packages/cli/dist/inject.js --title "某科技公司发布新品" -C tech --importance 0.9 --radius 0.8
`);
}

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🐝 BeeClaw — 事件注入');
  console.log('═══════════════════════════════════════');
  console.log(`  事件标题:   ${opts.title}`);
  console.log(`  事件分类:   ${opts.category}`);
  console.log(`  重要性:     ${(opts.importance * 100).toFixed(0)}%`);
  console.log(`  传播半径:   ${(opts.propagationRadius * 100).toFixed(0)}%`);
  console.log(`  标签:       ${opts.tags.length > 0 ? opts.tags.join(', ') : '(无)'}`);
  console.log(`  运行 Tick:  ${opts.runTicks}`);
  console.log(`  Agent 数量: ${opts.agentCount}`);
  console.log('═══════════════════════════════════════');
  console.log('');

  // 创建引擎
  const config: WorldConfig = {
    tickIntervalMs: 10_000,
    maxAgents: 100,
    eventRetentionTicks: 100,
    enableNaturalSelection: false,
  };

  const engine = new WorldEngine({
    config,
    modelRouter: new ModelRouter(),
    concurrency: 5,
  });

  // 生成 Agent
  const agents = engine.spawner.spawnBatch(opts.agentCount, 0);
  engine.addAgents(agents);

  // 注入事件
  const event = engine.injectEvent({
    title: opts.title,
    content: opts.content,
    category: opts.category,
    importance: opts.importance,
    propagationRadius: opts.propagationRadius,
    tags: opts.tags,
  });

  console.log(`[inject] 事件已注入: ${event.id}`);
  console.log('');

  // 运行指定数量的 tick
  for (let i = 0; i < opts.runTicks; i++) {
    const result = await engine.step();
    console.log(
      `[inject] Tick ${result.tick} — ` +
      `事件:${result.eventsProcessed} 激活:${result.agentsActivated} ` +
      `响应:${result.responsesCollected} 信号:${result.signals}`
    );
  }

  // 输出最终状态
  console.log('');
  console.log(engine.worldState.formatStatus());

  // 输出共识信号
  const signals = engine.consensusEngine.getLatestSignals();
  if (signals.length > 0) {
    console.log('\n── 共识信号 ──');
    for (const signal of signals) {
      console.log(`  话题: ${signal.topic}`);
      console.log(
        `  情绪: 📈${(signal.sentimentDistribution.bullish * 100).toFixed(0)}% ` +
        `📉${(signal.sentimentDistribution.bearish * 100).toFixed(0)}% ` +
        `➡️${(signal.sentimentDistribution.neutral * 100).toFixed(0)}%`
      );
      console.log(`  趋势: ${signal.trend} | 共识度: ${(signal.consensus * 100).toFixed(0)}%`);
      if (signal.alerts.length > 0) {
        console.log(`  ⚠️ 预警: ${signal.alerts.map(a => a.description).join('; ')}`);
      }
    }
  }

  console.log('\n🐝 注入完成。\n');
}

main().catch((err) => {
  console.error('[inject] 失败:', err);
  process.exit(1);
});
