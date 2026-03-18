#!/usr/bin/env node
// ============================================================================
// BeeClaw CLI — 主入口
// 启动 WorldEngine，创建一批 Agent，运行 tick 循环
// ============================================================================

import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, SpawnRule } from '@beeclaw/shared';

// ── 默认配置 ──

const DEFAULT_CONFIG: WorldConfig = {
  tickIntervalMs: 30_000,        // 30 秒一个 tick
  maxAgents: 100,
  eventRetentionTicks: 100,
  enableNaturalSelection: false, // MVP 阶段关闭
};

const DEFAULT_AGENT_COUNT = 10;

// ── 解析命令行参数 ──

function parseArgs(): {
  agentCount: number;
  tickInterval: number;
  maxTicks: number;
  seedEvent?: string;
  distributed: boolean;
  workers: number;
} {
  const args = process.argv.slice(2);
  let agentCount = DEFAULT_AGENT_COUNT;
  let tickInterval = DEFAULT_CONFIG.tickIntervalMs;
  let maxTicks = 0; // 0 = 无限
  let seedEvent: string | undefined;
  let distributed = false;
  let workers = 2;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case '--agents':
      case '-a':
        agentCount = parseInt(args[++i] ?? '', 10) || DEFAULT_AGENT_COUNT;
        break;
      case '--interval':
      case '-i':
        tickInterval = parseInt(args[++i] ?? '', 10) || DEFAULT_CONFIG.tickIntervalMs;
        break;
      case '--ticks':
      case '-t':
        maxTicks = parseInt(args[++i] ?? '', 10) || 0;
        break;
      case '--seed':
      case '-s':
        seedEvent = args[++i];
        break;
      case '--distributed':
      case '-d':
        distributed = true;
        break;
      case '--workers':
      case '-w':
        workers = parseInt(args[++i] ?? '', 10) || 2;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return { agentCount, tickInterval, maxTicks, seedEvent, distributed, workers };
}

function printHelp(): void {
  console.log(`
🐝 BeeClaw — 群体智能仿真引擎 CLI

用法:
  npx beeclaw [选项]
  node packages/cli/dist/index.js [选项]

选项:
  -a, --agents <数量>      初始 Agent 数量 (默认: ${DEFAULT_AGENT_COUNT})
  -i, --interval <毫秒>    Tick 间隔时间 (默认: ${DEFAULT_CONFIG.tickIntervalMs}ms)
  -t, --ticks <数量>       最大运行 tick 数 (默认: 0=无限)
  -s, --seed <事件内容>    注入种子事件启动仿真
  -d, --distributed       启用分布式模式
  -w, --workers <数量>     Worker 数量 (默认: 2, 仅在分布式模式下有效)
  -h, --help              显示帮助信息

示例:
  node packages/cli/dist/index.js --agents 20 --ticks 5 --seed "央行宣布加息25个基点"
  node packages/cli/dist/index.js --distributed --workers 4 --agents 100
`);
}

// ── 默认孵化规则 ──

function getDefaultSpawnRules(): SpawnRule[] {
  return [
    {
      trigger: { type: 'population_drop', threshold: 5 },
      template: {
        professionPool: ['散户投资者', '金融分析师', '经济学家', '记者', '普通市民'],
        traitRanges: {
          riskTolerance: [0.1, 0.9],
          informationSensitivity: [0.3, 0.8],
          conformity: [0.2, 0.8],
          emotionality: [0.2, 0.8],
          analyticalDepth: [0.2, 0.8],
        },
        expertisePool: [['金融', '股票'], ['经济', '政策'], ['科技', '互联网'], ['社会', '民生']],
        biasPool: ['确认偏误', '锚定效应', '从众心理', '损失厌恶', '过度自信'],
      },
      count: 3,
      modelTier: 'cheap',
    },
  ];
}

