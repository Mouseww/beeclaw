// ============================================================================
// @beeclaw/agent-runtime AgentSpawner 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSpawner } from './AgentSpawner.js';
import type { SpawnRule, WorldEvent, AgentTemplate } from '@beeclaw/shared';

function createTestEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 'evt_test',
    type: 'external',
    category: 'finance',
    title: '央行降息',
    content: '央行宣布降息 25 个基点',
    source: 'manual',
    importance: 0.7,
    propagationRadius: 0.5,
    tick: 5,
    tags: ['金融', '利率'],
    ...overrides,
  };
}

const TEST_TEMPLATE: AgentTemplate = {
  professionPool: ['分析师', '投资者'],
  traitRanges: {
    riskTolerance: [0.3, 0.7],
    informationSensitivity: [0.3, 0.7],
    conformity: [0.3, 0.7],
    emotionality: [0.3, 0.7],
    analyticalDepth: [0.3, 0.7],
  },
  expertisePool: [['金融', '股票']],
  biasPool: ['确认偏见'],
};

describe('AgentSpawner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // ── spawnBatch ──

  describe('spawnBatch', () => {
    it('应生成指定数量的 Agent', () => {
      const spawner = new AgentSpawner();
      const agents = spawner.spawnBatch(5, 1);
      expect(agents).toHaveLength(5);
    });

    it('每个 Agent 应有唯一 id 和正确的 spawnedAtTick', () => {
      const spawner = new AgentSpawner();
      const agents = spawner.spawnBatch(3, 10);
      const ids = agents.map(a => a.id);
      expect(new Set(ids).size).toBe(3); // 唯一 ID
      for (const agent of agents) {
        expect(agent.spawnedAtTick).toBe(10);
      }
    });

    it('默认 modelTier 为 cheap', () => {
      const spawner = new AgentSpawner();
      const agents = spawner.spawnBatch(2, 1);
      for (const agent of agents) {
        expect(agent.modelTier).toBe('cheap');
      }
    });

    it('应支持指定 modelTier', () => {
      const spawner = new AgentSpawner();
      const agents = spawner.spawnBatch(2, 1, 'strong');
      for (const agent of agents) {
        expect(agent.modelTier).toBe('strong');
      }
    });

    it('应支持自定义模板', () => {
      const spawner = new AgentSpawner();
      const agents = spawner.spawnBatch(3, 1, 'cheap', TEST_TEMPLATE);
      for (const agent of agents) {
        expect(TEST_TEMPLATE.professionPool).toContain(agent.persona.profession);
      }
    });

    it('应累计 spawnCount', () => {
      const spawner = new AgentSpawner();
      expect(spawner.getTotalSpawnCount()).toBe(0);
      spawner.spawnBatch(3, 1);
      expect(spawner.getTotalSpawnCount()).toBe(3);
      spawner.spawnBatch(5, 2);
      expect(spawner.getTotalSpawnCount()).toBe(8);
    });
  });

  // ── addRule / checkEventTriggers ──

  describe('checkEventTriggers', () => {
    it('event_keyword 规则：关键词匹配时应触发孵化', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'event_keyword', keywords: ['降息'] },
        template: TEST_TEMPLATE,
        count: 2,
        modelTier: 'cheap',
      });

      const event = createTestEvent({ title: '央行降息了' });
      const agents = spawner.checkEventTriggers(event, 10, 5);
      expect(agents).toHaveLength(2);
    });

    it('event_keyword 规则：关键词不匹配时不应触发', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'event_keyword', keywords: ['加息'] },
        template: TEST_TEMPLATE,
        count: 2,
        modelTier: 'cheap',
      });

      const event = createTestEvent({ title: '天气预报', content: '今天晴天', tags: [] });
      const agents = spawner.checkEventTriggers(event, 10, 5);
      expect(agents).toHaveLength(0);
    });

    it('new_topic 规则：重要性满足时应触发', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'new_topic', minNovelty: 0.6 },
        template: TEST_TEMPLATE,
        count: 3,
        modelTier: 'local',
      });

      const event = createTestEvent({ importance: 0.8 });
      const agents = spawner.checkEventTriggers(event, 10, 5);
      expect(agents).toHaveLength(3);
    });

    it('manual 规则不应自动触发', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'manual' },
        template: TEST_TEMPLATE,
        count: 5,
        modelTier: 'cheap',
      });

      const agents = spawner.checkEventTriggers(createTestEvent(), 10, 5);
      expect(agents).toHaveLength(0);
    });

    it('多条规则可同时触发', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'event_keyword', keywords: ['降息'] },
        template: TEST_TEMPLATE,
        count: 2,
        modelTier: 'cheap',
      });
      spawner.addRule({
        trigger: { type: 'new_topic', minNovelty: 0.5 },
        template: TEST_TEMPLATE,
        count: 3,
        modelTier: 'local',
      });

      const event = createTestEvent({ title: '央行降息', importance: 0.7 });
      const agents = spawner.checkEventTriggers(event, 10, 5);
      expect(agents).toHaveLength(5); // 2 + 3
    });
  });

  // ── checkScheduledTriggers ──

  describe('checkScheduledTriggers', () => {
    it('scheduled 规则：tick 满足间隔时应触发', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'scheduled', intervalTicks: 10 },
        template: TEST_TEMPLATE,
        count: 2,
        modelTier: 'cheap',
      });

      const agents10 = spawner.checkScheduledTriggers(10, 50);
      expect(agents10).toHaveLength(2);

      const agents15 = spawner.checkScheduledTriggers(15, 50);
      expect(agents15).toHaveLength(0);

      const agents20 = spawner.checkScheduledTriggers(20, 50);
      expect(agents20).toHaveLength(2);
    });

    it('population_drop 规则：人数低于阈值时应触发', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'population_drop', threshold: 10 },
        template: TEST_TEMPLATE,
        count: 5,
        modelTier: 'cheap',
      });

      // 当前 8 个，低于阈值 10
      const agents = spawner.checkScheduledTriggers(1, 8);
      expect(agents).toHaveLength(5);

      // 当前 15 个，高于阈值
      const noAgents = spawner.checkScheduledTriggers(2, 15);
      expect(noAgents).toHaveLength(0);
    });
  });

  // ── getRules ──

  describe('getRules', () => {
    it('初始无规则时应返回空数组', () => {
      const spawner = new AgentSpawner();
      expect(spawner.getRules()).toEqual([]);
      expect(spawner.getRules()).toHaveLength(0);
    });

    it('应返回所有已添加的规则', () => {
      const spawner = new AgentSpawner();
      const rule1: SpawnRule = {
        trigger: { type: 'event_keyword', keywords: ['降息'] },
        template: TEST_TEMPLATE,
        count: 2,
        modelTier: 'cheap',
      };
      const rule2: SpawnRule = {
        trigger: { type: 'population_drop', threshold: 5 },
        template: TEST_TEMPLATE,
        count: 3,
        modelTier: 'local',
      };

      spawner.addRule(rule1);
      spawner.addRule(rule2);

      const rules = spawner.getRules();
      expect(rules).toHaveLength(2);
      expect(rules[0]).toEqual(rule1);
      expect(rules[1]).toEqual(rule2);
    });

    it('构造函数传入规则后 getRules 应返回正确结果', () => {
      const rules: SpawnRule[] = [{
        trigger: { type: 'event_keyword', keywords: ['测试'] },
        template: TEST_TEMPLATE,
        count: 1,
        modelTier: 'cheap',
      }];
      const spawner = new AgentSpawner(rules);

      const result = spawner.getRules();
      expect(result).toHaveLength(1);
      expect(result[0].trigger.type).toBe('event_keyword');
    });

    it('返回的是规则副本，修改不影响内部状态', () => {
      const spawner = new AgentSpawner();
      spawner.addRule({
        trigger: { type: 'event_keyword', keywords: ['降息'] },
        template: TEST_TEMPLATE,
        count: 2,
        modelTier: 'cheap',
      });

      const rules = spawner.getRules();
      rules.push({
        trigger: { type: 'manual' },
        template: TEST_TEMPLATE,
        count: 10,
        modelTier: 'strong',
      });

      // 内部规则不受外部 push 影响
      expect(spawner.getRules()).toHaveLength(1);
    });
  });

  // ── 构造函数带规则 ──

  describe('constructor with rules', () => {
    it('应支持构造时传入规则', () => {
      const rules: SpawnRule[] = [{
        trigger: { type: 'event_keyword', keywords: ['测试'] },
        template: TEST_TEMPLATE,
        count: 1,
        modelTier: 'cheap',
      }];
      const spawner = new AgentSpawner(rules);
      const agents = spawner.checkEventTriggers(
        createTestEvent({ title: '测试事件' }), 10, 1
      );
      expect(agents).toHaveLength(1);
    });
  });
});
