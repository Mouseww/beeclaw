// ============================================================================
// @beeclaw/server — persistence/store 单元测试
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from './database.js';
import { Store } from './store.js';
import type { ApiKeyEntry } from './store.js';
import type { ConsensusSignal, LLMConfig, ModelRouterConfig, WebhookSubscription, WebhookEventType } from '@beeclaw/shared';
import type { TickResult, TickEventSummary, TickResponseSummary } from '@beeclaw/world-engine';
import type { FeedSource } from '@beeclaw/event-ingestion';

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
    it('不存在的 key 应返回 undefined', async () => {
      expect(await store.getState('nonexistent')).toBeUndefined();
    });

    it('应正确存储和读取值', async () => {
      await store.setState('key1', 'value1');
      expect(await store.getState('key1')).toBe('value1');
    });

    it('相同 key 应覆盖旧值', async () => {
      await store.setState('key', 'old');
      await store.setState('key', 'new');
      expect(await store.getState('key')).toBe('new');
    });

    it('应支持存储空字符串', async () => {
      await store.setState('empty', '');
      expect(await store.getState('empty')).toBe('');
    });

    it('应支持存储 JSON 字符串', async () => {
      const json = JSON.stringify({ a: 1, b: [2, 3] });
      await store.setState('json', json);
      expect(await store.getState('json')).toBe(json);
    });

    it('多个不同 key 应互不影响', async () => {
      await store.setState('k1', 'v1');
      await store.setState('k2', 'v2');
      await store.setState('k3', 'v3');
      expect(await store.getState('k1')).toBe('v1');
      expect(await store.getState('k2')).toBe('v2');
      expect(await store.getState('k3')).toBe('v3');
    });
  });

  describe('getTick / setTick', () => {
    it('初始 tick 应为 0', async () => {
      expect(await store.getTick()).toBe(0);
    });

    it('应正确设置和获取 tick', async () => {
      await store.setTick(42);
      expect(await store.getTick()).toBe(42);
    });

    it('应支持覆盖 tick', async () => {
      await store.setTick(10);
      await store.setTick(20);
      expect(await store.getTick()).toBe(20);
    });

    it('应支持设置为 0', async () => {
      await store.setTick(100);
      await store.setTick(0);
      expect(await store.getTick()).toBe(0);
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

    it('loadAgentRows 初始应为空', async () => {
      expect(await store.loadAgentRows()).toEqual([]);
    });

    it('saveAgent 后应能通过 loadAgentRows 读取', async () => {
      const agent = createMockAgent('a1', 'Agent1');
      await store.saveAgent(agent);
      const rows = await store.loadAgentRows();
      expect(rows.length).toBe(1);
      expect(rows[0]!.id).toBe('a1');
      expect(rows[0]!.name).toBe('Agent1');
      expect(rows[0]!.influence).toBe(50);
      expect(rows[0]!.credibility).toBe(0.8);
    });

    it('saveAgent 应正确序列化 JSON 字段', async () => {
      const agent = createMockAgent('a1', 'Agent1');
      await store.saveAgent(agent);
      const rows = await store.loadAgentRows();
      const row = rows[0]!;

      // persona 和 memory 应是 JSON 字符串
      expect(JSON.parse(row.persona)).toHaveProperty('profession', 'tester');
      expect(JSON.parse(row.followers)).toEqual(['f1']);
      expect(JSON.parse(row.following)).toEqual(['g1']);
    });

    it('saveAgents 应批量保存', async () => {
      const agents = [
        createMockAgent('a1', 'Agent1'),
        createMockAgent('a2', 'Agent2'),
        createMockAgent('a3', 'Agent3'),
      ];
      await store.saveAgents(agents);
      const rows = await store.loadAgentRows();
      expect(rows.length).toBe(3);
    });

    it('saveAgents 空数组应不报错且不写入数据', async () => {
      await store.saveAgents([]);
      expect(await store.loadAgentRows()).toEqual([]);
    });

    it('saveAgents 应在批量写入中覆盖已存在的 Agent', async () => {
      await store.saveAgent(createMockAgent('a1', 'OldAgent'));

      await store.saveAgents([
        createMockAgent('a1', 'UpdatedAgent'),
        createMockAgent('a2', 'NewAgent'),
      ]);

      const rows = await store.loadAgentRows();
      expect(rows.length).toBe(2);
      expect(rows.find(row => row.id === 'a1')?.name).toBe('UpdatedAgent');
      expect(rows.find(row => row.id === 'a2')?.name).toBe('NewAgent');
    });

    it('getAgentRow 应按 ID 查找单个 Agent', async () => {
      const agent = createMockAgent('a1', 'Agent1');
      await store.saveAgent(agent);

      const row = await store.getAgentRow('a1');
      expect(row).toBeDefined();
      expect(row!.name).toBe('Agent1');
    });

    it('getAgentRow 不存在的 ID 应返回 undefined', async () => {
      expect(await store.getAgentRow('nonexistent')).toBeUndefined();
    });

    it('getAgentRows 应支持分页', async () => {
      for (let i = 1; i <= 10; i++) {
        const agent = createMockAgent(`a${i}`, `Agent${i}`);
        // 不同 influence 值
        agent.toData = () => ({
          ...createMockAgent(`a${i}`, `Agent${i}`).toData(),
          influence: i * 10,
        });
        await store.saveAgent(agent);
      }

      const page1 = await store.getAgentRows(1, 3);
      expect(page1.total).toBe(10);
      expect(page1.rows.length).toBe(3);
      // 按 influence 降序
      expect(page1.rows[0]!.influence).toBeGreaterThanOrEqual(page1.rows[1]!.influence);

      const page2 = await store.getAgentRows(2, 3);
      expect(page2.rows.length).toBe(3);

      // 最后一页
      const page4 = await store.getAgentRows(4, 3);
      expect(page4.rows.length).toBe(1);
    });

    it('getAgentRows 超出最后一页时应返回空结果但 total 保持正确', async () => {
      for (let i = 1; i <= 10; i++) {
        await store.saveAgent(createMockAgent(`a${i}`, `Agent${i}`));
      }

      const page5 = await store.getAgentRows(5, 3);
      expect(page5.total).toBe(10);
      expect(page5.rows).toEqual([]);
    });

    it('getAgentRows 最后一页不足 size 时应仅返回剩余记录', async () => {
      for (let i = 1; i <= 10; i++) {
        await store.saveAgent(createMockAgent(`a${i}`, `Agent${i}`));
      }

      const lastPage = await store.getAgentRows(3, 4);
      expect(lastPage.total).toBe(10);
      expect(lastPage.rows).toHaveLength(2);
    });

    it('saveAgent 应支持更新（INSERT OR REPLACE）', async () => {
      const agent = createMockAgent('a1', 'Agent1');
      await store.saveAgent(agent);

      // 更新名称
      const updated = createMockAgent('a1', 'UpdatedAgent');
      await store.saveAgent(updated);

      const rows = await store.loadAgentRows();
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

    it('saveTickResult 后应能读取', async () => {
      await store.saveTickResult(makeTickResult(1));
      const history = await store.getTickHistory(10);
      expect(history.length).toBe(1);
      expect(history[0]!.tick).toBe(1);
      expect(history[0]!.eventsProcessed).toBe(2);
      expect(history[0]!.agentsActivated).toBe(3);
      expect(history[0]!.responsesCollected).toBe(4);
      expect(history[0]!.signals).toBe(1);
      expect(history[0]!.durationMs).toBe(100);
    });

    it('getTickHistory 应按 tick 降序返回', async () => {
      for (let i = 1; i <= 5; i++) {
        await store.saveTickResult(makeTickResult(i));
      }
      const history = await store.getTickHistory(10);
      expect(history[0]!.tick).toBe(5);
      expect(history[4]!.tick).toBe(1);
    });

    it('getTickHistory 应遵守 limit 参数', async () => {
      for (let i = 1; i <= 10; i++) {
        await store.saveTickResult(makeTickResult(i));
      }
      const history = await store.getTickHistory(3);
      expect(history.length).toBe(3);
    });

    it('getTickHistory 默认 limit 为 50', async () => {
      for (let i = 1; i <= 60; i++) {
        await store.saveTickResult(makeTickResult(i));
      }
      const history = await store.getTickHistory();
      expect(history.length).toBe(50);
    });

    it('getTickHistory limit 为 0 时应返回空数组', async () => {
      for (let i = 1; i <= 5; i++) {
        await store.saveTickResult(makeTickResult(i));
      }

      expect(await store.getTickHistory(0)).toEqual([]);
    });

    it('saveTickResult 相同 tick 应覆盖', async () => {
      await store.saveTickResult(makeTickResult(1, { eventsProcessed: 5 }));
      await store.saveTickResult(makeTickResult(1, { eventsProcessed: 10 }));
      const history = await store.getTickHistory(10);
      expect(history.length).toBe(1);
      expect(history[0]!.eventsProcessed).toBe(10);
    });

    it('应正确映射字段名（snake_case -> camelCase）', async () => {
      await store.saveTickResult(makeTickResult(1, {
        eventsProcessed: 7,
        agentsActivated: 8,
        responsesCollected: 9,
        newAgentsSpawned: 2,
      }));
      const history = await store.getTickHistory(1);
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

    it('saveConsensusSignal 后应能通过 getLatestSignals 读取', async () => {
      await store.saveConsensusSignal(makeSignal(1, '股市'));
      const signals = await store.getLatestSignals(10);
      expect(signals.length).toBe(1);
      expect(signals[0]!.topic).toBe('股市');
      expect(signals[0]!.tick).toBe(1);
    });

    it('getLatestSignals 应按 ID 降序（最新在前）', async () => {
      await store.saveConsensusSignal(makeSignal(1, 'A'));
      await store.saveConsensusSignal(makeSignal(2, 'B'));
      await store.saveConsensusSignal(makeSignal(3, 'C'));

      const signals = await store.getLatestSignals(10);
      expect(signals[0]!.topic).toBe('C');
      expect(signals[2]!.topic).toBe('A');
    });

    it('getLatestSignals 应遵守 limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.saveConsensusSignal(makeSignal(i, `topic${i}`));
      }
      const signals = await store.getLatestSignals(3);
      expect(signals.length).toBe(3);
    });

    it('getLatestSignals 默认 limit 为 20', async () => {
      for (let i = 0; i < 30; i++) {
        await store.saveConsensusSignal(makeSignal(i, `topic${i}`));
      }
      const signals = await store.getLatestSignals();
      expect(signals.length).toBe(20);
    });

    it('getSignalsByTopic 应按 topic 过滤', async () => {
      await store.saveConsensusSignal(makeSignal(1, '股市'));
      await store.saveConsensusSignal(makeSignal(2, '科技'));
      await store.saveConsensusSignal(makeSignal(3, '股市'));

      const stockSignals = await store.getSignalsByTopic('股市');
      expect(stockSignals.length).toBe(2);
      for (const s of stockSignals) {
        expect(s.topic).toBe('股市');
      }
    });

    it('getSignalsByTopic 无匹配时应返回空数组', async () => {
      await store.saveConsensusSignal(makeSignal(1, '股市'));
      const signals = await store.getSignalsByTopic('不存在的主题');
      expect(signals).toEqual([]);
    });

    it('getSignalsByTopic 应遵守 limit', async () => {
      for (let i = 0; i < 30; i++) {
        await store.saveConsensusSignal(makeSignal(i, '同一主题'));
      }
      const signals = await store.getSignalsByTopic('同一主题', 5);
      expect(signals.length).toBe(5);
    });

    it('信号数据应完整保留所有字段', async () => {
      const signal = makeSignal(1, '测试');
      signal.sentimentDistribution = { bullish: 0.7, bearish: 0.1, neutral: 0.2 };
      signal.averageConfidence = 0.85;
      await store.saveConsensusSignal(signal);

      const loaded = await store.getLatestSignals(1);
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

    it('loadLLMConfigs 初始应返回 null', async () => {
      expect(await store.loadLLMConfigs()).toBeNull();
    });

    it('saveLLMConfig 保存单个 tier 后 loadLLMConfig 应能读取', async () => {
      await store.saveLLMConfig('cheap', makeLLMConfig('gpt-4o-mini'));
      const config = await store.loadLLMConfig('cheap');
      expect(config).not.toBeNull();
      expect(config!.model).toBe('gpt-4o-mini');
      expect(config!.baseURL).toBe('http://test-gpt-4o-mini');
      expect(config!.apiKey).toBe('key-gpt-4o-mini');
      expect(config!.maxTokens).toBe(1024);
      expect(config!.temperature).toBe(0.7);
    });

    it('loadLLMConfig 不存在的 tier 应返回 null', async () => {
      expect(await store.loadLLMConfig('local')).toBeNull();
    });

    it('saveLLMConfigs 保存全部 3 个 tier 后 loadLLMConfigs 应返回完整配置', async () => {
      const configs: ModelRouterConfig = {
        local: makeLLMConfig('llama-8b'),
        cheap: makeLLMConfig('gpt-4o-mini'),
        strong: makeLLMConfig('gpt-4o'),
      };
      await store.saveLLMConfigs(configs);

      const loaded = await store.loadLLMConfigs();
      expect(loaded).not.toBeNull();
      expect(loaded!.local.model).toBe('llama-8b');
      expect(loaded!.cheap.model).toBe('gpt-4o-mini');
      expect(loaded!.strong.model).toBe('gpt-4o');
    });

    it('只保存部分 tier 时 loadLLMConfigs 应返回 null', async () => {
      await store.saveLLMConfig('cheap', makeLLMConfig('gpt-4o-mini'));
      await store.saveLLMConfig('local', makeLLMConfig('llama-8b'));
      // 缺少 strong
      expect(await store.loadLLMConfigs()).toBeNull();
    });

    it('saveLLMConfig 应支持 maxTokens 和 temperature 为 undefined', async () => {
      const config: LLMConfig = {
        baseURL: 'http://test',
        apiKey: 'key',
        model: 'model-x',
      };
      await store.saveLLMConfig('cheap', config);
      const loaded = await store.loadLLMConfig('cheap');
      expect(loaded!.maxTokens).toBeUndefined();
      expect(loaded!.temperature).toBeUndefined();
    });

    it('saveLLMConfig 相同 tier 应覆盖', async () => {
      await store.saveLLMConfig('cheap', makeLLMConfig('old-model'));
      await store.saveLLMConfig('cheap', makeLLMConfig('new-model'));
      const loaded = await store.loadLLMConfig('cheap');
      expect(loaded!.model).toBe('new-model');
    });
  });

  // ════════════════════════════════════════
  // Webhook 订阅
  // ════════════════════════════════════════

  describe('Webhook 订阅', () => {
    const makeWebhook = (id: string, overrides?: Partial<WebhookSubscription>): WebhookSubscription => ({
      id,
      url: overrides?.url ?? `https://example.com/webhook/${id}`,
      events: overrides?.events ?? ['tick.completed', 'consensus.signal'] as WebhookEventType[],
      secret: overrides?.secret ?? `secret-${id}`,
      active: overrides?.active ?? true,
      createdAt: overrides?.createdAt ?? Math.floor(Date.now() / 1000),
    });

    it('getWebhooks 初始应为空', async () => {
      expect(await store.getWebhooks()).toEqual([]);
    });

    it('createWebhook 后应能通过 getWebhooks 读取', async () => {
      const wh = makeWebhook('wh1');
      await store.createWebhook(wh);
      const webhooks = await store.getWebhooks();
      expect(webhooks.length).toBe(1);
      expect(webhooks[0]!.id).toBe('wh1');
      expect(webhooks[0]!.url).toBe('https://example.com/webhook/wh1');
      expect(webhooks[0]!.events).toEqual(['tick.completed', 'consensus.signal']);
      expect(webhooks[0]!.secret).toBe('secret-wh1');
      expect(webhooks[0]!.active).toBe(true);
    });

    it('getWebhook 应按 ID 查找单个 webhook', async () => {
      await store.createWebhook(makeWebhook('wh1'));
      await store.createWebhook(makeWebhook('wh2'));

      const wh = await store.getWebhook('wh1');
      expect(wh).not.toBeNull();
      expect(wh!.id).toBe('wh1');
    });

    it('getWebhook 不存在的 ID 应返回 null', async () => {
      expect(await store.getWebhook('nonexistent')).toBeNull();
    });

    it('updateWebhook 应更新指定字段', async () => {
      await store.createWebhook(makeWebhook('wh1'));

      const updated = await store.updateWebhook('wh1', {
        url: 'https://new-url.com/hook',
        active: false,
      });
      expect(updated).toBe(true);

      const wh = await store.getWebhook('wh1');
      expect(wh!.url).toBe('https://new-url.com/hook');
      expect(wh!.active).toBe(false);
      // events 应保持不变
      expect(wh!.events).toEqual(['tick.completed', 'consensus.signal']);
    });

    it('updateWebhook 应支持只更新 events', async () => {
      await store.createWebhook(makeWebhook('wh1'));

      await store.updateWebhook('wh1', {
        events: ['agent.spawned'] as WebhookEventType[],
      });

      const wh = await store.getWebhook('wh1');
      expect(wh!.events).toEqual(['agent.spawned']);
      // url 应保持不变
      expect(wh!.url).toBe('https://example.com/webhook/wh1');
    });

    it('updateWebhook 不存在的 ID 应返回 false', async () => {
      expect(await store.updateWebhook('nonexistent', { url: 'x' })).toBe(false);
    });

    it('deleteWebhook 应删除指定 webhook', async () => {
      await store.createWebhook(makeWebhook('wh1'));
      await store.createWebhook(makeWebhook('wh2'));

      const deleted = await store.deleteWebhook('wh1');
      expect(deleted).toBe(true);

      expect(await store.getWebhook('wh1')).toBeNull();
      expect(await store.getWebhook('wh2')).not.toBeNull();
    });

    it('deleteWebhook 不存在的 ID 应返回 false', async () => {
      expect(await store.deleteWebhook('nonexistent')).toBe(false);
    });

    it('getActiveWebhooksForEvent 应返回活跃且订阅了指定事件的 webhook', async () => {
      await store.createWebhook(makeWebhook('wh1', { events: ['tick.completed'] as WebhookEventType[], active: true }));
      await store.createWebhook(makeWebhook('wh2', { events: ['consensus.signal'] as WebhookEventType[], active: true }));
      await store.createWebhook(makeWebhook('wh3', { events: ['tick.completed'] as WebhookEventType[], active: false }));

      const active = await store.getActiveWebhooksForEvent('tick.completed');
      expect(active.length).toBe(1);
      expect(active[0]!.id).toBe('wh1');
    });

    it('getActiveWebhooksForEvent 无匹配时应返回空数组', async () => {
      await store.createWebhook(makeWebhook('wh1', { events: ['consensus.signal'] as WebhookEventType[] }));
      const active = await store.getActiveWebhooksForEvent('agent.spawned');
      expect(active).toEqual([]);
    });
  });

  // ════════════════════════════════════════
  // 事件持久化（v2.0）
  // ════════════════════════════════════════

  describe('事件持久化', () => {
    const makeEvent = (id: string, overrides?: Partial<TickEventSummary & { content?: string; tags?: string[]; sourceId?: string }>): TickEventSummary => ({
      id,
      title: overrides?.title ?? `Event ${id}`,
      category: overrides?.category ?? 'general',
      importance: overrides?.importance ?? 0.5,
      ...overrides,
    });

    it('saveEvents 后应能通过 getEventsByTick 读取', async () => {
      const events = [
        makeEvent('e1', { title: '比特币大涨', category: 'finance', importance: 0.9 }),
        makeEvent('e2', { title: 'AI 政策发布', category: 'politics', importance: 0.7 }),
      ];
      await store.saveEvents(events, 1);

      const loaded = await store.getEventsByTick(1);
      expect(loaded.length).toBe(2);
      // 按 importance 降序
      expect(loaded[0]!.title).toBe('比特币大涨');
      expect(loaded[0]!.importance).toBe(0.9);
      expect(loaded[1]!.title).toBe('AI 政策发布');
    });

    it('saveEvents 应正确保存含 content/tags/sourceId 的事件', async () => {
      const events = [
        makeEvent('e1', {
          title: '测试事件',
          content: '详细内容',
          tags: ['tag1', 'tag2'],
          sourceId: 'src-1',
        }),
      ];
      await store.saveEvents(events, 1);

      const loaded = await store.getEventsByTick(1);
      expect(loaded.length).toBe(1);
      expect(loaded[0]!.id).toBe('e1');
      expect(loaded[0]!.title).toBe('测试事件');
    });

    it('saveEvents 使用 INSERT OR IGNORE 应不覆盖已有事件', async () => {
      await store.saveEvents([makeEvent('e1', { title: '原始' })], 1);
      await store.saveEvents([makeEvent('e1', { title: '重复' })], 1);

      const loaded = await store.getEventsByTick(1);
      expect(loaded.length).toBe(1);
      expect(loaded[0]!.title).toBe('原始');
    });

    it('getEventsByTick 查询不存在的 tick 应返回空数组', async () => {
      expect(await store.getEventsByTick(999)).toEqual([]);
    });

    it('saveEvents 空数组应不报错', async () => {
      await store.saveEvents([], 1);
      expect(await store.getEventsByTick(1)).toEqual([]);
    });

    it('getEventsByTick 应能区分不同 tick 的事件', async () => {
      await store.saveEvents([makeEvent('e1')], 1);
      await store.saveEvents([makeEvent('e2')], 2);
      await store.saveEvents([makeEvent('e3')], 2);

      expect((await store.getEventsByTick(1)).length).toBe(1);
      expect((await store.getEventsByTick(2)).length).toBe(2);
    });

    it('searchEvents 应按标题模糊匹配', async () => {
      await store.saveEvents([
        makeEvent('e1', { title: '比特币价格暴涨' }),
        makeEvent('e2', { title: '以太坊升级完成' }),
        makeEvent('e3', { title: '比特币挖矿难度上升' }),
      ], 1);

      const results = await store.searchEvents('比特币');
      expect(results.length).toBe(2);
    });

    it('searchEvents 应遵守 limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.saveEvents([makeEvent(`e${i}`, { title: `相同关键词-${i}` })], i);
      }
      const results = await store.searchEvents('相同关键词', 3);
      expect(results.length).toBe(3);
    });

    it('searchEvents 无匹配时应返回空数组', async () => {
      await store.saveEvents([makeEvent('e1', { title: '没有关键词' })], 1);
      expect(await store.searchEvents('不存在')).toEqual([]);
    });

    it('searchEvents 默认 limit 为 20', async () => {
      for (let i = 0; i < 30; i++) {
        await store.saveEvents([makeEvent(`e${i}`, { title: `关键词-${i}` })], i);
      }
      const results = await store.searchEvents('关键词');
      expect(results.length).toBe(20);
    });
  });

  // ════════════════════════════════════════
  // Agent 响应持久化（v2.0）
  // ════════════════════════════════════════

  describe('Agent 响应持久化', () => {
    const makeResponse = (agentId: string, overrides?: Partial<TickResponseSummary & { eventId?: string; reasoning?: string }>): TickResponseSummary => ({
      agentId,
      agentName: overrides?.agentName ?? `Agent-${agentId}`,
      opinion: overrides?.opinion ?? '看涨',
      action: overrides?.action ?? 'buy',
      emotionalState: overrides?.emotionalState ?? 0.5,
      ...overrides,
    });

    it('saveResponses 后应能通过 getResponsesByTick 读取', async () => {
      const responses = [
        makeResponse('a1', { opinion: '看涨比特币', emotionalState: 0.8 }),
        makeResponse('a2', { opinion: '看跌市场', emotionalState: -0.5 }),
      ];
      await store.saveResponses(responses, 1);

      const loaded = await store.getResponsesByTick(1);
      expect(loaded.length).toBe(2);
      expect(loaded[0]!.agentId).toBe('a1');
      expect(loaded[0]!.opinion).toBe('看涨比特币');
      expect(loaded[1]!.agentId).toBe('a2');
      expect(loaded[1]!.opinion).toBe('看跌市场');
    });

    it('saveResponses 应正确计算 sentiment', async () => {
      const responses = [
        makeResponse('a1', { emotionalState: 0.5 }),  // bullish (>0.2)
        makeResponse('a2', { emotionalState: -0.5 }), // bearish (<-0.2)
        makeResponse('a3', { emotionalState: 0.0 }),   // neutral
        makeResponse('a4', { emotionalState: 0.2 }),   // neutral (=0.2, not >0.2)
        makeResponse('a5', { emotionalState: -0.2 }),  // neutral (=-0.2, not <-0.2)
      ];
      await store.saveResponses(responses, 1);

      const loaded = await store.getResponsesByTick(1);
      expect(loaded.length).toBe(5);
    });

    it('saveResponses 应保存 eventId 和 reasoning', async () => {
      const responses = [
        makeResponse('a1', { eventId: 'e1', reasoning: '技术分析看涨' }),
      ];
      await store.saveResponses(responses, 1);

      // 使用 getResponsesByEvent 验证 eventId 关联
      const byEvent = await store.getResponsesByEvent('e1');
      expect(byEvent.length).toBe(1);
      expect(byEvent[0]!.agentId).toBe('a1');
    });

    it('getResponsesByTick 查询不存在的 tick 应返回空数组', async () => {
      expect(await store.getResponsesByTick(999)).toEqual([]);
    });

    it('getResponsesByEvent 查询不存在的 eventId 应返回空数组', async () => {
      expect(await store.getResponsesByEvent('nonexistent')).toEqual([]);
    });

    it('saveResponses 空数组应不报错', async () => {
      await store.saveResponses([], 1);
      expect(await store.getResponsesByTick(1)).toEqual([]);
    });

    it('getResponsesByTick 应能区分不同 tick 的响应', async () => {
      await store.saveResponses([makeResponse('a1')], 1);
      await store.saveResponses([makeResponse('a2'), makeResponse('a3')], 2);

      expect((await store.getResponsesByTick(1)).length).toBe(1);
      expect((await store.getResponsesByTick(2)).length).toBe(2);
    });

    it('getResponsesByEvent 应按 eventId 过滤', async () => {
      await store.saveResponses([
        makeResponse('a1', { eventId: 'e1' }),
        makeResponse('a2', { eventId: 'e2' }),
        makeResponse('a3', { eventId: 'e1' }),
      ], 1);

      const e1Responses = await store.getResponsesByEvent('e1');
      expect(e1Responses.length).toBe(2);

      const e2Responses = await store.getResponsesByEvent('e2');
      expect(e2Responses.length).toBe(1);
    });

    it('saveResponses 应正确映射 camelCase 字段', async () => {
      await store.saveResponses([
        makeResponse('a1', {
          agentName: 'TestAgent',
          opinion: '中性观点',
          action: 'hold',
          emotionalState: 0.1,
        }),
      ], 1);

      const loaded = await store.getResponsesByTick(1);
      expect(loaded[0]!.agentName).toBe('TestAgent');
      expect(loaded[0]!.opinion).toBe('中性观点');
      expect(loaded[0]!.action).toBe('hold');
      expect(loaded[0]!.emotionalState).toBe(0.1);
    });
  });

  // ════════════════════════════════════════
  // RSS 数据源持久化（v2.0）
  // ════════════════════════════════════════

  describe('RSS 数据源持久化', () => {
    const makeFeedSource = (id: string, overrides?: Partial<FeedSource>): FeedSource => ({
      id,
      name: overrides?.name ?? `Feed ${id}`,
      url: overrides?.url ?? `https://example.com/rss/${id}`,
      category: overrides?.category ?? 'general',
      tags: overrides?.tags ?? ['tag1'],
      pollIntervalMs: overrides?.pollIntervalMs ?? 300_000,
      enabled: overrides?.enabled ?? true,
    });

    it('loadRssSources 初始应为空', async () => {
      expect(await store.loadRssSources()).toEqual([]);
    });

    it('saveRssSource 后应能通过 loadRssSources 读取', async () => {
      await store.saveRssSource(makeFeedSource('rss1', {
        name: 'CoinDesk',
        url: 'https://feeds.coindesk.com/rss',
        category: 'finance',
        tags: ['crypto', 'bitcoin'],
      }));

      const sources = await store.loadRssSources();
      expect(sources.length).toBe(1);
      expect(sources[0]!.id).toBe('rss1');
      expect(sources[0]!.name).toBe('CoinDesk');
      expect(sources[0]!.url).toBe('https://feeds.coindesk.com/rss');
      expect(sources[0]!.category).toBe('finance');
      expect(sources[0]!.tags).toEqual(['crypto', 'bitcoin']);
      expect(sources[0]!.pollIntervalMs).toBe(300_000);
      expect(sources[0]!.enabled).toBe(true);
    });

    it('getRssSource 应按 ID 查找单个数据源', async () => {
      await store.saveRssSource(makeFeedSource('rss1'));
      await store.saveRssSource(makeFeedSource('rss2'));

      const source = await store.getRssSource('rss1');
      expect(source).not.toBeNull();
      expect(source!.id).toBe('rss1');
    });

    it('getRssSource 不存在的 ID 应返回 null', async () => {
      expect(await store.getRssSource('nonexistent')).toBeNull();
    });

    it('saveRssSource 相同 ID 应覆盖（INSERT OR REPLACE）', async () => {
      await store.saveRssSource(makeFeedSource('rss1', { name: '旧名称' }));
      await store.saveRssSource(makeFeedSource('rss1', { name: '新名称' }));

      const sources = await store.loadRssSources();
      expect(sources.length).toBe(1);
      expect(sources[0]!.name).toBe('新名称');
    });

    it('saveRssSources 应批量保存', async () => {
      const sources = [
        makeFeedSource('rss1'),
        makeFeedSource('rss2'),
        makeFeedSource('rss3'),
      ];
      await store.saveRssSources(sources);

      const loaded = await store.loadRssSources();
      expect(loaded.length).toBe(3);
    });

    it('deleteRssSource 应删除指定数据源', async () => {
      await store.saveRssSource(makeFeedSource('rss1'));
      await store.saveRssSource(makeFeedSource('rss2'));

      const deleted = await store.deleteRssSource('rss1');
      expect(deleted).toBe(true);

      expect(await store.getRssSource('rss1')).toBeNull();
      expect(await store.getRssSource('rss2')).not.toBeNull();
    });

    it('deleteRssSource 不存在的 ID 应返回 false', async () => {
      expect(await store.deleteRssSource('nonexistent')).toBe(false);
    });

    it('saveRssSource 应支持 tags 为 undefined', async () => {
      await store.saveRssSource({
        id: 'rss1',
        name: 'Test',
        url: 'https://example.com',
        category: 'general',
      } as FeedSource);

      const source = await store.getRssSource('rss1');
      expect(source).not.toBeNull();
      expect(source!.tags).toEqual([]);
    });

    it('saveRssSource 应支持 enabled 为 false', async () => {
      await store.saveRssSource(makeFeedSource('rss1', { enabled: false }));

      const source = await store.getRssSource('rss1');
      expect(source!.enabled).toBe(false);
    });
  });

  // ════════════════════════════════════════
  // API Key 管理（v2.0）
  // ════════════════════════════════════════

  describe('API Key 管理', () => {
    const makeApiKeyEntry = (id: string, overrides?: Partial<ApiKeyEntry>): ApiKeyEntry => ({
      id,
      name: overrides?.name ?? `Key ${id}`,
      keyHash: overrides?.keyHash ?? `hash-${id}`,
      permissions: overrides?.permissions ?? ['read', 'write'],
      rateLimit: overrides?.rateLimit ?? 100,
    });

    it('getApiKeys 初始应为空', async () => {
      expect(await store.getApiKeys()).toEqual([]);
    });

    it('createApiKey 后应能通过 getApiKeys 读取', async () => {
      await store.createApiKey(makeApiKeyEntry('k1', {
        name: 'Admin Key',
        permissions: ['read', 'write', 'admin'],
        rateLimit: 200,
      }));

      const keys = await store.getApiKeys();
      expect(keys.length).toBe(1);
      expect(keys[0]!.id).toBe('k1');
      expect(keys[0]!.name).toBe('Admin Key');
      expect(keys[0]!.keyHash).toBe('hash-k1');
      expect(keys[0]!.permissions).toEqual(['read', 'write', 'admin']);
      expect(keys[0]!.rateLimit).toBe(200);
      expect(keys[0]!.active).toBe(true);
      expect(keys[0]!.lastUsedAt).toBeNull();
      expect(keys[0]!.createdAt).toBeGreaterThan(0);
    });

    it('getApiKeyByHash 应通过 hash 查找活跃的 key', async () => {
      await store.createApiKey(makeApiKeyEntry('k1'));

      const key = await store.getApiKeyByHash('hash-k1');
      expect(key).not.toBeNull();
      expect(key!.id).toBe('k1');
    });

    it('getApiKeyByHash 不存在的 hash 应返回 null', async () => {
      expect(await store.getApiKeyByHash('nonexistent')).toBeNull();
    });

    it('touchApiKey 应更新 last_used_at 时间戳', async () => {
      await store.createApiKey(makeApiKeyEntry('k1'));

      // 初始 lastUsedAt 应为 null
      let key = await store.getApiKeyByHash('hash-k1');
      expect(key!.lastUsedAt).toBeNull();

      // touch 后应有值
      await store.touchApiKey('k1');
      key = await store.getApiKeyByHash('hash-k1');
      expect(key!.lastUsedAt).not.toBeNull();
      expect(key!.lastUsedAt).toBeGreaterThan(0);
    });

    it('deleteApiKey 应删除指定 key', async () => {
      await store.createApiKey(makeApiKeyEntry('k1'));
      await store.createApiKey(makeApiKeyEntry('k2'));

      const deleted = await store.deleteApiKey('k1');
      expect(deleted).toBe(true);

      const keys = await store.getApiKeys();
      expect(keys.length).toBe(1);
      expect(keys[0]!.id).toBe('k2');
    });

    it('deleteApiKey 不存在的 ID 应返回 false', async () => {
      expect(await store.deleteApiKey('nonexistent')).toBe(false);
    });

    it('多个 API Key 应互不影响', async () => {
      await store.createApiKey(makeApiKeyEntry('k1', { name: 'Key1', keyHash: 'hash1' }));
      await store.createApiKey(makeApiKeyEntry('k2', { name: 'Key2', keyHash: 'hash2' }));
      await store.createApiKey(makeApiKeyEntry('k3', { name: 'Key3', keyHash: 'hash3' }));

      const keys = await store.getApiKeys();
      expect(keys.length).toBe(3);

      expect((await store.getApiKeyByHash('hash1'))!.name).toBe('Key1');
      expect((await store.getApiKeyByHash('hash2'))!.name).toBe('Key2');
      expect((await store.getApiKeyByHash('hash3'))!.name).toBe('Key3');
    });

    it('deleteApiKey 后 getApiKeyByHash 应返回 null', async () => {
      await store.createApiKey(makeApiKeyEntry('k1'));
      await store.deleteApiKey('k1');

      expect(await store.getApiKeyByHash('hash-k1')).toBeNull();
    });
  });

  // ════════════════════════════════════════
  // getActiveApiKeyHashes（v2.0）
  // ════════════════════════════════════════

  describe('getActiveApiKeyHashes', () => {
    const makeApiKeyEntry = (id: string, overrides?: Partial<{ keyHash: string; name: string }>): ApiKeyEntry => ({
      id,
      name: overrides?.name ?? `Key ${id}`,
      keyHash: overrides?.keyHash ?? `hash-${id}`,
      permissions: ['read'],
      rateLimit: 100,
    });

    it('无 API Key 时应返回空 Set', async () => {
      const hashes = await store.getActiveApiKeyHashes();
      expect(hashes.size).toBe(0);
    });

    it('应返回所有活跃 key 的哈希集合', async () => {
      await store.createApiKey(makeApiKeyEntry('k1', { keyHash: 'hash-aaa' }));
      await store.createApiKey(makeApiKeyEntry('k2', { keyHash: 'hash-bbb' }));

      const hashes = await store.getActiveApiKeyHashes();
      expect(hashes.has('hash-aaa')).toBe(true);
      expect(hashes.has('hash-bbb')).toBe(true);
      expect(hashes.size).toBe(2);
    });

    it('删除 key 后 hashes 集合应缩减', async () => {
      await store.createApiKey(makeApiKeyEntry('k1'));
      await store.createApiKey(makeApiKeyEntry('k2'));
      await store.deleteApiKey('k1');

      const hashes = await store.getActiveApiKeyHashes();
      expect(hashes.has('hash-k1')).toBe(false);
      expect(hashes.has('hash-k2')).toBe(true);
    });
  });

  // ════════════════════════════════════════
  // Social Graph（v2.1）
  // ════════════════════════════════════════

  describe('Social Graph 持久化', () => {
    const makeSocialEdge = (from: string, to: string, overrides?: Partial<{ type: string; strength: number; formedAtTick: number }>) => ({
      from,
      to,
      type: (overrides?.type ?? 'follow') as 'follow' | 'trust' | 'rival',
      strength: overrides?.strength ?? 0.5,
      formedAtTick: overrides?.formedAtTick ?? 1,
    });

    const makeSocialNode = (agentId: string, overrides?: Partial<{ influence: number; community: string; role: string }>) => ({
      agentId,
      influence: overrides?.influence ?? 0.5,
      community: overrides?.community ?? 'default',
      role: (overrides?.role ?? 'follower') as 'hub' | 'follower' | 'bridge' | 'isolate',
    });

    it('loadSocialEdges 初始应为空', async () => {
      expect(await store.loadSocialEdges()).toEqual([]);
    });

    it('saveSocialEdges 后应能通过 loadSocialEdges 读取', async () => {
      const edges = [
        makeSocialEdge('a1', 'a2'),
        makeSocialEdge('a2', 'a3', { type: 'trust', strength: 0.9 }),
      ];
      await store.saveSocialEdges(edges);

      const loaded = await store.loadSocialEdges();
      expect(loaded.length).toBe(2);
    });

    it('saveSocialEdges 应全量覆盖（先清空再插入）', async () => {
      await store.saveSocialEdges([makeSocialEdge('a1', 'a2')]);
      // 全量替换为新数据
      await store.saveSocialEdges([
        makeSocialEdge('b1', 'b2'),
        makeSocialEdge('b2', 'b3'),
      ]);

      const loaded = await store.loadSocialEdges();
      expect(loaded.length).toBe(2);
      const fromIds = loaded.map(e => e.from);
      expect(fromIds).toContain('b1');
      expect(fromIds).toContain('b2');
      expect(fromIds).not.toContain('a1');
    });

    it('saveSocialEdges 空数组应清空所有边', async () => {
      await store.saveSocialEdges([makeSocialEdge('a1', 'a2')]);
      await store.saveSocialEdges([]);

      expect(await store.loadSocialEdges()).toEqual([]);
    });

    it('loadSocialEdges 应正确映射字段', async () => {
      await store.saveSocialEdges([makeSocialEdge('a1', 'a2', { type: 'rival', strength: 0.3, formedAtTick: 5 })]);

      const loaded = await store.loadSocialEdges();
      const edge = loaded[0]!;
      expect(edge.from).toBe('a1');
      expect(edge.to).toBe('a2');
      expect(edge.type).toBe('rival');
      expect(edge.strength).toBe(0.3);
      expect(edge.formedAtTick).toBe(5);
    });

    it('loadSocialNodes 初始应为空', async () => {
      expect(await store.loadSocialNodes()).toEqual([]);
    });

    it('saveSocialNodes 后应能通过 loadSocialNodes 读取', async () => {
      const nodes = [
        makeSocialNode('a1', { influence: 0.9, community: 'crypto', role: 'hub' }),
        makeSocialNode('a2', { influence: 0.3, community: 'general', role: 'isolate' }),
      ];
      await store.saveSocialNodes(nodes);

      const loaded = await store.loadSocialNodes();
      expect(loaded.length).toBe(2);
    });

    it('saveSocialNodes 应全量覆盖，正确映射字段', async () => {
      await store.saveSocialNodes([makeSocialNode('a1')]);
      await store.saveSocialNodes([
        makeSocialNode('b1', { influence: 0.8, community: 'finance', role: 'bridge' }),
      ]);

      const loaded = await store.loadSocialNodes();
      expect(loaded.length).toBe(1);
      const node = loaded[0]!;
      expect(node.agentId).toBe('b1');
      expect(node.influence).toBe(0.8);
      expect(node.community).toBe('finance');
      expect(node.role).toBe('bridge');
    });

    it('saveSocialNodes 空数组应清空所有节点', async () => {
      await store.saveSocialNodes([makeSocialNode('a1')]);
      await store.saveSocialNodes([]);

      expect(await store.loadSocialNodes()).toEqual([]);
    });
  });

  // ════════════════════════════════════════
  // 信号高级查询（Phase 2.2）
  // ════════════════════════════════════════

  describe('高级信号查询', () => {
    const makeSignal = (tick: number, topic: string): import('@beeclaw/shared').ConsensusSignal => ({ // eslint-disable-line @typescript-eslint/consistent-type-imports
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

    it('getDistinctTopics 应返回不重复的 topic 列表', async () => {
      await store.saveConsensusSignal(makeSignal(1, '股市'));
      await store.saveConsensusSignal(makeSignal(2, '科技'));
      await store.saveConsensusSignal(makeSignal(3, '股市'));

      const topics = await store.getDistinctTopics();
      expect(topics.length).toBe(2);
      expect(topics).toContain('股市');
      expect(topics).toContain('科技');
    });

    it('getDistinctTopics 无信号时应返回空数组', async () => {
      expect(await store.getDistinctTopics()).toEqual([]);
    });

    it('getSignalCountByTopic 应返回正确计数', async () => {
      await store.saveConsensusSignal(makeSignal(1, '股市'));
      await store.saveConsensusSignal(makeSignal(2, '股市'));
      await store.saveConsensusSignal(makeSignal(3, '科技'));

      expect(await store.getSignalCountByTopic('股市')).toBe(2);
      expect(await store.getSignalCountByTopic('科技')).toBe(1);
      expect(await store.getSignalCountByTopic('不存在')).toBe(0);
    });

    it('getSignalsByTickRange 应按 tick 范围过滤', async () => {
      for (let i = 1; i <= 10; i++) {
        await store.saveConsensusSignal(makeSignal(i, '股市'));
      }

      const signals = await store.getSignalsByTickRange('股市', 3, 6);
      expect(signals.length).toBe(4);
      for (const s of signals) {
        expect(s.tick).toBeGreaterThanOrEqual(3);
        expect(s.tick).toBeLessThanOrEqual(6);
      }
    });

    it('getSignalsByTickRange 结果应按 tick 升序', async () => {
      await store.saveConsensusSignal(makeSignal(3, '股市'));
      await store.saveConsensusSignal(makeSignal(1, '股市'));
      await store.saveConsensusSignal(makeSignal(2, '股市'));

      const signals = await store.getSignalsByTickRange('股市', 1, 3);
      expect(signals[0]!.tick).toBe(1);
      expect(signals[1]!.tick).toBe(2);
      expect(signals[2]!.tick).toBe(3);
    });

    it('getSignalsByTickRange 无匹配时应返回空数组', async () => {
      await store.saveConsensusSignal(makeSignal(10, '股市'));
      const signals = await store.getSignalsByTickRange('股市', 1, 5);
      expect(signals).toEqual([]);
    });

    it('getSignalsByTickRange 起止 tick 相同时应包含边界值', async () => {
      await store.saveConsensusSignal(makeSignal(4, '股市'));
      await store.saveConsensusSignal(makeSignal(5, '股市'));
      await store.saveConsensusSignal(makeSignal(6, '股市'));

      const signals = await store.getSignalsByTickRange('股市', 5, 5);
      expect(signals.map(signal => signal.tick)).toEqual([5]);
    });

    it('getSignalsByTickRange 起始 tick 大于结束 tick 时应返回空数组', async () => {
      await store.saveConsensusSignal(makeSignal(5, '股市'));
      const signals = await store.getSignalsByTickRange('股市', 6, 4);
      expect(signals).toEqual([]);
    });

    it('getLatestSignalPerTopic 应每个 topic 只返回最新信号', async () => {
      await store.saveConsensusSignal(makeSignal(1, '股市'));
      await store.saveConsensusSignal(makeSignal(5, '股市'));
      await store.saveConsensusSignal(makeSignal(3, '科技'));
      await store.saveConsensusSignal(makeSignal(7, '科技'));

      const signals = await store.getLatestSignalPerTopic();
      expect(signals.length).toBe(2);

      const stockSignal = signals.find(s => s.topic === '股市');
      const techSignal = signals.find(s => s.topic === '科技');
      expect(stockSignal?.tick).toBe(5); // 最新的是 tick=5
      expect(techSignal?.tick).toBe(7);  // 最新的是 tick=7
    });

    it('getLatestSignalPerTopic 无信号时应返回空数组', async () => {
      expect(await store.getLatestSignalPerTopic()).toEqual([]);
    });

    it('getLatestSignalPerTopic 应基于最新插入记录而不是最大 tick 返回结果', async () => {
      await store.saveConsensusSignal(makeSignal(10, '股市'));
      await store.saveConsensusSignal(makeSignal(8, '股市'));

      const signals = await store.getLatestSignalPerTopic();
      expect(signals).toHaveLength(1);
      expect(signals[0]?.topic).toBe('股市');
      expect(signals[0]?.tick).toBe(8);
    });
  });

  // ════════════════════════════════════════
  // saveDirtyAgents（增量保存）
  // ════════════════════════════════════════

  describe('saveDirtyAgents', () => {
    function createMockAgent(id: string, name: string, influence = 50) {
      return {
        id,
        name,
        toData: () => ({
          id,
          name,
          persona: { background: 'test', profession: 'tester', traits: {}, expertise: [], biases: [], communicationStyle: 'formal' },
          memory: { shortTerm: [], longTerm: [], opinions: {}, predictions: [] },
          relationships: [],
          followers: [],
          following: [],
          influence,
          credibility: 0.8,
          status: 'active' as const,
          modelTier: 'cheap' as const,
          spawnedAtTick: 0,
          lastActiveTick: 5,
          modelId: 'cheap-default',
        }),
      } as any;
    }

    it('传入空数组时应不操作（返回 undefined）', async () => {
      // saveDirtyAgents([]) 应无副作用
      await store.saveDirtyAgents([]);
      expect(await store.loadAgentRows()).toEqual([]);
    });

    it('传入非空数组时应保存 agents', async () => {
      const agents = [
        createMockAgent('a1', 'Agent1'),
        createMockAgent('a2', 'Agent2'),
      ];
      await store.saveDirtyAgents(agents);

      const rows = await store.loadAgentRows();
      expect(rows.length).toBe(2);
    });
  });
});
