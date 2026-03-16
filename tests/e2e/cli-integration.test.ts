// ============================================================================
// BeeClaw E2E — CLI 基本功能测试
// 验证 CLI 核心逻辑：参数解析、引擎组装、tick 执行
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildTestWorld, silenceConsole, createMockModelRouter } from './helpers.js';
import { WorldEngine } from '@beeclaw/world-engine';
import type { WorldConfig } from '@beeclaw/shared';

describe('CLI 功能集成测试', () => {
  beforeEach(() => {
    silenceConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 模拟 CLI 核心逻辑 ──

  describe('CLI 引擎启动流程', () => {
    it('应可按 CLI 流程创建 WorldEngine 并运行有限 tick', async () => {
      // 模拟 CLI opts
      const opts = {
        agentCount: 5,
        tickInterval: 50,
        maxTicks: 3,
        seedEvent: '央行宣布加息25个基点',
      };

      const modelRouter = createMockModelRouter();

      const config: WorldConfig = {
        tickIntervalMs: opts.tickInterval,
        maxAgents: 200,
        eventRetentionTicks: 100,
        enableNaturalSelection: false,
      };

      const engine = new WorldEngine({
        config,
        modelRouter,
        concurrency: 5,
      });

      // 添加孵化规则
      engine.spawner.addRule({
        trigger: { type: 'population_drop', threshold: 3 },
        template: {
          professionPool: ['散户投资者', '金融分析师'],
          traitRanges: {
            riskTolerance: [0.1, 0.9],
            informationSensitivity: [0.3, 0.8],
            conformity: [0.2, 0.8],
            emotionality: [0.2, 0.8],
            analyticalDepth: [0.2, 0.8],
          },
          expertisePool: [['金融', '股票']],
          biasPool: ['确认偏误'],
        },
        count: 2,
        modelTier: 'cheap',
      });

      // 孵化 Agent
      const agents = engine.spawner.spawnBatch(opts.agentCount, 0);
      engine.addAgents(agents);
      expect(engine.getAgents()).toHaveLength(5);

      // 注入种子事件
      const event = engine.injectEvent({
        title: opts.seedEvent,
        content: opts.seedEvent,
        category: 'general',
        importance: 0.8,
        propagationRadius: 0.6,
        tags: ['seed'],
      });
      expect(event).toHaveProperty('id');
      expect(event.title).toBe(opts.seedEvent);

      // 运行有限 tick
      const results = [];
      for (let i = 0; i < opts.maxTicks; i++) {
        results.push(await engine.step());
      }

      expect(results).toHaveLength(3);
      expect(results[0]!.tick).toBe(1);
      expect(results[2]!.tick).toBe(3);

      // 至少第一轮应处理了种子事件
      expect(results[0]!.eventsProcessed).toBeGreaterThanOrEqual(1);

      // 引擎状态
      expect(engine.getCurrentTick()).toBe(3);

      engine.stop();
    });

    it('无种子事件时也可正常运行', async () => {
      const modelRouter = createMockModelRouter();

      const engine = new WorldEngine({
        config: {
          tickIntervalMs: 50,
          maxAgents: 50,
          eventRetentionTicks: 50,
          enableNaturalSelection: false,
        },
        modelRouter,
      });

      const agents = engine.spawner.spawnBatch(3, 0);
      engine.addAgents(agents);

      // 不注入事件，直接运行
      const result = await engine.step();
      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBe(0);

      engine.stop();
    });

    it('start/stop 应正确控制运行状态', () => {
      const modelRouter = createMockModelRouter();

      const engine = new WorldEngine({
        config: {
          tickIntervalMs: 10_000, // 长间隔避免实际 tick
          maxAgents: 50,
          eventRetentionTicks: 50,
          enableNaturalSelection: false,
        },
        modelRouter,
      });

      expect(engine.isRunning()).toBe(false);

      engine.start();
      expect(engine.isRunning()).toBe(true);

      engine.stop();
      expect(engine.isRunning()).toBe(false);
    });
  });

  // ── WorldState 格式化输出 ──

  describe('WorldState 格式化', () => {
    it('formatStatus 应返回可读的状态字符串', () => {
      const { engine } = buildTestWorld({ agentCount: 5 });

      const formatted = engine.getWorldState().formatStatus();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);

      engine.stop();
    });
  });

  // ── 运行统计 ──

  describe('运行统计', () => {
    it('tick 历史应可计算统计数据', async () => {
      const modelRouter = createMockModelRouter();

      const engine = new WorldEngine({
        config: {
          tickIntervalMs: 50,
          maxAgents: 50,
          eventRetentionTicks: 50,
          enableNaturalSelection: false,
        },
        modelRouter,
      });

      const agents = engine.spawner.spawnBatch(5, 0);
      engine.addAgents(agents);

      engine.injectEvent({
        title: '测试事件',
        content: '测试内容',
        importance: 0.7,
        propagationRadius: 0.6,
      });

      for (let i = 0; i < 3; i++) {
        await engine.step();
      }

      const history = engine.getTickHistory();
      expect(history).toHaveLength(3);

      // 模拟 CLI 统计计算
      const totalResponses = history.reduce((s, h) => s + h.responsesCollected, 0);
      const totalEvents = history.reduce((s, h) => s + h.eventsProcessed, 0);

      expect(totalEvents).toBeGreaterThanOrEqual(1);
      expect(typeof totalResponses).toBe('number');

      engine.stop();
    });
  });

  // ── 自然选择集成 ──

  describe('自然选择（可选）', () => {
    it('启用自然选择时应可正常执行', async () => {
      const modelRouter = createMockModelRouter();

      const engine = new WorldEngine({
        config: {
          tickIntervalMs: 50,
          maxAgents: 50,
          eventRetentionTicks: 50,
          enableNaturalSelection: true,
        },
        modelRouter,
        naturalSelectionConfig: {
          checkIntervalTicks: 2,
          credibilityThreshold: 0.1,
          inactivityTicks: 10,
          dormantDeathTicks: 20,
        },
      });

      const agents = engine.spawner.spawnBatch(5, 0);
      engine.addAgents(agents);

      engine.injectEvent({
        title: '测试',
        content: '测试内容',
        importance: 0.5,
        propagationRadius: 0.5,
      });

      // 运行足够多的 tick 触发自然选择检查
      for (let i = 0; i < 3; i++) {
        await engine.step();
      }

      // 不应崩溃
      expect(engine.getCurrentTick()).toBe(3);
      expect(engine.getAgents().length).toBeGreaterThanOrEqual(0);

      engine.stop();
    });
  });
});
