// ============================================================================
// @beeclaw/server — persistence/AgentStateRecovery 单元测试
// 通过 vitest mock DatabaseAdapter 验证增量保存、恢复校验逻辑
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentStateRecovery } from './AgentStateRecovery.js';
import type { DatabaseAdapter } from './adapter.js';
import type { AgentRow } from './store.js';
import type { SocialEdge, SocialNode } from '@beeclaw/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock 辅助 ──

/** 创建最小可用的 mock Agent 实例 */
function createMockAgent(id: string, name: string = `Agent-${id}`) {
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

/** 创建合法 AgentRow（通过校验） */
function createValidRow(id: string, overrides?: Partial<AgentRow>): AgentRow {
  return {
    id,
    name: `Agent-${id}`,
    persona: JSON.stringify({
      background: 'test',
      profession: 'tester',
      traits: { openness: 0.5 },
      expertise: [],
      biases: [],
      communicationStyle: 'formal',
    }),
    memory: JSON.stringify({
      shortTerm: [],
      longTerm: [],
      opinions: {},
      predictions: [],
    }),
    followers: JSON.stringify(['f1']),
    following: JSON.stringify(['g1']),
    influence: 50,
    credibility: 0.8,
    status: 'active',
    model_tier: 'cheap',
    spawned_at_tick: 0,
    last_active_tick: 5,
    updated_at: Date.now(),
    ...overrides,
  };
}

/** 创建 DatabaseAdapter mock */
function createMockAdapter(): DatabaseAdapter {
  return {
    getState: vi.fn().mockResolvedValue(undefined),
    setState: vi.fn().mockResolvedValue(undefined),
    getTick: vi.fn().mockResolvedValue(0),
    setTick: vi.fn().mockResolvedValue(undefined),
    saveAgent: vi.fn().mockResolvedValue(undefined),
    saveAgents: vi.fn().mockResolvedValue(undefined),
    loadAgentRows: vi.fn().mockResolvedValue([]),
    getAgentRow: vi.fn().mockResolvedValue(undefined),
    getAgentRows: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    saveTickResult: vi.fn().mockResolvedValue(undefined),
    getTickHistory: vi.fn().mockResolvedValue([]),
    saveConsensusSignal: vi.fn().mockResolvedValue(undefined),
    getLatestSignals: vi.fn().mockResolvedValue([]),
    getSignalsByTopic: vi.fn().mockResolvedValue([]),
    saveLLMConfig: vi.fn().mockResolvedValue(undefined),
    saveLLMConfigs: vi.fn().mockResolvedValue(undefined),
    loadLLMConfigs: vi.fn().mockResolvedValue(null),
    loadLLMConfig: vi.fn().mockResolvedValue(null),
    createWebhook: vi.fn().mockResolvedValue(undefined),
    getWebhooks: vi.fn().mockResolvedValue([]),
    getWebhook: vi.fn().mockResolvedValue(null),
    updateWebhook: vi.fn().mockResolvedValue(false),
    deleteWebhook: vi.fn().mockResolvedValue(false),
    getActiveWebhooksForEvent: vi.fn().mockResolvedValue([]),
    saveEvents: vi.fn().mockResolvedValue(undefined),
    getEventsByTick: vi.fn().mockResolvedValue([]),
    searchEvents: vi.fn().mockResolvedValue([]),
    saveResponses: vi.fn().mockResolvedValue(undefined),
    getResponsesByTick: vi.fn().mockResolvedValue([]),
    getResponsesByEvent: vi.fn().mockResolvedValue([]),
    saveRssSource: vi.fn().mockResolvedValue(undefined),
    saveRssSources: vi.fn().mockResolvedValue(undefined),
    loadRssSources: vi.fn().mockResolvedValue([]),
    getRssSource: vi.fn().mockResolvedValue(null),
    deleteRssSource: vi.fn().mockResolvedValue(false),
    createApiKey: vi.fn().mockResolvedValue(undefined),
    getApiKeys: vi.fn().mockResolvedValue([]),
    getApiKeyByHash: vi.fn().mockResolvedValue(null),
    touchApiKey: vi.fn().mockResolvedValue(undefined),
    deleteApiKey: vi.fn().mockResolvedValue(false),
    getActiveApiKeyHashes: vi.fn().mockResolvedValue(new Set()),
    saveSocialEdges: vi.fn().mockResolvedValue(undefined),
    saveSocialNodes: vi.fn().mockResolvedValue(undefined),
    loadSocialEdges: vi.fn().mockResolvedValue([]),
    loadSocialNodes: vi.fn().mockResolvedValue([]),
    saveDirtyAgents: vi.fn().mockResolvedValue(undefined),
  };
}

// ── 测试主体 ──

describe('AgentStateRecovery', () => {
  let db: DatabaseAdapter;
  let recovery: AgentStateRecovery;

  beforeEach(() => {
    db = createMockAdapter();
    recovery = new AgentStateRecovery(db);
  });

  // ════════════════════════════════════════
  // 增量脏数据追踪
  // ════════════════════════════════════════

  describe('增量脏数据追踪', () => {
    it('初始 getDirtyCount 应为 0', () => {
      expect(recovery.getDirtyCount()).toBe(0);
    });

    it('markAgentDirty 应增加脏计数', () => {
      recovery.markAgentDirty('a1');
      expect(recovery.getDirtyCount()).toBe(1);
    });

    it('markAgentDirty 重复标记同一 Agent 不应增加计数', () => {
      recovery.markAgentDirty('a1');
      recovery.markAgentDirty('a1');
      expect(recovery.getDirtyCount()).toBe(1);
    });

    it('markAgentDirty 标记多个不同 Agent 应增加计数', () => {
      recovery.markAgentDirty('a1');
      recovery.markAgentDirty('a2');
      recovery.markAgentDirty('a3');
      expect(recovery.getDirtyCount()).toBe(3);
    });

    it('markAgentsDirty 应批量标记', () => {
      recovery.markAgentsDirty(['a1', 'a2', 'a3']);
      expect(recovery.getDirtyCount()).toBe(3);
    });

    it('markAgentsDirty 应与 markAgentDirty 合并去重', () => {
      recovery.markAgentDirty('a1');
      recovery.markAgentsDirty(['a1', 'a2']);
      expect(recovery.getDirtyCount()).toBe(2);
    });

    it('markAgentsDirty 空数组不应影响计数', () => {
      recovery.markAgentsDirty([]);
      expect(recovery.getDirtyCount()).toBe(0);
    });

    it('markGraphDirty 应标记 graph 为脏', () => {
      // 间接验证：flushGraphIfDirty 返回 true
      recovery.markGraphDirty();
      // 需要通过 flushGraphIfDirty 验证，此处先仅确认不报错
      expect(() => recovery.markGraphDirty()).not.toThrow();
    });
  });

  // ════════════════════════════════════════
  // flushDirtyAgents
  // ════════════════════════════════════════

  describe('flushDirtyAgents', () => {
    it('无脏数据时应返回 0 且不调用 db', async () => {
      const agents = new Map<string, any>();
      const count = await recovery.flushDirtyAgents(agents);
      expect(count).toBe(0);
      expect(db.saveDirtyAgents).not.toHaveBeenCalled();
    });

    it('应仅保存标记为脏的 Agent', async () => {
      const a1 = createMockAgent('a1');
      const a2 = createMockAgent('a2');
      const a3 = createMockAgent('a3');
      const agents = new Map<string, any>([
        ['a1', a1],
        ['a2', a2],
        ['a3', a3],
      ]);

      recovery.markAgentDirty('a1');
      recovery.markAgentDirty('a3');

      const count = await recovery.flushDirtyAgents(agents);
      expect(count).toBe(2);
      expect(db.saveDirtyAgents).toHaveBeenCalledTimes(1);

      const savedAgents = (db.saveDirtyAgents as any).mock.calls[0][0] as any[];
      const savedIds = savedAgents.map((a: any) => a.id);
      expect(savedIds).toContain('a1');
      expect(savedIds).toContain('a3');
      expect(savedIds).not.toContain('a2');
    });

    it('保存后应清空脏标记', async () => {
      const agents = new Map<string, any>([['a1', createMockAgent('a1')]]);
      recovery.markAgentDirty('a1');

      await recovery.flushDirtyAgents(agents);
      expect(recovery.getDirtyCount()).toBe(0);
    });

    it('脏 Agent 不在 Map 中时应被忽略', async () => {
      const agents = new Map<string, any>([['a1', createMockAgent('a1')]]);
      recovery.markAgentDirty('a1');
      recovery.markAgentDirty('a_not_exist');

      const count = await recovery.flushDirtyAgents(agents);
      expect(count).toBe(1);
      expect(recovery.getDirtyCount()).toBe(0);
    });

    it('所有脏 Agent 都不在 Map 中时不应调用 saveDirtyAgents', async () => {
      const agents = new Map<string, any>();
      recovery.markAgentDirty('a_not_exist');

      const count = await recovery.flushDirtyAgents(agents);
      expect(count).toBe(0);
      expect(db.saveDirtyAgents).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════
  // flushGraphIfDirty
  // ════════════════════════════════════════

  describe('flushGraphIfDirty', () => {
    // 创建 mock SocialGraph
    function createMockGraph() {
      return {
        toData: () => ({
          nodes: [{ agentId: 'a1', influence: 50, community: 'default', role: 'follower' }] as SocialNode[],
          edges: [{ from: 'a1', to: 'a2', type: 'follow', strength: 0.5, formedAtTick: 0 }] as SocialEdge[],
        }),
        addNode: vi.fn(),
        addEdge: vi.fn(),
        hasNode: vi.fn(),
      } as any;
    }

    it('graph 未标记脏时应返回 false 且不调用 db', async () => {
      const graph = createMockGraph();
      const result = await recovery.flushGraphIfDirty(graph);
      expect(result).toBe(false);
      expect(db.saveSocialEdges).not.toHaveBeenCalled();
      expect(db.saveSocialNodes).not.toHaveBeenCalled();
    });

    it('graph 标记脏后应保存并返回 true', async () => {
      const graph = createMockGraph();
      recovery.markGraphDirty();

      const result = await recovery.flushGraphIfDirty(graph);
      expect(result).toBe(true);
      expect(db.saveSocialEdges).toHaveBeenCalledTimes(1);
      expect(db.saveSocialNodes).toHaveBeenCalledTimes(1);
    });

    it('保存后应重置 graphDirty 标记', async () => {
      const graph = createMockGraph();
      recovery.markGraphDirty();

      await recovery.flushGraphIfDirty(graph);

      // 再次调用应返回 false
      const result = await recovery.flushGraphIfDirty(graph);
      expect(result).toBe(false);
    });

    it('应正确传递 toData 结果给 saveSocialEdges 和 saveSocialNodes', async () => {
      const graph = createMockGraph();
      recovery.markGraphDirty();

      await recovery.flushGraphIfDirty(graph);

      const savedEdges = (db.saveSocialEdges as any).mock.calls[0][0];
      const savedNodes = (db.saveSocialNodes as any).mock.calls[0][0];
      expect(savedEdges).toHaveLength(1);
      expect(savedEdges[0].from).toBe('a1');
      expect(savedNodes).toHaveLength(1);
      expect(savedNodes[0].agentId).toBe('a1');
    });
  });

  // ════════════════════════════════════════
  // forceFlush
  // ════════════════════════════════════════

  describe('forceFlush', () => {
    function createMockGraph() {
      return {
        toData: () => ({
          nodes: [{ agentId: 'a1', influence: 50, community: 'default', role: 'follower' }] as SocialNode[],
          edges: [{ from: 'a1', to: 'a2', type: 'follow', strength: 0.5, formedAtTick: 0 }] as SocialEdge[],
        }),
      } as any;
    }

    it('应保存所有 Agent（不限于脏标记）', async () => {
      const agents = new Map<string, any>([
        ['a1', createMockAgent('a1')],
        ['a2', createMockAgent('a2')],
      ]);
      const graph = createMockGraph();

      await recovery.forceFlush(agents, graph);

      expect(db.saveAgents).toHaveBeenCalledTimes(1);
      const savedAgents = (db.saveAgents as any).mock.calls[0][0] as any[];
      expect(savedAgents).toHaveLength(2);
    });

    it('应保存 Social Graph 边和节点', async () => {
      const agents = new Map<string, any>();
      const graph = createMockGraph();

      await recovery.forceFlush(agents, graph);

      expect(db.saveSocialEdges).toHaveBeenCalledTimes(1);
      expect(db.saveSocialNodes).toHaveBeenCalledTimes(1);
    });

    it('应清空所有脏标记', async () => {
      const agents = new Map<string, any>([['a1', createMockAgent('a1')]]);
      const graph = createMockGraph();

      recovery.markAgentDirty('a1');
      recovery.markGraphDirty();

      await recovery.forceFlush(agents, graph);

      expect(recovery.getDirtyCount()).toBe(0);

      // graph 脏标记也应被清除
      const graphResult = await recovery.flushGraphIfDirty(graph as any);
      expect(graphResult).toBe(false);
    });

    it('Agent Map 为空时不应调用 saveAgents', async () => {
      const agents = new Map<string, any>();
      const graph = createMockGraph();

      await recovery.forceFlush(agents, graph);

      expect(db.saveAgents).not.toHaveBeenCalled();
      // 但仍应保存 graph
      expect(db.saveSocialEdges).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════
  // validateAgentRow（私有方法通过 recoverAll 间接测试）
  // ════════════════════════════════════════

  describe('validateAgentRow（通过 recoverAll 间接测试）', () => {
    it('缺少 id 应标记为损坏', async () => {
      const row = createValidRow('a1', { id: '' });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(0);
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('id');
    });

    it('缺少 name 应标记为损坏', async () => {
      const row = createValidRow('a1', { name: '' });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('name');
    });

    it('persona 字段 JSON 解析失败应标记为损坏', async () => {
      const row = createValidRow('a1', { persona: '{invalid json' });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('persona');
      expect(result.agents.corrupted[0]!.reason).toContain('JSON');
    });

    it('persona 缺少 profession 应标记为损坏', async () => {
      const row = createValidRow('a1', {
        persona: JSON.stringify({ background: 'test', traits: {} }),
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('persona');
      expect(result.agents.corrupted[0]!.reason).toContain('profession');
    });

    it('persona 缺少 traits 应标记为损坏', async () => {
      const row = createValidRow('a1', {
        persona: JSON.stringify({ profession: 'tester' }),
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('persona');
    });

    it('memory 字段 JSON 解析失败应标记为损坏', async () => {
      const row = createValidRow('a1', { memory: 'not-json' });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('memory');
      expect(result.agents.corrupted[0]!.reason).toContain('JSON');
    });

    it('memory 缺少 shortTerm 应标记为损坏', async () => {
      const row = createValidRow('a1', {
        memory: JSON.stringify({ longTerm: [], opinions: {}, predictions: [] }),
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('memory');
    });

    it('memory 缺少 longTerm 应标记为损坏', async () => {
      const row = createValidRow('a1', {
        memory: JSON.stringify({ shortTerm: [], opinions: {}, predictions: [] }),
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
    });

    it('memory 缺少 opinions 应标记为损坏', async () => {
      const row = createValidRow('a1', {
        memory: JSON.stringify({ shortTerm: [], longTerm: [], predictions: [] }),
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
    });

    it('memory 缺少 predictions 应标记为损坏', async () => {
      const row = createValidRow('a1', {
        memory: JSON.stringify({ shortTerm: [], longTerm: [], opinions: {} }),
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
    });

    it('influence 超出范围（> 100）应标记为损坏', async () => {
      const row = createValidRow('a1', { influence: 101 });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('influence');
    });

    it('influence 超出范围（< 0）应标记为损坏', async () => {
      const row = createValidRow('a1', { influence: -1 });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('influence');
    });

    it('influence 非数值应标记为损坏', async () => {
      const row = createValidRow('a1', { influence: 'abc' as any });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('influence');
    });

    it('influence 边界值 0 和 100 应通过校验', async () => {
      const row0 = createValidRow('a1', { influence: 0 });
      const row100 = createValidRow('a2', { influence: 100 });
      (db.loadAgentRows as any).mockResolvedValue([row0, row100]);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(2);
      expect(result.agents.corrupted).toHaveLength(0);
    });

    it('credibility 超出范围（> 1）应标记为损坏', async () => {
      const row = createValidRow('a1', { credibility: 1.1 });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('credibility');
    });

    it('credibility 超出范围（< 0）应标记为损坏', async () => {
      const row = createValidRow('a1', { credibility: -0.1 });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('credibility');
    });

    it('credibility 边界值 0 和 1 应通过校验', async () => {
      const row0 = createValidRow('a1', { credibility: 0 });
      const row1 = createValidRow('a2', { credibility: 1 });
      (db.loadAgentRows as any).mockResolvedValue([row0, row1]);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(2);
      expect(result.agents.corrupted).toHaveLength(0);
    });

    it('无效 status 应标记为损坏', async () => {
      const row = createValidRow('a1', { status: 'invalid' });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('status');
    });

    it('合法 status（active / dormant / dead）应通过校验', async () => {
      const rows = [
        createValidRow('a1', { status: 'active' }),
        createValidRow('a2', { status: 'dormant' }),
        createValidRow('a3', { status: 'dead' }),
      ];
      (db.loadAgentRows as any).mockResolvedValue(rows);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(3);
      expect(result.agents.corrupted).toHaveLength(0);
    });

    it('无效 model_tier 应标记为损坏', async () => {
      const row = createValidRow('a1', { model_tier: 'ultra' });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('model_tier');
    });

    it('合法 model_tier（local / cheap / strong）应通过校验', async () => {
      const rows = [
        createValidRow('a1', { model_tier: 'local' }),
        createValidRow('a2', { model_tier: 'cheap' }),
        createValidRow('a3', { model_tier: 'strong' }),
      ];
      (db.loadAgentRows as any).mockResolvedValue(rows);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(3);
      expect(result.agents.corrupted).toHaveLength(0);
    });

    it('persona 为已解析对象（非字符串）也应通过校验', async () => {
      const row = createValidRow('a1', {
        persona: {
          background: 'test',
          profession: 'tester',
          traits: { openness: 0.5 },
          expertise: [],
          biases: [],
          communicationStyle: 'formal',
        } as any,
        memory: {
          shortTerm: [],
          longTerm: [],
          opinions: {},
          predictions: [],
        } as any,
        followers: ['f1'] as any,
        following: ['g1'] as any,
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(1);
    });

    it('memory 为已解析对象（非字符串）也应通过校验', async () => {
      const row = createValidRow('a1', {
        memory: { shortTerm: [], longTerm: [], opinions: {}, predictions: [] } as any,
      });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(1);
    });
  });

  // ════════════════════════════════════════
  // restoreAgentFromRow（通过 recoverAll 间接测试）
  // ════════════════════════════════════════

  describe('restoreAgentFromRow（通过 recoverAll 间接测试）', () => {
    it('应正确反序列化合法 AgentRow 为 Agent 实例', async () => {
      const row = createValidRow('a1');
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(1);

      const agent = result.agents.recovered[0]!;
      expect(agent.id).toBe('a1');
      expect(agent.name).toBe('Agent-a1');
    });

    it('多条合法记录应全部恢复', async () => {
      const rows = [
        createValidRow('a1'),
        createValidRow('a2'),
        createValidRow('a3'),
      ];
      (db.loadAgentRows as any).mockResolvedValue(rows);

      const result = await recovery.recoverAll();
      expect(result.agents.recovered).toHaveLength(3);
      expect(result.agents.corrupted).toHaveLength(0);
    });

    it('restoreAgentFromRow 抛异常时应标记为损坏', async () => {
      // 构造一个校验能通过但恢复时异常的 row
      // 方法：persona JSON 合法但 Agent.fromData 需要更多字段
      // 由于 Agent.fromData 可能对某些字段有更严格的要求
      // 这里直接通过给 followers 一个无效值来触发
      const row = createValidRow('a1', { followers: 'not-an-array' });
      (db.loadAgentRows as any).mockResolvedValue([row]);

      const result = await recovery.recoverAll();
      // JSON.parse('not-an-array') 会抛异常，restoreAgentFromRow 中会 catch
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.reason).toContain('恢复实例失败');
    });

    it('durationMs 应是非负数', async () => {
      (db.loadAgentRows as any).mockResolvedValue([]);

      const result = await recovery.recoverAll();
      expect(result.agents.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ════════════════════════════════════════
  // recoverAll
  // ════════════════════════════════════════

  describe('recoverAll', () => {
    it('正常恢复：合法 Agent + Graph', async () => {
      const rows = [createValidRow('a1'), createValidRow('a2')];
      (db.loadAgentRows as any).mockResolvedValue(rows);
      (db.getTick as any).mockResolvedValue(42);
      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'a1', influence: 50, community: 'default', role: 'follower' },
        { agentId: 'a2', influence: 30, community: 'default', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([
        { from: 'a1', to: 'a2', type: 'follow', strength: 0.5, formedAtTick: 1 },
      ]);

      const result = await recovery.recoverAll();

      expect(result.tick).toBe(42);
      expect(result.agents.recovered).toHaveLength(2);
      expect(result.agents.corrupted).toHaveLength(0);
      expect(result.graph.nodeCount).toBe(2);
      expect(result.graph.edgeCount).toBe(1);
      expect(result.graph.skipped).toBe(0);
    });

    it('损坏记录过滤：混合合法与无效 Agent', async () => {
      const validRow = createValidRow('a1');
      const corruptedRow = createValidRow('a2', { status: 'zombie' });
      (db.loadAgentRows as any).mockResolvedValue([validRow, corruptedRow]);
      (db.loadSocialNodes as any).mockResolvedValue([]);
      (db.loadSocialEdges as any).mockResolvedValue([]);

      const result = await recovery.recoverAll();

      expect(result.agents.recovered).toHaveLength(1);
      expect(result.agents.recovered[0]!.id).toBe('a1');
      expect(result.agents.corrupted).toHaveLength(1);
      expect(result.agents.corrupted[0]!.id).toBe('a2');
    });

    it('空数据库恢复应返回空结果', async () => {
      (db.loadAgentRows as any).mockResolvedValue([]);
      (db.getTick as any).mockResolvedValue(0);
      (db.loadSocialNodes as any).mockResolvedValue([]);
      (db.loadSocialEdges as any).mockResolvedValue([]);

      const result = await recovery.recoverAll();

      expect(result.tick).toBe(0);
      expect(result.agents.recovered).toHaveLength(0);
      expect(result.agents.corrupted).toHaveLength(0);
      expect(result.graph.nodeCount).toBe(0);
      expect(result.graph.edgeCount).toBe(0);
      expect(result.graph.skipped).toBe(0);
    });

    it('返回结果应包含 durationMs', async () => {
      (db.loadAgentRows as any).mockResolvedValue([]);
      (db.loadSocialNodes as any).mockResolvedValue([]);
      (db.loadSocialEdges as any).mockResolvedValue([]);

      const result = await recovery.recoverAll();
      expect(typeof result.agents.durationMs).toBe('number');
      expect(result.agents.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ════════════════════════════════════════
  // recoverGraph（通过 recoverAll 间接测试）
  // ════════════════════════════════════════

  describe('recoverGraph', () => {
    it('应过滤不存在的 Agent 节点', async () => {
      const rows = [createValidRow('a1')];
      (db.loadAgentRows as any).mockResolvedValue(rows);
      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'a1', influence: 50, community: 'default', role: 'follower' },
        { agentId: 'a_unknown', influence: 30, community: 'default', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([]);

      const result = await recovery.recoverAll();

      expect(result.graph.nodeCount).toBe(1);
      expect(result.graph.skipped).toBe(1);
    });

    it('应过滤两端不全在已恢复 Agent 中的边', async () => {
      const rows = [createValidRow('a1'), createValidRow('a2')];
      (db.loadAgentRows as any).mockResolvedValue(rows);
      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'a1', influence: 50, community: 'default', role: 'follower' },
        { agentId: 'a2', influence: 30, community: 'default', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([
        { from: 'a1', to: 'a2', type: 'follow', strength: 0.5, formedAtTick: 1 },
        { from: 'a1', to: 'a_unknown', type: 'follow', strength: 0.3, formedAtTick: 2 },
        { from: 'a_unknown', to: 'a2', type: 'follow', strength: 0.2, formedAtTick: 3 },
      ]);

      const result = await recovery.recoverAll();

      expect(result.graph.edgeCount).toBe(1);
      expect(result.graph.skipped).toBe(2); // 2 条无效边
    });

    it('节点和边都不匹配时应全部跳过', async () => {
      const rows = [createValidRow('a1')];
      (db.loadAgentRows as any).mockResolvedValue(rows);
      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'unknown1', influence: 50, community: 'default', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([
        { from: 'unknown1', to: 'unknown2', type: 'follow', strength: 0.5, formedAtTick: 1 },
      ]);

      const result = await recovery.recoverAll();

      // a1 节点在 nodes 中不存在，所以 nodeCount 为 0（但 a1 是 recovered agent）
      // unknown1 节点被跳过（不在 recovered agent 中）
      expect(result.graph.nodeCount).toBe(0);
      expect(result.graph.edgeCount).toBe(0);
      expect(result.graph.skipped).toBe(2); // 1 node + 1 edge
    });
  });

  // ════════════════════════════════════════
  // applyGraphToEngine
  // ════════════════════════════════════════

  describe('applyGraphToEngine', () => {
    function createMockSocialGraph() {
      const nodes = new Map<string, SocialNode>();
      const addedEdges: any[] = [];

      return {
        addNode: vi.fn((agentId: string, influence: number, community: string, role: string) => {
          nodes.set(agentId, { agentId, influence, community, role } as SocialNode);
        }),
        hasNode: vi.fn((agentId: string) => nodes.has(agentId)),
        addEdge: vi.fn((...args: any[]) => {
          addedEdges.push(args);
        }),
        _nodes: nodes,
        _addedEdges: addedEdges,
      } as any;
    }

    it('应将节点和边应用到传入的 graph 实例', async () => {
      const graph = createMockSocialGraph();
      const knownIds = new Set(['a1', 'a2']);

      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'a1', influence: 50, community: 'alpha', role: 'leader' },
        { agentId: 'a2', influence: 30, community: 'alpha', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([
        { from: 'a1', to: 'a2', type: 'follow', strength: 0.7, formedAtTick: 5 },
      ]);

      const result = await recovery.applyGraphToEngine(graph, knownIds);

      expect(result.nodeCount).toBe(2);
      expect(result.edgeCount).toBe(1);
      expect(result.skipped).toBe(0);

      expect(graph.addNode).toHaveBeenCalledTimes(2);
      expect(graph.addNode).toHaveBeenCalledWith('a1', 50, 'alpha', 'leader');
      expect(graph.addEdge).toHaveBeenCalledTimes(1);
      expect(graph.addEdge).toHaveBeenCalledWith('a1', 'a2', 'follow', 0.7, 5);
    });

    it('应过滤不在 knownAgentIds 中的节点', async () => {
      const graph = createMockSocialGraph();
      const knownIds = new Set(['a1']);

      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'a1', influence: 50, community: 'default', role: 'follower' },
        { agentId: 'a_unknown', influence: 20, community: 'default', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([]);

      const result = await recovery.applyGraphToEngine(graph, knownIds);

      expect(result.nodeCount).toBe(1);
      expect(result.skipped).toBe(1);
      expect(graph.addNode).toHaveBeenCalledTimes(1);
    });

    it('应过滤两端节点不都存在的边', async () => {
      const graph = createMockSocialGraph();
      const knownIds = new Set(['a1', 'a2']);

      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'a1', influence: 50, community: 'default', role: 'follower' },
        { agentId: 'a2', influence: 30, community: 'default', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([
        { from: 'a1', to: 'a2', type: 'follow', strength: 0.5, formedAtTick: 1 },
        { from: 'a1', to: 'a_missing', type: 'follow', strength: 0.3, formedAtTick: 2 },
      ]);

      const result = await recovery.applyGraphToEngine(graph, knownIds);

      expect(result.edgeCount).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('knownAgentIds 为空集时应全部跳过', async () => {
      const graph = createMockSocialGraph();
      const knownIds = new Set<string>();

      (db.loadSocialNodes as any).mockResolvedValue([
        { agentId: 'a1', influence: 50, community: 'default', role: 'follower' },
      ]);
      (db.loadSocialEdges as any).mockResolvedValue([
        { from: 'a1', to: 'a2', type: 'follow', strength: 0.5, formedAtTick: 1 },
      ]);

      const result = await recovery.applyGraphToEngine(graph, knownIds);

      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
      expect(result.skipped).toBe(2);
    });

    it('空数据库应返回全零结果', async () => {
      const graph = createMockSocialGraph();
      const knownIds = new Set(['a1']);

      (db.loadSocialNodes as any).mockResolvedValue([]);
      (db.loadSocialEdges as any).mockResolvedValue([]);

      const result = await recovery.applyGraphToEngine(graph, knownIds);

      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });
});