// ── 主启动流程 ──

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🐝 BeeClaw — BeeWorld 群体智能仿真');
  console.log('═══════════════════════════════════════');
  console.log(`  Agent 数量: ${opts.agentCount}`);
  console.log(`  Tick 间隔:  ${opts.tickInterval}ms`);
  console.log(`  最大 Tick:  ${opts.maxTicks || '无限'}`);
  if (opts.distributed) {
    console.log(`  分布式模式: 启用 (${opts.workers} Workers)`);
  }
  if (opts.seedEvent) {
    console.log(`  种子事件:  ${opts.seedEvent}`);
  }
  console.log('═══════════════════════════════════════');
  console.log('');

  // 1. 创建 ModelRouter
  const modelRouter = new ModelRouter();

  // 2. 创建 WorldEngine
  const config: WorldConfig = {
    ...DEFAULT_CONFIG,
    tickIntervalMs: opts.tickInterval,
    distributed: opts.distributed,
    workerCount: opts.workers,
  };

  const engine = new WorldEngine({
    config,
    modelRouter,
    concurrency: 5,
  });

  // 3. 添加孵化规则
  for (const rule of getDefaultSpawnRules()) {
    engine.spawner.addRule(rule);
  }

  // 4. 生成初始 Agent
  console.log(`[CLI] 正在孵化 ${opts.agentCount} 个 Agent...`);
  const initialAgents = engine.spawner.spawnBatch(opts.agentCount, 0);
  engine.addAgents(initialAgents);

  console.log('[CLI] 初始 Agent 列表:');
  for (const agent of initialAgents) {
    console.log(`  🤖 ${agent.name} — ${agent.persona.profession} (${agent.modelTier})`);
  }
  console.log('');

  // 5. 注入种子事件（如有）
  if (opts.seedEvent) {
    engine.injectEvent({
      title: opts.seedEvent,
      content: opts.seedEvent,
      category: 'general',
      importance: 0.8,
      propagationRadius: 0.6,
      tags: ['seed'],
    });
    console.log(`[CLI] 种子事件已注入: "${opts.seedEvent}"`);
    console.log('');
  }

  // 6. 优雅退出处理（带超时保护）
  let stopping = false;
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  const gracefulShutdown = (signal?: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[CLI] 收到${signal ? ' ' + signal : ''}退出信号，正在停止...`);
    engine.stop();

    // 超时强制退出保护
    const forceExitTimer = setTimeout(() => {
      console.error('[CLI] ⚠️ 优雅退出超时，强制退出');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    // 打印最终状态
    const state = engine.worldState.getState();
    console.log('');
    console.log(engine.worldState.formatStatus());

    const history = engine.getTickHistory();
    if (history.length > 0) {
      const totalResponses = history.reduce((s, h) => s + h.responsesCollected, 0);
      const totalEvents = history.reduce((s, h) => s + h.eventsProcessed, 0);
      console.log(`\n[CLI] 运行统计:`);
      console.log(`  总 Tick: ${history.length}`);
      console.log(`  总事件: ${totalEvents}`);
      console.log(`  总响应: ${totalResponses}`);
      console.log(`  当前 Agent: ${state.agentCount}`);
    }

    console.log('\n🐝 BeeWorld 已停止。再见！\n');
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

  // 7. 运行 tick 循环
  if (opts.maxTicks > 0) {
    // 有限模式：手动推进指定数量的 tick
    console.log(`[CLI] 开始运行 ${opts.maxTicks} 个 tick...\n`);
    for (let i = 0; i < opts.maxTicks; i++) {
      if (stopping) break;
      const result = await engine.step();
      console.log(
        `[CLI] Tick ${result.tick} 完成 — ` +
        `事件:${result.eventsProcessed} 激活:${result.agentsActivated} ` +
        `响应:${result.responsesCollected} 信号:${result.signals} ` +
        `耗时:${result.durationMs}ms`
      );
    }
    gracefulShutdown();
  } else {
    // 无限模式：自动推进
    console.log('[CLI] 启动自动 tick 循环（Ctrl+C 停止）...\n');
    engine.start();
  }
}

main().catch((err) => {
  console.error('[CLI] 启动失败:', err);
  process.exit(1);
});
