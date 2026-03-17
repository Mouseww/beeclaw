// ============================================================================
// @beeclaw/server — persistence/postgres-adapter 单元测试
// 通过 vitest mock pg.Pool 验证 SQL 和参数映射
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostgresAdapter } from './postgres-adapter.js';
import type { ConsensusSignal, LLMConfig, ModelRouterConfig, WebhookSubscription, WebhookEventType } from '@beeclaw/shared';
import type { TickResult, TickEventSummary, TickResponseSummary } from '@beeclaw/world-engine';
import type { FeedSource } from '@beeclaw/event-ingestion';
import type { ApiKeyEntry } from './store.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock pg.Pool ──

function createMockPool() {
  const queryResults: Map<string, { rows: Record<string, unknown>[]; rowCount: number }> = new Map();
  const queryCalls: Array<{ text: string; values?: unknown[] }> = [];

  const mockClient = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queryCalls.push({ text, values });
      // 查找匹配的前缀结果
      for (const [prefix, result] of queryResults.entries()) {
        if (text.startsWith(prefix)) return result;
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queryCalls.push({ text, values });
      for (const [prefix, result] of queryResults.entries()) {
        if (text.startsWith(prefix)) return result;
      }
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => mockClient),
  } as any;

  return {
    pool,
    mockClient,
    queryCalls,
    queryResults,
    setResult(prefix: string, rows: Record<string, unknown>[], rowCount?: number) {
      queryResults.set(prefix, { rows, rowCount: rowCount ?? rows.length });
    },
    clearCalls() {
      queryCalls.length = 0;
      pool.query.mockClear();
      mockClient.query.mockClear();
    },
  };
}

