// ============================================================================
// ScenarioRunner 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScenarioRunner } from './ScenarioRunner.js';
import type { ScenarioStatus } from './ScenarioRunner.js';
import { WorldEngine } from './WorldEngine.js';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type {
  ScenarioTemplate,
  ModelRouterConfig,
} from '@beeclaw/shared';

// ── Mock 配置 ──

const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

function createMockModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockResolvedValue(
      '{"opinion":"观点","action":"speak","emotionalState":0.3,"reasoning":"理由"}'
    );
  }
  return router;
}

// ── 测试用场景模板 ──

function createTestTemplate(overrides?: Partial<ScenarioTemplate>): ScenarioTemplate {
  return {
    name: 'test-scenario',
    description: '测试场景模板',
    agentProfiles: [
      {
        role: '测试角色A',
        count: 3,
        modelTier: 'local',
        template: {
          professionPool: ['测试员', '工程师'],
          traitRanges: {
            riskTolerance: [0.3, 0.7],
            informationSensitivity: [0.3, 0.7],
            conformity: [0.3, 0.7],
            emotionality: [0.3, 0.7],
            analyticalDepth: [0.3, 0.7],
          },
          expertisePool: [['测试', '开发']],
          biasPool: ['确认偏见'],
        },
      },
      {
        role: '测试角色B',
        count: 2,
        modelTier: 'cheap',
        template: {
          professionPool: ['分析师'],
          traitRanges: {
            riskTolerance: [0.4, 0.8],
            informationSensitivity: [0.5, 0.9],
            conformity: [0.2, 0.5],
            emotionality: [0.2, 0.5],
            analyticalDepth: [0.6, 1.0],
          },
          expertisePool: [['分析', '研究']],
          biasPool: ['锚定效应'],
        },
      },
    ],
    eventSources: [
      {
        type: 'manual',
        name: '手动事件',
        config: { description: '测试事件源' },
      },
    ],
    worldConfig: {
      tickIntervalMs: 1000,
      maxAgents: 50,
      eventRetentionTicks: 50,
      enableNaturalSelection: false,
    },
    consensusConfig: {
      minResponsesForSignal: 2,
      enableAlerts: true,
    },
    duration: 5,
    ...overrides,
  };
}

