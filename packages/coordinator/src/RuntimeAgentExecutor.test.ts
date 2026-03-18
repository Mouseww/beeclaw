// ============================================================================
// RuntimeAgentExecutor 单元测试
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuntimeAgentExecutor } from './RuntimeAgentExecutor.js';
import type { WorldEvent, BeeAgent, AgentPersona, AgentMemoryState } from '@beeclaw/shared';

// ── 测试辅助 ────────────────────────────────────────────────────────

function createTestPersona(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    background: '一名资深金融分析师',
    profession: '金融分析师',
    traits: {
      riskTolerance: 0.5,
      informationSensitivity: 0.7,
      conformity: 0.3,
      emotionality: 0.4,
      analyticalDepth: 0.8,
    },
    expertise: ['金融', '股票'],
    biases: ['确认偏见'],
    communicationStyle: '理性分析型',
    ...overrides,
  };
}

function createTestMemoryState(): AgentMemoryState {
  return {
    shortTerm: [],
    longTerm: [],
    opinions: {},
    predictions: [],
  };
}

function createTestAgentData(overrides: Partial<BeeAgent> = {}): BeeAgent {
  const id = overrides.id ?? `agent-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: `测试Agent-${id.slice(-4)}`,
    persona: createTestPersona(),
    memory: createTestMemoryState(),
    relationships: [],
    followers: [],
    following: [],
    influence: 30,
    status: 'active',
    credibility: 0.5,
    spawnedAtTick: 0,
    lastActiveTick: 0,
    modelTier: 'cheap',
    modelId: 'cheap-default',
    ...overrides,
  };
}

function createTestEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    type: 'external',
    category: 'finance',
    title: '央行宣布加息',
    content: '央行宣布加息25个基点，市场反应剧烈。',
    source: 'news-api',
    importance: 0.8,
    propagationRadius: 0.5,
    tick: 1,
    tags: ['金融', '央行', '加息'],
    ...overrides,
  };
}

// ── 测试套件 ────────────────────────────────────────────────────────

describe('RuntimeAgentExecutor', () => {
  let executor: RuntimeAgentExecutor;

  beforeEach(() => {
    executor = new RuntimeAgentExecutor({
      enableLogging: false,
    });
  });

  describe('Agent 生命周期管理', () => {
    it('应正确加载单个 Agent', () => {
      const agentData = createTestAgentData({ id: 'agent-001' });
      executor.loadAgent(agentData);

      expect(executor.getLoadedAgentCount()).toBe(1);
      expect(executor.getLoadedAgentIds()).toContain('agent-001');
    });

    it('应正确批量加载 Agent', () => {
      const agents = [
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
        createTestAgentData({ id: 'a3' }),
      ];
      executor.loadAgents(agents);

      expect(executor.getLoadedAgentCount()).toBe(3);
      expect(executor.getLoadedAgentIds()).toEqual(
        expect.arrayContaining(['a1', 'a2', 'a3']),
      );
    });

    it('应正确卸载单个 Agent', () => {
      executor.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
      ]);

      executor.unloadAgent('a1');

      expect(executor.getLoadedAgentCount()).toBe(1);
      expect(executor.getLoadedAgentIds()).not.toContain('a1');
      expect(executor.getLoadedAgentIds()).toContain('a2');
    });

    it('应正确清空所有 Agent', () => {
      executor.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
      ]);

      executor.unloadAll();

      expect(executor.getLoadedAgentCount()).toBe(0);
    });

    it('应正确获取 Agent 实例', () => {
      const agentData = createTestAgentData({ id: 'a1', name: '分析师Alpha' });
      executor.loadAgent(agentData);

      const agent = executor.getAgent('a1');
      expect(agent).toBeDefined();
      expect(agent!.id).toBe('a1');
      expect(agent!.name).toBe('分析师Alpha');
    });

    it('获取不存在的 Agent 应返回 undefined', () => {
      expect(executor.getAgent('nonexistent')).toBeUndefined();
    });

    it('应正确导出 Agent 数据', () => {
      const agentData = createTestAgentData({ id: 'a1' });
      executor.loadAgent(agentData);

      const exported = executor.exportAgent('a1');
      expect(exported).toBeDefined();
      expect(exported!.id).toBe('a1');
      expect(exported!.persona).toBeDefined();
      expect(exported!.memory).toBeDefined();
    });

    it('应正确导出所有 Agent 数据', () => {
      executor.loadAgents([
        createTestAgentData({ id: 'a1' }),
        createTestAgentData({ id: 'a2' }),
      ]);

      const exported = executor.exportAllAgents();
      expect(exported).toHaveLength(2);
      expect(exported.map((a) => a.id)).toEqual(
        expect.arrayContaining(['a1', 'a2']),
      );
    });

    it('重复加载同 ID 应覆盖', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', name: '初始名称' }));
      executor.loadAgent(createTestAgentData({ id: 'a1', name: '更新名称' }));

      expect(executor.getLoadedAgentCount()).toBe(1);
      expect(executor.getAgent('a1')!.name).toBe('更新名称');
    });
  });

  describe('isAgentActive', () => {
    it('活跃 Agent 应返回 true', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', status: 'active' }));
      expect(executor.isAgentActive('a1')).toBe(true);
    });

    it('休眠 Agent 应返回 false', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', status: 'dormant' }));
      expect(executor.isAgentActive('a1')).toBe(false);
    });

    it('死亡 Agent 应返回 false', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', status: 'dead' }));
      expect(executor.isAgentActive('a1')).toBe(false);
    });

    it('未加载 Agent 应返回 false', () => {
      expect(executor.isAgentActive('nonexistent')).toBe(false);
    });
  });

  describe('isAgentInterested', () => {
    it('高重要性事件应触发所有活跃 Agent 的兴趣', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', status: 'active' }));
      const event = createTestEvent({ importance: 0.9 });
      expect(executor.isAgentInterested('a1', event)).toBe(true);
    });

    it('专业领域匹配的事件应触发兴趣', () => {
      executor.loadAgent(createTestAgentData({
        id: 'a1',
        persona: createTestPersona({ expertise: ['金融'] }),
      }));
      const event = createTestEvent({ tags: ['金融', '股票'] });
      expect(executor.isAgentInterested('a1', event)).toBe(true);
    });

    it('未加载 Agent 应返回 false', () => {
      expect(executor.isAgentInterested('nonexistent', createTestEvent())).toBe(false);
    });

    it('非活跃 Agent 应返回 false', () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', status: 'dormant' }));
      expect(executor.isAgentInterested('a1', createTestEvent())).toBe(false);
    });
  });

  describe('executeAgent', () => {
    it('未加载 Agent 应返回 null', async () => {
      const result = await executor.executeAgent('nonexistent', createTestEvent(), 1);
      expect(result).toBeNull();
    });

    it('应对已加载 Agent 执行并返回结果（带 mock LLM）', async () => {
      // Mock LLM 调用 — 通过 mock Agent.react 方法
      executor.loadAgent(createTestAgentData({ id: 'a1', name: '分析师' }));
      const agent = executor.getAgent('a1')!;

      // 直接 mock Agent 的 react 方法以避免真实 LLM 调用
      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '看好后市，央行加息有利于抑制通胀',
        action: 'speak',
        emotionalState: 0.3,
        reasoning: '加息表明央行有信心控制通胀',
      });

      const event = createTestEvent();
      const result = await executor.executeAgent('a1', event, 1);

      expect(result).not.toBeNull();
      expect(result!.record.agentId).toBe('a1');
      expect(result!.record.agentName).toBe('分析师');
      expect(result!.record.response.opinion).toContain('看好后市');
      expect(result!.record.response.action).toBe('speak');
    });

    it('speak 行为应产生新事件', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', name: '分析师', influence: 50 }));
      const agent = executor.getAgent('a1')!;

      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '市场将大幅波动',
        action: 'speak',
        emotionalState: -0.2,
      });

      const event = createTestEvent({ category: 'finance', tags: ['央行'] });
      const result = await executor.executeAgent('a1', event, 5);

      expect(result).not.toBeNull();
      expect(result!.newEvents).toHaveLength(1);
      expect(result!.newEvents[0]!.type).toBe('agent_action');
      expect(result!.newEvents[0]!.source).toBe('a1');
      expect(result!.newEvents[0]!.category).toBe('finance');
      expect(result!.newEvents[0]!.tick).toBe(5);
      expect(result!.newEvents[0]!.content).toBe('市场将大幅波动');
    });

    it('forward 行为也应产生新事件', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executor.getAgent('a1')!;

      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '转发: 值得关注',
        action: 'forward',
        emotionalState: 0.1,
      });

      const result = await executor.executeAgent('a1', createTestEvent(), 1);

      expect(result).not.toBeNull();
      expect(result!.newEvents).toHaveLength(1);
    });

    it('silent 行为不应产生新事件', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executor.getAgent('a1')!;

      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '需要观望',
        action: 'silent',
        emotionalState: 0,
      });

      const result = await executor.executeAgent('a1', createTestEvent(), 1);

      expect(result).not.toBeNull();
      expect(result!.newEvents).toHaveLength(0);
    });

    it('predict 行为不应产生新事件', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executor.getAgent('a1')!;

      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '预测明天涨',
        action: 'predict',
        emotionalState: 0.5,
        reasoning: '技术面看涨',
      });

      const result = await executor.executeAgent('a1', createTestEvent(), 1);

      expect(result).not.toBeNull();
      expect(result!.newEvents).toHaveLength(0);
    });

    it('LLM 调用失败时应返回 null（不崩溃）', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executor.getAgent('a1')!;

      vi.spyOn(agent, 'react').mockRejectedValue(new Error('LLM API 不可用'));

      const result = await executor.executeAgent('a1', createTestEvent(), 1);

      expect(result).toBeNull();
    });

    it('LLM 超时应返回 null', async () => {
      // 使用很短的超时
      const fastExecutor = new RuntimeAgentExecutor({
        agentTimeoutMs: 10,
        enableLogging: false,
      });

      fastExecutor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = fastExecutor.getAgent('a1')!;

      // 模拟超长的 LLM 调用
      vi.spyOn(agent, 'react').mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          opinion: '太迟了',
          action: 'silent',
          emotionalState: 0,
        }), 200)),
      );

      const result = await fastExecutor.executeAgent('a1', createTestEvent(), 1);

      expect(result).toBeNull();
    });

    it('新事件的 importance 应被正确计算', async () => {
      executor.loadAgent(createTestAgentData({ id: 'a1', influence: 80 }));
      const agent = executor.getAgent('a1')!;

      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '非常看好',
        action: 'speak',
        emotionalState: 0.8,
      });

      const event = createTestEvent({ importance: 0.6 });
      const result = await executor.executeAgent('a1', event, 1);

      expect(result).not.toBeNull();
      // importance = min(0.6 * 0.5, 80/100) = min(0.3, 0.8) = 0.3
      expect(result!.newEvents[0]!.importance).toBe(0.3);
    });
  });

  describe('与 Worker 集成', () => {
    it('应能作为 AgentExecutor 注入 Worker 使用', async () => {
      // 验证类型兼容性 — RuntimeAgentExecutor 实现了 AgentExecutor 接口
      const { Worker, InProcessTransport } = await import('./index.js');

      const transport = new InProcessTransport();
      const worker = new Worker({ id: 'w1' }, transport, executor);

      executor.loadAgent(createTestAgentData({ id: 'a1' }));
      const agent = executor.getAgent('a1')!;

      vi.spyOn(agent, 'react').mockResolvedValue({
        opinion: '牛市来了',
        action: 'speak',
        emotionalState: 0.6,
      });

      worker.setAssignedAgents(['a1']);
      const result = await worker.processTick(1, [createTestEvent()]);

      expect(result.type).toBe('worker_tick_result');
      expect(result.responses).toHaveLength(1);
      expect(result.responses[0]!.agentId).toBe('a1');
      expect(result.responses[0]!.response.opinion).toBe('牛市来了');
      expect(result.newEvents).toHaveLength(1);

      worker.dispose();
    });

    it('Worker 分配的 Agent 未加载时应优雅返回空结果', async () => {
      const { Worker, InProcessTransport } = await import('./index.js');

      const transport = new InProcessTransport();
      const worker = new Worker({ id: 'w1' }, transport, executor);

      // 分配了 Agent 但 executor 中没有加载
      worker.setAssignedAgents(['unknown-agent']);

      const result = await worker.processTick(1, [createTestEvent()]);

      // isAgentActive 返回 false → agent 被过滤，不会调用 executeAgent
      expect(result.responses).toHaveLength(0);
      expect(result.agentsActivated).toBe(0);

      worker.dispose();
    });
  });

  describe('ModelRouter', () => {
    it('应暴露 ModelRouter 实例供外部使用', () => {
      const modelRouter = executor.getModelRouter();
      expect(modelRouter).toBeDefined();
    });
  });
});
