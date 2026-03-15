// ============================================================================
// @beeclaw/server — persistence/store 单元测试
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from './database.js';
import { Store } from './store.js';
import type { ConsensusSignal, LLMConfig, ModelRouterConfig } from '@beeclaw/shared';
import type { TickResult } from '@beeclaw/world-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('Store', () => {
  let db: ReturnType<typeof initDatabase>;
  let store: Store;

  beforeEach(() => {
    db = initDatabase(':memory:');
    store = new Store(db);
  });

  // ════════════════════════════════════════
  // 世界状态 KV
  // ════════════════════════════════════════

  describe('getState / setState', () => {
    it('不存在的 key 应返回 undefined', () => {
      expect(store.getState('nonexistent')).toBeUndefined();
    });

    it('应正确存储和读取值', () => {
      store.setState('key1', 'value1');
      expect(store.getState('key1')).toBe('value1');
    });

    it('相同 key 应覆盖旧值', () => {
      store.setState('key', 'old');
      store.setState('key', 'new');
      expect(store.getState('key')).toBe('new');
    });

    it('应支持存储空字符串', () => {
      store.setState('empty', '');
      expect(store.getState('empty')).toBe('');
    });

    it('应支持存储 JSON 字符串', () => {
      const json = JSON.stringify({ a: 1, b: [2, 3] });
      store.setState('json', json);
      expect(store.getState('json')).toBe(json);
    });

    it('多个不同 key 应互不影响', () => {
      store.setState('k1', 'v1');
      store.setState('k2', 'v2');
      store.setState('k3', 'v3');
      expect(store.getState('k1')).toBe('v1');
      expect(store.getState('k2')).toBe('v2');
      expect(store.getState('k3')).toBe('v3');
    });
  });

  describe('getTick / setTick', () => {
    it('初始 tick 应为 0', () => {
      expect(store.getTick()).toBe(0);
    });

    it('应正确设置和获取 tick', () => {
      store.setTick(42);
      expect(store.getTick()).toBe(42);
    });

    it('应支持覆盖 tick', () => {
      store.setTick(10);
      store.setTick(20);
      expect(store.getTick()).toBe(20);
    });

    it('应支持设置为 0', () => {
      store.setTick(100);
      store.setTick(0);
      expect(store.getTick()).toBe(0);
    });
  });

  // ════════════════════════════════════════
  // Agents
  // ════════════════════════════════════════

  describe('Agent 操作', () => {
    // 创建一个最小的 mock Agent
    function createMockAgent(id: string, name: string) {
      return {
        id,
        name,
        toData: () => ({
          id,
          name,
          persona: { background: 'test', profession: 'tester', traits: {}, expertise: [], biases: [], communicationStyle: 'formal' },
          memory: { shortTerm: [], longTerm: [], opinions: {}, predictions: [] },
          relationships: [],
          followers: ['f1'],
          following: ['g1'],
          influence: 50,
          credibility: 0.8,
          status: 'active' as const,
          modelTier: 'cheap' as const,
          spawnedAtTick: 0,
          lastActiveTick: 5,
          modelId: 'cheap-default',
        }),
      } as any;
    }

    it('loadAgentRows 初始应为空', () => {
      expect(store.loadAgentRows()).toEqual([]);
    });

    it('saveAgent 后应能通过 loadAgentRows 读取', () => {
      const agent = createMockAgent('a1', 'Agent1');
      store.saveAgent(agent);
      const rows = store.loadAgentRows();
      expect(rows.length).toBe(1);
      expect(rows[0]!.id).toBe('a1');
      expect(rows[0]!.name).toBe('Agent1');
      expect(rows[0]!.influence).toBe(50);
      expect(rows[0]!.credibility).toBe(0.8);
    });

    it('saveAgent 应正确序列化 JSON 字段', () => {
      const agent = createMockAgent('a1', 'Agent1');
      store.saveAgent(agent);
      const rows = store.loadAgentRows();
      const row = rows[0]!;

      // persona 和 memory 应是 JSON 字符串
      expect(JSON.parse(row.persona)).toHaveProperty('profession', 'tester');
      expect(JSON.parse(row.followers)).toEqual(['f1']);
      expect(JSON.parse(row.following)).toEqual(['g1']);
    });

    it('saveAgents 应批量保存', () => {
      const agents = [
        createMockAgent('a1', 'Agent1'),
        createMockAgent('a2', 'Agent2'),
        createMockAgent('a3', 'Agent3'),
      ];
      store.saveAgents(agents);
      const rows = store.loadAgentRows();
      expect(rows.length).toBe(3);
    });

    it('getAgentRow 应按 ID 查找单个 Agent', () => {
      const agent = createMockAgent('a1', 'Agent1');
      store.saveAgent(agent);

      const row = store.getAgentRow('a1');
      expect(row).toBeDefined();
      expect(row!.name).toBe('Agent1');
    });

    it('getAgentRow 不存在的 ID 应返回 undefined', () => {
      expect(store.getAgentRow('nonexistent')).toBeUndefined();
    });

    it('getAgentRows 应支持分页', () => {
      for (let i = 1; i <= 10; i++) {
        const agent = createMockAgent(`a${i}`, `Agent${i}`);
        // 不同 influence 值
        agent.toData = () => ({
          ...createMockAgent(`a${i}`, `Agent${i}`).toData(),
          influence: i * 10,
        });
        store.saveAgent(agent);
      }

      const page1 = store.getAgentRows(1, 3);
      expect(page1.total).toBe(10);
      expect(page1.rows.length).toBe(3);
      // 按 influence 降序
      expect(page1.rows[0]!.influence).toBeGreaterThanOrEqual(page1.rows[1]!.influence);

      const page2 = store.getAgentRows(2, 3);
      expect(page2.rows.length).toBe(3);

      // 最后一页
      const page4 = store.getAgentRows(4, 3);
      expect(page4.rows.length).toBe(1);
    });

    it('saveAgent 应支持更新（INSERT OR REPLACE）', () => {
      const agent = createMockAgent('a1', 'Agent1');
      store.saveAgent(agent);

      // 更新名称
      const updated = createMockAgent('a1', 'UpdatedAgent');
      store.saveAgent(updated);

      const rows = store.loadAgentRows();
      expect(rows.length).toBe(1);
      expect(rows[0]!.name).toBe('UpdatedAgent');
    });
  });

  // ════════════════════════════════════════
  // Tick History
  // ════════════════════════════════════════

  describe('Tick 历史', () => {
    const makeTickResult = (tick: number, overrides?: Partial<TickResult>): TickResult => ({
      tick,
      eventsProcessed: overrides?.eventsProcessed ?? 2,
      agentsActivated: overrides?.agentsActivated ?? 3,
      responsesCollected: overrides?.responsesCollected ?? 4,
      newAgentsSpawned: overrides?.newAgentsSpawned ?? 0,
      signals: overrides?.signals ?? 1,
      durationMs: overrides?.durationMs ?? 100,
    });

    it('saveTickResult 后应能读取', () => {
      store.saveTickResult(makeTickResult(1));
      const history = store.getTickHistory(10);
      expect(history.length).toBe(1);
      expect(history[0]!.tick).toBe(1);
      expect(history[0]!.eventsProcessed).toBe(2);
      expect(history[0]!.agentsActivated).toBe(3);
      expect(history[0]!.responsesCollected).toBe(4);
      expect(history[0]!.signals).toBe(1);
      expect(history[0]!.durationMs).toBe(100);
    });

    it('getTickHistory 应按 tick 降序返回', () => {
      for (let i = 1; i <= 5; i++) {
        store.saveTickResult(makeTickResult(i));
      }
      const history = store.getTickHistory(10);
      expect(history[0]!.tick).toBe(5);
      expect(history[4]!.tick).toBe(1);
    });

    it('getTickHistory 应遵守 limit 参数', () => {
      for (let i = 1; i <= 10; i++) {
        store.saveTickResult(makeTickResult(i));
      }
      const history = store.getTickHistory(3);
      expect(history.length).toBe(3);
    });

    it('getTickHistory 默认 limit 为 50', () => {
      for (let i = 1; i <= 60; i++) {
        store.saveTickResult(makeTickResult(i));
      }
      const history = store.getTickHistory();
      expect(history.length).toBe(50);
    });

    it('saveTickResult 相同 tick 应覆盖', () => {
      store.saveTickResult(makeTickResult(1, { eventsProcessed: 5 }));
      store.saveTickResult(makeTickResult(1, { eventsProcessed: 10 }));
      const history = store.getTickHistory(10);
      expect(history.length).toBe(1);
      expect(history[0]!.eventsProcessed).toBe(10);
    });

    it('应正确映射字段名（snake_case -> camelCase）', () => {
      store.saveTickResult(makeTickResult(1, {
        eventsProcessed: 7,
        agentsActivated: 8,
        responsesCollected: 9,
        newAgentsSpawned: 2,
      }));
      const history = store.getTickHistory(1);
      const result = history[0]!;
      // 应返回 camelCase 字段
      expect(result.eventsProcessed).toBe(7);
      expect(result.agentsActivated).toBe(8);
      expect(result.responsesCollected).toBe(9);
      expect(result.newAgentsSpawned).toBe(2);
    });
  });

  // ════════════════════════════════════════
  // Consensus Signals
  // ════════════════════════════════════════

  describe('共识信号', () => {
    const makeSignal = (tick: number, topic: string): ConsensusSignal => ({
      tick,
      topic,
      sentimentDistribution: { bullish: 0.5, bearish: 0.3, neutral: 0.2 },
      averageConfidence: 0.7,
      dominantStance: 'bullish',
      consensusDegree: 0.6,
      participantCount: 5,
      trend: 'forming',
      alerts: [],
    });

    it('saveConsensusSignal 后应能通过 getLatestSignals 读取', () => {
      store.saveConsensusSignal(makeSignal(1, '股市'));
      const signals = store.getLatestSignals(10);
      expect(signals.length).toBe(1);
      expect(signals[0]!.topic).toBe('股市');
      expect(signals[0]!.tick).toBe(1);
    });

    it('getLatestSignals 应按 ID 降序（最新在前）', () => {
      store.saveConsensusSignal(makeSignal(1, 'A'));
      store.saveConsensusSignal(makeSignal(2, 'B'));
      store.saveConsensusSignal(makeSignal(3, 'C'));

      const signals = store.getLatestSignals(10);
      expect(signals[0]!.topic).toBe('C');
      expect(signals[2]!.topic).toBe('A');
    });

    it('getLatestSignals 应遵守 limit', () => {
      for (let i = 0; i < 10; i++) {
        store.saveConsensusSignal(makeSignal(i, `topic${i}`));
      }
      const signals = store.getLatestSignals(3);
      expect(signals.length).toBe(3);
    });

    it('getLatestSignals 默认 limit 为 20', () => {
      for (let i = 0; i < 30; i++) {
        store.saveConsensusSignal(makeSignal(i, `topic${i}`));
      }
      const signals = store.getLatestSignals();
      expect(signals.length).toBe(20);
    });

    it('getSignalsByTopic 应按 topic 过滤', () => {
      store.saveConsensusSignal(makeSignal(1, '股市'));
      store.saveConsensusSignal(makeSignal(2, '科技'));
      store.saveConsensusSignal(makeSignal(3, '股市'));

      const stockSignals = store.getSignalsByTopic('股市');
      expect(stockSignals.length).toBe(2);
      for (const s of stockSignals) {
        expect(s.topic).toBe('股市');
      }
    });

    it('getSignalsByTopic 无匹配时应返回空数组', () => {
      store.saveConsensusSignal(makeSignal(1, '股市'));
      const signals = store.getSignalsByTopic('不存在的主题');
      expect(signals).toEqual([]);
    });

    it('getSignalsByTopic 应遵守 limit', () => {
      for (let i = 0; i < 30; i++) {
        store.saveConsensusSignal(makeSignal(i, '同一主题'));
      }
      const signals = store.getSignalsByTopic('同一主题', 5);
      expect(signals.length).toBe(5);
    });

    it('信号数据应完整保留所有字段', () => {
      const signal = makeSignal(1, '测试');
      signal.sentimentDistribution = { bullish: 0.7, bearish: 0.1, neutral: 0.2 };
      signal.averageConfidence = 0.85;
      store.saveConsensusSignal(signal);

      const loaded = store.getLatestSignals(1);
      expect(loaded[0]!.sentimentDistribution.bullish).toBe(0.7);
      expect(loaded[0]!.averageConfidence).toBe(0.85);
    });
  });

  // ════════════════════════════════════════
  // LLM 配置
  // ════════════════════════════════════════

  describe('LLM 配置持久化', () => {
    const makeLLMConfig = (model: string): LLMConfig => ({
      baseURL: `http://test-${model}`,
      apiKey: `key-${model}`,
      model,
      maxTokens: 1024,
      temperature: 0.7,
    });

    it('loadLLMConfigs 初始应返回 null', () => {
      expect(store.loadLLMConfigs()).toBeNull();
    });

    it('saveLLMConfig 保存单个 tier 后 loadLLMConfig 应能读取', () => {
      store.saveLLMConfig('cheap', makeLLMConfig('gpt-4o-mini'));
      const config = store.loadLLMConfig('cheap');
      expect(config).not.toBeNull();
      expect(config!.model).toBe('gpt-4o-mini');
      expect(config!.baseURL).toBe('http://test-gpt-4o-mini');
      expect(config!.apiKey).toBe('key-gpt-4o-mini');
      expect(config!.maxTokens).toBe(1024);
      expect(config!.temperature).toBe(0.7);
    });

    it('loadLLMConfig 不存在的 tier 应返回 null', () => {
      expect(store.loadLLMConfig('local')).toBeNull();
    });

    it('saveLLMConfigs 保存全部 3 个 tier 后 loadLLMConfigs 应返回完整配置', () => {
      const configs: ModelRouterConfig = {
        local: makeLLMConfig('llama-8b'),
        cheap: makeLLMConfig('gpt-4o-mini'),
        strong: makeLLMConfig('gpt-4o'),
      };
      store.saveLLMConfigs(configs);

      const loaded = store.loadLLMConfigs();
      expect(loaded).not.toBeNull();
      expect(loaded!.local.model).toBe('llama-8b');
      expect(loaded!.cheap.model).toBe('gpt-4o-mini');
      expect(loaded!.strong.model).toBe('gpt-4o');
    });

    it('只保存部分 tier 时 loadLLMConfigs 应返回 null', () => {
      store.saveLLMConfig('cheap', makeLLMConfig('gpt-4o-mini'));
      store.saveLLMConfig('local', makeLLMConfig('llama-8b'));
      // 缺少 strong
      expect(store.loadLLMConfigs()).toBeNull();
    });

    it('saveLLMConfig 应支持 maxTokens 和 temperature 为 undefined', () => {
      const config: LLMConfig = {
        baseURL: 'http://test',
        apiKey: 'key',
        model: 'model-x',
      };
      store.saveLLMConfig('cheap', config);
      const loaded = store.loadLLMConfig('cheap');
      expect(loaded!.maxTokens).toBeUndefined();
      expect(loaded!.temperature).toBeUndefined();
    });

    it('saveLLMConfig 相同 tier 应覆盖', () => {
      store.saveLLMConfig('cheap', makeLLMConfig('old-model'));
      store.saveLLMConfig('cheap', makeLLMConfig('new-model'));
      const loaded = store.loadLLMConfig('cheap');
      expect(loaded!.model).toBe('new-model');
    });
  });
});