describe('ScenarioRunner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── 构造 ──

  describe('构造函数', () => {
    it('应正确创建 ScenarioRunner 实例', () => {
      const runner = new ScenarioRunner();
      expect(runner.getStatus()).toBe('idle');
      expect(runner.getTemplate()).toBeNull();
      expect(runner.getEngine()).toBeNull();
      expect(runner.getError()).toBeNull();
      expect(runner.getTickResults()).toEqual([]);
    });

    it('应接受自定义选项', () => {
      const modelRouter = createMockModelRouter();
      const onTick = vi.fn();
      const onComplete = vi.fn();
      const runner = new ScenarioRunner({
        modelRouter,
        concurrency: 20,
        maxTicks: 50,
        onTick,
        onComplete,
      });
      expect(runner.getStatus()).toBe('idle');
    });
  });

  // ── loadTemplate ──

  describe('loadTemplate', () => {
    it('应成功加载模板并创建 Agent', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      const template = createTestTemplate();

      runner.loadTemplate(template);

      expect(runner.getTemplate()).toBe(template);
      expect(runner.getEngine()).toBeInstanceOf(WorldEngine);
      expect(runner.getStatus()).toBe('idle');

      const engine = runner.getEngine()!;
      // 模板定义了 3 + 2 = 5 个 Agent
      expect(engine.getAgents()).toHaveLength(5);
    });

    it('应注入种子事件', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      const template = createTestTemplate({
        seedEvents: [
          {
            title: '测试种子事件',
            content: '测试种子内容',
            category: 'general',
            importance: 0.7,
            tags: ['test', 'seed'],
          },
        ],
      });

      runner.loadTemplate(template);

      const engine = runner.getEngine()!;
      // 种子事件应被注入到 EventBus 中
      const events = engine.eventBus.consumeEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      const seedEvent = events.find(e => e.title === '测试种子事件');
      expect(seedEvent).toBeDefined();
      expect(seedEvent!.content).toBe('测试种子内容');
      expect(seedEvent!.tags).toContain('test');
    });

    it('应配置孵化规则', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      const template = createTestTemplate({
        spawnRules: [
          {
            trigger: { type: 'event_keyword', keywords: ['测试'] },
            template: {
              professionPool: ['测试员'],
              traitRanges: {
                riskTolerance: [0.3, 0.7],
                informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7],
                emotionality: [0.3, 0.7],
                analyticalDepth: [0.3, 0.7],
              },
              expertisePool: [['测试']],
              biasPool: ['确认偏见'],
            },
            count: 2,
            modelTier: 'local',
          },
        ],
      });

      runner.loadTemplate(template);

      const engine = runner.getEngine()!;
      // spawner 应有规则
      expect(engine.spawner.getRules().length).toBeGreaterThanOrEqual(1);
    });

    it('运行中不允许加载新模板', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      const template = createTestTemplate();

      runner.loadTemplate(template);

      // 模拟运行状态
      (runner as unknown as { status: ScenarioStatus }).status = 'running';

      expect(() => runner.loadTemplate(template)).toThrow('场景正在运行中');
    });

    it('可以重新加载不同模板', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      const template1 = createTestTemplate({ name: 'scenario-1' });
      const template2 = createTestTemplate({
        name: 'scenario-2',
        agentProfiles: [
          {
            role: '新角色',
            count: 4,
            modelTier: 'strong',
            template: {
              professionPool: ['新职业'],
              traitRanges: {
                riskTolerance: [0.3, 0.7],
                informationSensitivity: [0.3, 0.7],
                conformity: [0.3, 0.7],
                emotionality: [0.3, 0.7],
                analyticalDepth: [0.3, 0.7],
              },
              expertisePool: [['新领域']],
              biasPool: ['过度自信'],
            },
          },
        ],
      });

      runner.loadTemplate(template1);
      expect(runner.getTemplate()!.name).toBe('scenario-1');
      expect(runner.getEngine()!.getAgents()).toHaveLength(5);

      runner.loadTemplate(template2);
      expect(runner.getTemplate()!.name).toBe('scenario-2');
      expect(runner.getEngine()!.getAgents()).toHaveLength(4);
    });

    it('无种子事件和孵化规则时也应正常加载', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      const template = createTestTemplate({
        seedEvents: undefined,
        spawnRules: undefined,
      });

      runner.loadTemplate(template);

      expect(runner.getEngine()).toBeInstanceOf(WorldEngine);
      expect(runner.getEngine()!.getAgents()).toHaveLength(5);
    });

    it('应使用模板中的世界配置覆盖默认值', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      const template = createTestTemplate({
        worldConfig: {
          tickIntervalMs: 5000,
          maxAgents: 200,
        },
      });

      runner.loadTemplate(template);

      const engine = runner.getEngine()!;
      expect(engine.config.tickIntervalMs).toBe(5000);
      expect(engine.config.maxAgents).toBe(200);
    });
  });

  // ── run ──

  describe('run', () => {
    it('未加载模板时运行应抛出错误', async () => {
      const runner = new ScenarioRunner();
      await expect(runner.run()).rejects.toThrow('请先使用 loadTemplate()');
    });

    it('应运行指定数量的 tick', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({ duration: 3 }));

      const results = await runner.run(3);

      expect(results).toHaveLength(3);
      expect(runner.getStatus()).toBe('completed');
      expect(runner.getTickResults()).toHaveLength(3);
    });

    it('应使用模板的 duration 作为默认 tick 数', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({ duration: 2 }));

      const results = await runner.run();

      expect(results).toHaveLength(2);
    });

    it('应使用选项中的 maxTicks 覆盖模板 duration', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router, maxTicks: 2 });
      runner.loadTemplate(createTestTemplate({ duration: 10 }));

      const results = await runner.run();

      expect(results).toHaveLength(2);
    });

    it('run 参数应覆盖所有默认值', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router, maxTicks: 50 });
      runner.loadTemplate(createTestTemplate({ duration: 100 }));

      const results = await runner.run(1);

      expect(results).toHaveLength(1);
    });

    it('应触发 onTick 回调', async () => {
      const router = createMockModelRouter();
      const onTick = vi.fn();
      const runner = new ScenarioRunner({ modelRouter: router, onTick });
      runner.loadTemplate(createTestTemplate());

      await runner.run(2);

      expect(onTick).toHaveBeenCalledTimes(2);
      expect(onTick.mock.calls[0][0]).toHaveProperty('tick');
      expect(onTick.mock.calls[0][0]).toHaveProperty('eventsProcessed');
    });

    it('应触发 onComplete 回调', async () => {
      const router = createMockModelRouter();
      const onComplete = vi.fn();
      const runner = new ScenarioRunner({ modelRouter: router, onComplete });
      runner.loadTemplate(createTestTemplate());

      await runner.run(1);

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0]).toHaveLength(1);
    });

    it('重复运行应抛出错误', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate());

      // 模拟运行状态
      (runner as unknown as { status: ScenarioStatus }).status = 'running';

      await expect(runner.run()).rejects.toThrow('场景已在运行中');
    });

    it('TickResult 应包含正确的结构', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate());

      const results = await runner.run(1);
      const result = results[0]!;

      expect(result).toHaveProperty('tick');
      expect(result).toHaveProperty('eventsProcessed');
      expect(result).toHaveProperty('agentsActivated');
      expect(result).toHaveProperty('responsesCollected');
      expect(result).toHaveProperty('newAgentsSpawned');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('durationMs');
      expect(typeof result.tick).toBe('number');
      expect(typeof result.durationMs).toBe('number');
    });
  });

  // ── stop ──

  describe('stop', () => {
    it('运行中调用 stop 应停止场景', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({ duration: 100 }));

      // 在 onTick 中的第 2 个 tick 后停止
      let tickCount = 0;
      const _runPromise = runner.run(100);

      // 等一下让第一个 tick 执行，然后直接通过 stop 停止
      // 由于 run 是同步循环 await step()，我们需要在 onTick 回调中调用 stop
      const runner2 = new ScenarioRunner({
        modelRouter: router,
        onTick: () => {
          tickCount++;
          if (tickCount >= 2) {
            runner2.stop();
          }
        },
      });
      runner2.loadTemplate(createTestTemplate({ duration: 100 }));
      const results = await runner2.run(100);

      expect(results.length).toBeLessThan(100);
      expect(runner2.getStatus()).toBe('stopped');
    });

    it('非运行状态调用 stop 应无副作用', () => {
      const runner = new ScenarioRunner();
      // 不应抛出错误
      runner.stop();
      expect(runner.getStatus()).toBe('idle');
    });
  });

  // ── getSummary ──

  describe('getSummary', () => {
    it('未加载模板时应返回 null', () => {
      const runner = new ScenarioRunner();
      expect(runner.getSummary()).toBeNull();
    });

    it('加载模板后应返回正确的摘要', () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate());

      const summary = runner.getSummary();
      expect(summary).not.toBeNull();
      expect(summary!.name).toBe('test-scenario');
      expect(summary!.description).toBe('测试场景模板');
      expect(summary!.status).toBe('idle');
      expect(summary!.totalAgentsCreated).toBe(5); // 3 + 2
      expect(summary!.currentAgentCount).toBe(5);
      expect(summary!.eventSources).toEqual(['手动事件']);
      expect(summary!.error).toBeNull();
    });

    it('运行后的摘要应包含统计数据', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({
        seedEvents: [
          {
            title: '种子事件',
            content: '测试种子',
            category: 'general',
            importance: 0.8,
            tags: ['test'],
          },
        ],
      }));

      await runner.run(2);

      const summary = runner.getSummary();
      expect(summary!.status).toBe('completed');
      expect(summary!.ticksCompleted).toBe(2);
    });
  });

  // ── getTickResults ──

  describe('getTickResults', () => {
    it('应返回 tickResults 的副本', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate());

      await runner.run(2);

      const results1 = runner.getTickResults();
      const results2 = runner.getTickResults();

      expect(results1).toEqual(results2);
      expect(results1).not.toBe(results2); // 不同引用
    });
  });

  // ── describeEventSources ──

  describe('describeEventSources (静态方法)', () => {
    it('应正确描述金融数据源', () => {
      const descriptions = ScenarioRunner.describeEventSources([
        { type: 'finance', name: '美股行情', config: {} },
      ]);
      expect(descriptions).toEqual(['金融数据源: 美股行情']);
    });

    it('应正确描述 RSS 新闻源', () => {
      const descriptions = ScenarioRunner.describeEventSources([
        { type: 'rss', name: '科技新闻', config: {} },
      ]);
      expect(descriptions).toEqual(['RSS 新闻源: 科技新闻']);
    });

    it('应正确描述手动事件源', () => {
      const descriptions = ScenarioRunner.describeEventSources([
        { type: 'manual', name: '手动注入', config: {} },
      ]);
      expect(descriptions).toEqual(['手动事件注入: 手动注入']);
    });

    it('应正确描述未知类型', () => {
      const descriptions = ScenarioRunner.describeEventSources([
        { type: 'unknown' as 'manual', name: '其他', config: {} },
      ]);
      expect(descriptions).toEqual(['未知类型: 其他']);
    });

    it('应处理多个事件源', () => {
      const descriptions = ScenarioRunner.describeEventSources([
        { type: 'finance', name: '行情', config: {} },
        { type: 'rss', name: '新闻', config: {} },
        { type: 'manual', name: '注入', config: {} },
      ]);
      expect(descriptions).toHaveLength(3);
      expect(descriptions[0]).toContain('金融');
      expect(descriptions[1]).toContain('RSS');
      expect(descriptions[2]).toContain('手动');
    });

    it('应处理空数组', () => {
      const descriptions = ScenarioRunner.describeEventSources([]);
      expect(descriptions).toEqual([]);
    });
  });

  // ── 错误处理 ──

  describe('错误处理', () => {
    it('run 出错时状态应为 error', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate());

      // 模拟 engine.step 抛出错误
      const engine = runner.getEngine()!;
      vi.spyOn(engine, 'step').mockRejectedValue(new Error('测试错误'));

      await expect(runner.run(1)).rejects.toThrow('测试错误');
      expect(runner.getStatus()).toBe('error');
      expect(runner.getError()).toBe('测试错误');
    });

    it('非 Error 对象也应被捕获', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate());

      const engine = runner.getEngine()!;
      vi.spyOn(engine, 'step').mockRejectedValue('字符串错误');

      await expect(runner.run(1)).rejects.toBe('字符串错误');
      expect(runner.getStatus()).toBe('error');
      expect(runner.getError()).toBe('字符串错误');
    });
  });

  // ── 默认配置 ──

  describe('默认配置', () => {
    it('无 modelRouter 时应创建默认的 ModelRouter', () => {
      const runner = new ScenarioRunner();
      runner.loadTemplate(createTestTemplate());

      expect(runner.getEngine()).toBeInstanceOf(WorldEngine);
    });

    it('默认并发数应为 10', () => {
      const runner = new ScenarioRunner();
      runner.loadTemplate(createTestTemplate());

      // 引擎应该可以正常运行
      expect(runner.getEngine()).toBeInstanceOf(WorldEngine);
    });

    it('无 duration 时应默认运行 10 个 tick', async () => {
      const router = createMockModelRouter();
      const runner = new ScenarioRunner({ modelRouter: router });
      runner.loadTemplate(createTestTemplate({
        duration: undefined, // 移除 duration
      }));

      const results = await runner.run();
      expect(results).toHaveLength(10); // 默认 10 tick
    });
  });
});