describe('PostgresAdapter', () => {
  let mock: ReturnType<typeof createMockPool>;
  let adapter: PostgresAdapter;

  beforeEach(() => {
    mock = createMockPool();
    adapter = new PostgresAdapter(mock.pool);
  });

  // ════════════════════════════════════════
  // ensureSchema
  // ════════════════════════════════════════

  describe('ensureSchema', () => {
    it('应执行建表 DDL', async () => {
      await adapter.ensureSchema();
      expect(mock.pool.query).toHaveBeenCalledTimes(1);
      const sql = mock.pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS world_state');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS agents');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS tick_history');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS consensus_signals');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS llm_config');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS webhook_subscriptions');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS events');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_responses');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS rss_sources');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS api_keys');
    });

    it('DDL 应使用 JSONB 类型', async () => {
      await adapter.ensureSchema();
      const sql = mock.pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('JSONB');
    });

    it('DDL 应使用 BIGSERIAL 作为 consensus_signals 主键', async () => {
      await adapter.ensureSchema();
      const sql = mock.pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('BIGSERIAL PRIMARY KEY');
    });

    it('DDL 应使用 BOOLEAN 而非 INTEGER 作为 active 字段', async () => {
      await adapter.ensureSchema();
      const sql = mock.pool.query.mock.calls[0][0] as string;
      // webhook_subscriptions, rss_sources, api_keys 都应使用 BOOLEAN
      expect(sql).toContain('BOOLEAN NOT NULL DEFAULT TRUE');
    });
  });

  // ════════════════════════════════════════
  // 世界状态 KV
  // ════════════════════════════════════════

  describe('getState / setState', () => {
    it('getState 不存在的 key 应返回 undefined', async () => {
      const result = await adapter.getState('nonexistent');
      expect(result).toBeUndefined();
      expect(mock.pool.query).toHaveBeenCalledWith(
        'SELECT value FROM world_state WHERE key = $1',
        ['nonexistent']
      );
    });

    it('getState 存在的 key 应返回 value', async () => {
      mock.setResult('SELECT value FROM world_state', [{ value: 'hello' }]);
      const result = await adapter.getState('mykey');
      expect(result).toBe('hello');
    });

    it('setState 应使用 ON CONFLICT UPSERT', async () => {
      await adapter.setState('key1', 'value1');
      expect(mock.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (key) DO UPDATE'),
        ['key1', 'value1']
      );
    });
  });

  describe('getTick / setTick', () => {
    it('getTick 无记录时应返回 0', async () => {
      const tick = await adapter.getTick();
      expect(tick).toBe(0);
    });

    it('getTick 有记录时应返回解析后的数字', async () => {
      mock.setResult('SELECT value FROM world_state', [{ value: '42' }]);
      const tick = await adapter.getTick();
      expect(tick).toBe(42);
    });

    it('setTick 应将数字转为字符串存储', async () => {
      await adapter.setTick(100);
      expect(mock.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        ['tick', '100']
      );
    });
  });

  // ════════════════════════════════════════
  // Agents
  // ════════════════════════════════════════

  describe('Agent 操作', () => {
    function createMockAgent(id: string, name: string) {
      return {
        id,
        name,
        toData: () => ({
          id,
          name,
          persona: { background: 'test', profession: 'tester' },
          memory: { shortTerm: [], longTerm: [] },
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

    it('saveAgent 应使用参数化查询 $1-$12', async () => {
      await adapter.saveAgent(createMockAgent('a1', 'Agent1'));
      expect(mock.pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('$1');
      expect(sql).toContain('$12');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
      expect(params).toHaveLength(12);
      expect(params[0]).toBe('a1');
      expect(params[1]).toBe('Agent1');
      // persona 应被 JSON.stringify
      expect(typeof params[2]).toBe('string');
      expect(JSON.parse(params[2] as string)).toHaveProperty('profession', 'tester');
    });

    it('saveAgents 应使用事务', async () => {
      const agents = [createMockAgent('a1', 'Agent1'), createMockAgent('a2', 'Agent2')];
      await adapter.saveAgents(agents);

      // BEGIN + 2 inserts + COMMIT = 4 calls on client
      expect(mock.mockClient.query).toHaveBeenCalledTimes(4);
      expect(mock.mockClient.query.mock.calls[0][0]).toBe('BEGIN');
      expect(mock.mockClient.query.mock.calls[3][0]).toBe('COMMIT');
      expect(mock.mockClient.release).toHaveBeenCalled();
    });

    it('saveAgents 空数组应不执行事务', async () => {
      await adapter.saveAgents([]);
      expect(mock.pool.connect).not.toHaveBeenCalled();
    });

    it('loadAgentRows 应返回映射后的 AgentRow', async () => {
      mock.setResult('SELECT * FROM agents', [
        {
          id: 'a1',
          name: 'Agent1',
          persona: { background: 'test' },
          memory: { shortTerm: [] },
          followers: ['f1'],
          following: [],
          influence: 50,
          credibility: 0.8,
          status: 'active',
          model_tier: 'cheap',
          spawned_at_tick: 0,
          last_active_tick: 5,
          updated_at: 1700000000,
        },
      ]);

      const rows = await adapter.loadAgentRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe('a1');
      // jsonb 对象应被序列化为字符串
      expect(typeof rows[0]!.persona).toBe('string');
      expect(JSON.parse(rows[0]!.persona)).toHaveProperty('background', 'test');
      expect(rows[0]!.influence).toBe(50);
    });

    it('getAgentRow 不存在的 ID 应返回 undefined', async () => {
      const row = await adapter.getAgentRow('nonexistent');
      expect(row).toBeUndefined();
    });

    it('getAgentRows 应使用 LIMIT/OFFSET 分页', async () => {
      mock.setResult('SELECT COUNT', [{ cnt: '10' }]);
      mock.setResult('SELECT * FROM agents ORDER', []);

      const result = await adapter.getAgentRows(2, 3);
      expect(result.total).toBe(10);

      // 验证 OFFSET 计算: (page-1) * size = (2-1)*3 = 3
      const limitCall = mock.pool.query.mock.calls.find(
        (c: any) => (c[0] as string).includes('OFFSET')
      );
      expect(limitCall).toBeDefined();
      expect(limitCall![1]).toEqual([3, 3]); // [size, offset]
    });
  });

  // ════════════════════════════════════════
  // Tick History
  // ════════════════════════════════════════

  describe('Tick 历史', () => {
    it('saveTickResult 应使用 ON CONFLICT UPSERT', async () => {
      const result: TickResult = {
        tick: 1,
        eventsProcessed: 2,
        agentsActivated: 3,
        responsesCollected: 4,
        newAgentsSpawned: 0,
        signals: 1,
        durationMs: 100,
      };
      await adapter.saveTickResult(result);

      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('ON CONFLICT (tick) DO UPDATE');
      expect(params).toEqual([1, 2, 3, 4, 0, 1, 100]);
    });

    it('getTickHistory 应返回 camelCase 字段映射', async () => {
      mock.setResult('SELECT * FROM tick_history', [
        {
          tick: 1,
          events_processed: 2,
          agents_activated: 3,
          responses_collected: 4,
          new_agents_spawned: 0,
          signals: 1,
          duration_ms: 100,
          created_at: 1700000000,
        },
      ]);

      const history = await adapter.getTickHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0]!.tick).toBe(1);
      expect(history[0]!.eventsProcessed).toBe(2);
      expect(history[0]!.agentsActivated).toBe(3);
      expect(history[0]!.responsesCollected).toBe(4);
      expect(history[0]!.newAgentsSpawned).toBe(0);
      expect(history[0]!.durationMs).toBe(100);
      expect(history[0]!.timestamp).toBeDefined();
    });

    it('getTickHistory 默认 limit 为 50', async () => {
      await adapter.getTickHistory();
      const call = mock.pool.query.mock.calls[0];
      expect(call[1]).toEqual([50]);
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

    it('saveConsensusSignal 应使用 $1-$3 参数化查询', async () => {
      const signal = makeSignal(1, '股市');
      await adapter.saveConsensusSignal(signal);

      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('$1');
      expect(sql).toContain('$3');
      expect(params![0]).toBe(1);
      expect(params![1]).toBe('股市');
      expect(typeof params![2]).toBe('string');
    });

    it('getLatestSignals 应正确解析 jsonb data 字段', async () => {
      const signal = makeSignal(1, '科技');
      // pg 自动解析 jsonb 为对象
      mock.setResult('SELECT data FROM consensus_signals ORDER BY id DESC', [
        { data: signal },
      ]);

      const signals = await adapter.getLatestSignals(10);
      expect(signals).toHaveLength(1);
      expect(signals[0]!.topic).toBe('科技');
      expect(signals[0]!.tick).toBe(1);
    });

    it('getLatestSignals 也应处理字符串格式的 data', async () => {
      const signal = makeSignal(2, '金融');
      mock.setResult('SELECT data FROM consensus_signals ORDER BY id DESC', [
        { data: JSON.stringify(signal) },
      ]);

      const signals = await adapter.getLatestSignals(5);
      expect(signals[0]!.topic).toBe('金融');
    });

    it('getSignalsByTopic 应使用 $1 过滤 topic', async () => {
      await adapter.getSignalsByTopic('股市', 15);
      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('WHERE topic = $1');
      expect(params).toEqual(['股市', 15]);
    });
  });

  // ════════════════════════════════════════
  // LLM 配置
  // ════════════════════════════════════════

  describe('LLM 配置', () => {
    it('saveLLMConfig 应使用 ON CONFLICT UPSERT', async () => {
      const config: LLMConfig = {
        baseURL: 'http://test',
        apiKey: 'key',
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        temperature: 0.7,
      };
      await adapter.saveLLMConfig('cheap', config);

      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('ON CONFLICT (tier) DO UPDATE');
      expect(params![0]).toBe('cheap');
      expect(params![3]).toBe('gpt-4o-mini');
      expect(params![4]).toBe(1024);
      expect(params![5]).toBe(0.7);
    });

    it('saveLLMConfig maxTokens/temperature 为 undefined 时应传 null', async () => {
      await adapter.saveLLMConfig('local', {
        baseURL: 'http://test',
        apiKey: 'key',
        model: 'llama',
      });
      const params = mock.pool.query.mock.calls[0][1];
      expect(params![4]).toBeNull();
      expect(params![5]).toBeNull();
    });

    it('saveLLMConfigs 应在事务中保存 3 个 tier', async () => {
      const configs: ModelRouterConfig = {
        local: { baseURL: 'http://l', apiKey: 'kl', model: 'llama' },
        cheap: { baseURL: 'http://c', apiKey: 'kc', model: 'mini' },
        strong: { baseURL: 'http://s', apiKey: 'ks', model: 'gpt4' },
      };
      await adapter.saveLLMConfigs(configs);

      // BEGIN + 3 inserts + COMMIT
      expect(mock.mockClient.query).toHaveBeenCalledTimes(5);
    });

    it('loadLLMConfigs 无记录时应返回 null', async () => {
      const result = await adapter.loadLLMConfigs();
      expect(result).toBeNull();
    });

    it('loadLLMConfigs 三个 tier 都有时应返回完整配置', async () => {
      mock.setResult('SELECT * FROM llm_config', [
        { tier: 'local', base_url: 'http://l', api_key: 'kl', model: 'llama', max_tokens: null, temperature: null },
        { tier: 'cheap', base_url: 'http://c', api_key: 'kc', model: 'mini', max_tokens: 1024, temperature: 0.7 },
        { tier: 'strong', base_url: 'http://s', api_key: 'ks', model: 'gpt4', max_tokens: 2048, temperature: 0.5 },
      ]);

      const result = await adapter.loadLLMConfigs();
      expect(result).not.toBeNull();
      expect(result!.local.model).toBe('llama');
      expect(result!.cheap.model).toBe('mini');
      expect(result!.strong.model).toBe('gpt4');
      expect(result!.cheap.maxTokens).toBe(1024);
      expect(result!.local.maxTokens).toBeUndefined();
    });

    it('loadLLMConfigs 缺少 tier 时应返回 null', async () => {
      mock.setResult('SELECT * FROM llm_config', [
        { tier: 'local', base_url: 'http://l', api_key: 'kl', model: 'llama', max_tokens: null, temperature: null },
        { tier: 'cheap', base_url: 'http://c', api_key: 'kc', model: 'mini', max_tokens: null, temperature: null },
      ]);

      const result = await adapter.loadLLMConfigs();
      expect(result).toBeNull();
    });

    it('loadLLMConfig 存在时应返回配置', async () => {
      mock.setResult('SELECT * FROM llm_config WHERE', [
        { tier: 'cheap', base_url: 'http://c', api_key: 'kc', model: 'mini', max_tokens: 512, temperature: 0.8 },
      ]);

      const config = await adapter.loadLLMConfig('cheap');
      expect(config).not.toBeNull();
      expect(config!.model).toBe('mini');
      expect(config!.maxTokens).toBe(512);
    });

    it('loadLLMConfig 不存在时应返回 null', async () => {
      const config = await adapter.loadLLMConfig('strong');
      expect(config).toBeNull();
    });
  });

  // ════════════════════════════════════════
  // Webhook 订阅
  // ════════════════════════════════════════

  describe('Webhook 订阅', () => {
    const makeWebhook = (id: string): WebhookSubscription => ({
      id,
      url: `https://example.com/webhook/${id}`,
      events: ['tick.completed', 'consensus.signal'] as WebhookEventType[],
      secret: `secret-${id}`,
      active: true,
      createdAt: 1700000000,
    });

    it('createWebhook 应插入记录', async () => {
      await adapter.createWebhook(makeWebhook('wh1'));
      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO webhook_subscriptions');
      expect(params![0]).toBe('wh1');
      expect(params![3]).toBe('secret-wh1');
      expect(params![4]).toBe(true);
    });

    it('getWebhooks 应映射行数据', async () => {
      mock.setResult('SELECT * FROM webhook_subscriptions ORDER', [
        {
          id: 'wh1',
          url: 'https://example.com/hook',
          events: ['tick.completed'],
          secret: 'sec',
          active: true,
          created_at: 1700000000,
        },
      ]);

      const webhooks = await adapter.getWebhooks();
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0]!.id).toBe('wh1');
      expect(webhooks[0]!.active).toBe(true);
      expect(webhooks[0]!.events).toEqual(['tick.completed']);
    });

    it('getWebhook 不存在时应返回 null', async () => {
      const wh = await adapter.getWebhook('nonexistent');
      expect(wh).toBeNull();
    });

    it('updateWebhook 不存在时应返回 false', async () => {
      const result = await adapter.updateWebhook('nonexistent', { url: 'x' });
      expect(result).toBe(false);
    });

    it('deleteWebhook 成功应返回 true', async () => {
      mock.setResult('DELETE FROM webhook_subscriptions', [], 1);
      const result = await adapter.deleteWebhook('wh1');
      expect(result).toBe(true);
    });

    it('deleteWebhook 不存在应返回 false', async () => {
      const result = await adapter.deleteWebhook('nonexistent');
      expect(result).toBe(false);
    });

    it('getActiveWebhooksForEvent 应过滤 active 和 eventType', async () => {
      mock.setResult('SELECT * FROM webhook_subscriptions WHERE', [
        {
          id: 'wh1',
          url: 'https://a.com',
          events: ['tick.completed'],
          secret: 's1',
          active: true,
          created_at: 1700000000,
        },
        {
          id: 'wh2',
          url: 'https://b.com',
          events: ['consensus.signal'],
          secret: 's2',
          active: true,
          created_at: 1700000000,
        },
      ]);

      const active = await adapter.getActiveWebhooksForEvent('tick.completed');
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe('wh1');
    });
  });

  // ════════════════════════════════════════
  // 事件持久化
  // ════════════════════════════════════════

  describe('事件持久化', () => {
    it('saveEvents 应使用事务和 ON CONFLICT DO NOTHING', async () => {
      const events: TickEventSummary[] = [
        { id: 'e1', title: '比特币', category: 'finance', importance: 0.9 },
      ];
      await adapter.saveEvents(events, 1);

      expect(mock.mockClient.query).toHaveBeenCalledTimes(3); // BEGIN + 1 insert + COMMIT
      const insertCall = mock.mockClient.query.mock.calls[1];
      expect(insertCall[0]).toContain('ON CONFLICT (id) DO NOTHING');
      expect(insertCall[1][0]).toBe('e1');
      expect(insertCall[1][1]).toBe(1);
    });

    it('saveEvents 空数组应不执行事务', async () => {
      await adapter.saveEvents([], 1);
      expect(mock.pool.connect).not.toHaveBeenCalled();
    });

    it('getEventsByTick 应返回映射后的事件摘要', async () => {
      mock.setResult('SELECT * FROM events WHERE tick', [
        { id: 'e1', title: '测试', category: 'general', importance: 0.5 },
      ]);

      const events = await adapter.getEventsByTick(1);
      expect(events).toHaveLength(1);
      expect(events[0]!.id).toBe('e1');
      expect(events[0]!.title).toBe('测试');
    });

    it('searchEvents 应使用 ILIKE 模糊匹配', async () => {
      await adapter.searchEvents('比特币', 10);
      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('ILIKE');
      expect(params).toEqual(['%比特币%', 10]);
    });
  });

  // ════════════════════════════════════════
  // Agent 响应持久化
  // ════════════════════════════════════════

  describe('Agent 响应持久化', () => {
    it('saveResponses 应正确计算 sentiment', async () => {
      const responses: TickResponseSummary[] = [
        { agentId: 'a1', agentName: 'A1', opinion: '看涨', action: 'buy', emotionalState: 0.5 },
      ];
      await adapter.saveResponses(responses, 1);

      const insertCall = mock.mockClient.query.mock.calls[1];
      expect(insertCall[1][7]).toBe('bullish'); // emotionalState > 0.2
    });

    it('saveResponses bearish sentiment', async () => {
      const responses: TickResponseSummary[] = [
        { agentId: 'a2', agentName: 'A2', opinion: '看跌', action: 'sell', emotionalState: -0.5 },
      ];
      await adapter.saveResponses(responses, 1);

      const insertCall = mock.mockClient.query.mock.calls[1];
      expect(insertCall[1][7]).toBe('bearish');
    });

    it('saveResponses neutral sentiment', async () => {
      const responses: TickResponseSummary[] = [
        { agentId: 'a3', agentName: 'A3', opinion: '中性', action: 'hold', emotionalState: 0.1 },
      ];
      await adapter.saveResponses(responses, 1);

      const insertCall = mock.mockClient.query.mock.calls[1];
      expect(insertCall[1][7]).toBe('neutral');
    });

    it('saveResponses 空数组应不执行事务', async () => {
      await adapter.saveResponses([], 1);
      expect(mock.pool.connect).not.toHaveBeenCalled();
    });

    it('getResponsesByTick 应返回映射后的响应', async () => {
      mock.setResult('SELECT * FROM agent_responses WHERE tick', [
        {
          agent_id: 'a1',
          agent_name: 'Agent1',
          opinion: '看涨',
          action: 'buy',
          emotional_state: 0.5,
        },
      ]);

      const responses = await adapter.getResponsesByTick(1);
      expect(responses).toHaveLength(1);
      expect(responses[0]!.agentId).toBe('a1');
      expect(responses[0]!.agentName).toBe('Agent1');
      expect(responses[0]!.emotionalState).toBe(0.5);
    });

    it('getResponsesByEvent 应使用 event_id 过滤', async () => {
      await adapter.getResponsesByEvent('e1');
      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('WHERE event_id = $1');
      expect(params).toEqual(['e1']);
    });
  });

  // ════════════════════════════════════════
  // RSS 数据源
  // ════════════════════════════════════════

  describe('RSS 数据源', () => {
    it('saveRssSource 应使用 ON CONFLICT UPSERT', async () => {
      const source: FeedSource = {
        id: 'rss1',
        name: 'Test Feed',
        url: 'https://example.com/rss',
        category: 'finance',
        tags: ['tag1'],
        pollIntervalMs: 300_000,
        enabled: true,
      };
      await adapter.saveRssSource(source);

      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
      expect(params![0]).toBe('rss1');
      expect(params![4]).toBe(JSON.stringify(['tag1']));
      expect(params![6]).toBe(true);
    });

    it('saveRssSources 应使用事务', async () => {
      const sources: FeedSource[] = [
        { id: 'r1', name: 'F1', url: 'http://1', category: 'general' },
        { id: 'r2', name: 'F2', url: 'http://2', category: 'tech' },
      ] as FeedSource[];
      await adapter.saveRssSources(sources);

      expect(mock.mockClient.query.mock.calls[0][0]).toBe('BEGIN');
      expect(mock.mockClient.query.mock.calls[3][0]).toBe('COMMIT');
    });

    it('saveRssSources 空数组应不执行事务', async () => {
      await adapter.saveRssSources([]);
      expect(mock.pool.connect).not.toHaveBeenCalled();
    });

    it('loadRssSources 应映射 jsonb tags 字段', async () => {
      mock.setResult('SELECT * FROM rss_sources', [
        {
          id: 'rss1',
          name: 'Test',
          url: 'http://test',
          category: 'finance',
          tags: ['tag1', 'tag2'], // pg 自动解析 jsonb 为数组
          poll_interval_ms: 300000,
          enabled: true,
        },
      ]);

      const sources = await adapter.loadRssSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.tags).toEqual(['tag1', 'tag2']);
      expect(sources[0]!.enabled).toBe(true);
    });

    it('getRssSource 不存在时应返回 null', async () => {
      expect(await adapter.getRssSource('nonexistent')).toBeNull();
    });

    it('deleteRssSource 成功应返回 true', async () => {
      mock.setResult('DELETE FROM rss_sources', [], 1);
      expect(await adapter.deleteRssSource('rss1')).toBe(true);
    });
  });

  // ════════════════════════════════════════
  // API Key 管理
  // ════════════════════════════════════════

  describe('API Key 管理', () => {
    it('createApiKey 应正确传递参数', async () => {
      const entry: ApiKeyEntry = {
        id: 'k1',
        name: 'Admin Key',
        keyHash: 'hash-k1',
        permissions: ['read', 'write'],
        rateLimit: 100,
      };
      await adapter.createApiKey(entry);

      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO api_keys');
      expect(params![0]).toBe('k1');
      expect(params![2]).toBe('hash-k1');
      expect(params![3]).toBe(JSON.stringify(['read', 'write']));
      expect(params![4]).toBe(100);
    });

    it('getApiKeys 应映射行数据', async () => {
      mock.setResult('SELECT * FROM api_keys ORDER', [
        {
          id: 'k1',
          name: 'Key1',
          key_hash: 'hash1',
          permissions: ['read'],
          rate_limit: 100,
          created_at: 1700000000,
          last_used_at: null,
          active: true,
        },
      ]);

      const keys = await adapter.getApiKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0]!.id).toBe('k1');
      expect(keys[0]!.keyHash).toBe('hash1');
      expect(keys[0]!.permissions).toEqual(['read']);
      expect(keys[0]!.active).toBe(true);
      expect(keys[0]!.lastUsedAt).toBeNull();
    });

    it('getApiKeyByHash 不存在时应返回 null', async () => {
      expect(await adapter.getApiKeyByHash('nonexistent')).toBeNull();
    });

    it('touchApiKey 应更新 last_used_at', async () => {
      await adapter.touchApiKey('k1');
      const [sql, params] = mock.pool.query.mock.calls[0];
      expect(sql).toContain('UPDATE api_keys SET last_used_at');
      expect(params).toEqual(['k1']);
    });

    it('deleteApiKey 成功应返回 true', async () => {
      mock.setResult('DELETE FROM api_keys', [], 1);
      expect(await adapter.deleteApiKey('k1')).toBe(true);
    });

    it('deleteApiKey 不存在应返回 false', async () => {
      expect(await adapter.deleteApiKey('nonexistent')).toBe(false);
    });

    it('getActiveApiKeyHashes 应返回 Set', async () => {
      mock.setResult('SELECT key_hash FROM api_keys', [
        { key_hash: 'hash1' },
        { key_hash: 'hash2' },
      ]);

      const hashes = await adapter.getActiveApiKeyHashes();
      expect(hashes).toBeInstanceOf(Set);
      expect(hashes.size).toBe(2);
      expect(hashes.has('hash1')).toBe(true);
      expect(hashes.has('hash2')).toBe(true);
    });
  });

  // ════════════════════════════════════════
  // 事务回滚
  // ════════════════════════════════════════

  describe('事务回滚', () => {
    it('事务中出错应 ROLLBACK 并释放连接', async () => {
      mock.mockClient.query.mockImplementation(async (text: string) => {
        if (text !== 'BEGIN' && text !== 'ROLLBACK') {
          throw new Error('DB error');
        }
        return { rows: [], rowCount: 0 };
      });

      const agent = {
        toData: () => ({
          id: 'a1',
          name: 'A1',
          persona: {},
          memory: {},
          followers: [],
          following: [],
          influence: 10,
          credibility: 0.5,
          status: 'active',
          modelTier: 'cheap',
          spawnedAtTick: 0,
          lastActiveTick: 0,
          modelId: 'cheap-default',
        }),
      } as any;

      await expect(adapter.saveAgents([agent])).rejects.toThrow('DB error');

      // 应调用 ROLLBACK
      const rollbackCall = mock.mockClient.query.mock.calls.find(
        (c: any) => c[0] === 'ROLLBACK'
      );
      expect(rollbackCall).toBeDefined();
      expect(mock.mockClient.release).toHaveBeenCalled();
    });
  });
});
