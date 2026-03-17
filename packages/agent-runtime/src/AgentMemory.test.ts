// ============================================================================
// @beeclaw/agent-runtime AgentMemory 单元测试
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { AgentMemory } from './AgentMemory.js';
import type { LLMClient } from './LLMClient.js';

describe('AgentMemory', () => {
  // ── 构造 ──

  describe('构造函数', () => {
    it('默认状态应初始化为空', () => {
      const mem = new AgentMemory();
      const state = mem.getState();
      expect(state.shortTerm).toEqual([]);
      expect(state.longTerm).toEqual([]);
      expect(state.opinions).toEqual({});
      expect(state.predictions).toEqual([]);
    });

    it('应支持传入初始状态', () => {
      const initial = {
        shortTerm: [{ tick: 1, type: 'event' as const, content: '测试', importance: 0.5, emotionalImpact: 0 }],
        longTerm: [],
        opinions: {},
        predictions: [],
      };
      const mem = new AgentMemory(initial);
      expect(mem.getShortTermMemories()).toHaveLength(1);
      expect(mem.getShortTermMemories()[0]!.content).toBe('测试');
    });
  });

  // ── 短期记忆 ──

  describe('addShortTermMemory / remember', () => {
    it('应添加记忆条目', () => {
      const mem = new AgentMemory();
      mem.remember(1, 'event', '发生了一件事', 0.5, 0.2);
      const memories = mem.getShortTermMemories();
      expect(memories).toHaveLength(1);
      expect(memories[0]!.tick).toBe(1);
      expect(memories[0]!.type).toBe('event');
      expect(memories[0]!.content).toBe('发生了一件事');
      expect(memories[0]!.importance).toBe(0.5);
      expect(memories[0]!.emotionalImpact).toBe(0.2);
    });

    it('默认 importance 和 emotionalImpact', () => {
      const mem = new AgentMemory();
      mem.remember(1, 'observation', '观察');
      const memories = mem.getShortTermMemories();
      expect(memories[0]!.importance).toBe(0.5);
      expect(memories[0]!.emotionalImpact).toBe(0);
    });

    it('超过 50 条时应 FIFO 淘汰最旧的', () => {
      const mem = new AgentMemory();
      for (let i = 0; i < 60; i++) {
        mem.remember(i, 'event', `记忆 ${i}`);
      }
      const memories = mem.getShortTermMemories();
      expect(memories).toHaveLength(50);
      expect(memories[0]!.content).toBe('记忆 10');
      expect(memories[49]!.content).toBe('记忆 59');
    });
  });

  // ── 获取最近记忆 ──

  describe('getRecentMemories', () => {
    it('应返回最近 N 条记忆', () => {
      const mem = new AgentMemory();
      for (let i = 0; i < 20; i++) {
        mem.remember(i, 'event', `记忆 ${i}`);
      }
      const recent = mem.getRecentMemories(5);
      expect(recent).toHaveLength(5);
      expect(recent[0]!.content).toBe('记忆 15');
      expect(recent[4]!.content).toBe('记忆 19');
    });

    it('默认返回最近 10 条', () => {
      const mem = new AgentMemory();
      for (let i = 0; i < 20; i++) {
        mem.remember(i, 'event', `记忆 ${i}`);
      }
      expect(mem.getRecentMemories()).toHaveLength(10);
    });

    it('记忆不足时返回全部', () => {
      const mem = new AgentMemory();
      mem.remember(1, 'event', '唯一记忆');
      expect(mem.getRecentMemories(5)).toHaveLength(1);
    });
  });

  // ── 观点记忆 ──

  describe('updateOpinion / getOpinion', () => {
    it('应创建新的观点', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('AI发展', 0.8, 0.7, '看好 AI 发展前景', 5);
      const op = mem.getOpinion('AI发展');
      expect(op).toBeDefined();
      expect(op!.topic).toBe('AI发展');
      expect(op!.stance).toBe(0.8);
      expect(op!.confidence).toBe(0.7);
      expect(op!.reasoning).toBe('看好 AI 发展前景');
      expect(op!.lastUpdatedTick).toBe(5);
    });

    it('应更新已有观点', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('股市', 0.5, 0.6, '初始看法', 1);
      mem.updateOpinion('股市', -0.3, 0.8, '更新看法', 5);
      const op = mem.getOpinion('股市');
      expect(op!.stance).toBe(-0.3);
      expect(op!.confidence).toBe(0.8);
      expect(op!.lastUpdatedTick).toBe(5);
    });

    it('stance 应限制在 -1 ~ +1', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('测试', 2.0, 0.5, '过大', 1);
      expect(mem.getOpinion('测试')!.stance).toBe(1);
      mem.updateOpinion('测试2', -5.0, 0.5, '过小', 1);
      expect(mem.getOpinion('测试2')!.stance).toBe(-1);
    });

    it('confidence 应限制在 0 ~ 1', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('测试', 0.5, 3.0, '过大', 1);
      expect(mem.getOpinion('测试')!.confidence).toBe(1);
      mem.updateOpinion('测试2', 0.5, -1.0, '过小', 1);
      expect(mem.getOpinion('测试2')!.confidence).toBe(0);
    });

    it('不存在的话题应返回 undefined', () => {
      const mem = new AgentMemory();
      expect(mem.getOpinion('不存在')).toBeUndefined();
    });
  });

  // ── getAllOpinions ──

  describe('getAllOpinions', () => {
    it('应返回所有观点的副本', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('A', 0.1, 0.5, 'a', 1);
      mem.updateOpinion('B', -0.2, 0.6, 'b', 2);
      const all = mem.getAllOpinions();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all['A']!.stance).toBe(0.1);
      expect(all['B']!.stance).toBe(-0.2);
    });
  });

  // ── 预测记录 ──

  describe('addPrediction', () => {
    it('应添加预测记录', () => {
      const mem = new AgentMemory();
      mem.addPrediction(5, '股市明天会涨');
      const state = mem.getState();
      expect(state.predictions).toHaveLength(1);
      expect(state.predictions[0]!.tick).toBe(5);
      expect(state.predictions[0]!.prediction).toBe('股市明天会涨');
    });
  });

  // ── getState ──

  describe('getState', () => {
    it('应返回状态的深拷贝', () => {
      const mem = new AgentMemory();
      mem.remember(1, 'event', '记忆');
      const state1 = mem.getState();
      const state2 = mem.getState();
      expect(state1).toEqual(state2);
      expect(state1.shortTerm).not.toBe(state2.shortTerm); // 不同引用
    });
  });

  // ── buildMemoryContext ──

  describe('buildMemoryContext', () => {
    it('空记忆应返回空字符串', () => {
      const mem = new AgentMemory();
      expect(mem.buildMemoryContext()).toBe('');
    });

    it('有记忆时应包含记忆内容', () => {
      const mem = new AgentMemory();
      mem.remember(1, 'event', '央行降息');
      const ctx = mem.buildMemoryContext();
      expect(ctx).toContain('你的最近记忆');
      expect(ctx).toContain('央行降息');
      expect(ctx).toContain('Tick 1');
    });

    it('有观点时应包含观点内容', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('AI', 0.5, 0.8, '看好', 1);
      const ctx = mem.buildMemoryContext();
      expect(ctx).toContain('你当前的观点');
      expect(ctx).toContain('AI');
      expect(ctx).toContain('看多');
    });

    it('看空观点应正确标记', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('房地产', -0.5, 0.6, '不看好', 1);
      const ctx = mem.buildMemoryContext();
      expect(ctx).toContain('看空');
    });

    it('stance === 0 应显示中立', () => {
      const mem = new AgentMemory();
      mem.updateOpinion('黄金', 0, 0.5, '观望中', 1);
      const ctx = mem.buildMemoryContext();
      expect(ctx).toContain('中立');
      expect(ctx).not.toContain('看多');
      expect(ctx).not.toContain('看空');
    });

    it('有长期记忆时应包含历史摘要', () => {
      const mem = new AgentMemory({
        shortTerm: [],
        longTerm: [
          {
            summary: '这是一段历史摘要',
            tickRange: [1, 20] as [number, number],
            keyInsights: ['洞察A', '洞察B'],
            createdAt: Date.now(),
          },
        ],
        opinions: {},
        predictions: [],
      });
      const ctx = mem.buildMemoryContext();
      expect(ctx).toContain('你的历史记忆摘要');
      expect(ctx).toContain('Tick 1-20');
      expect(ctx).toContain('这是一段历史摘要');
      expect(ctx).toContain('关键洞察');
      expect(ctx).toContain('洞察A');
      expect(ctx).toContain('洞察B');
    });

    it('长期记忆无 keyInsights 时不应输出关键洞察行', () => {
      const mem = new AgentMemory({
        shortTerm: [],
        longTerm: [
          {
            summary: '历史摘要',
            tickRange: [1, 10] as [number, number],
            keyInsights: [],
            createdAt: Date.now(),
          },
        ],
        opinions: {},
        predictions: [],
      });
      const ctx = mem.buildMemoryContext();
      expect(ctx).toContain('历史摘要');
      expect(ctx).not.toContain('关键洞察');
    });
  });

  // ── getLongTermMemories ──

  describe('getLongTermMemories', () => {
    it('默认应返回空数组', () => {
      const mem = new AgentMemory();
      expect(mem.getLongTermMemories()).toEqual([]);
    });

    it('应返回长期记忆的副本', () => {
      const longTermEntry = {
        summary: '长期记忆内容',
        tickRange: [1, 10] as [number, number],
        keyInsights: ['key1'],
        createdAt: Date.now(),
      };
      const mem = new AgentMemory({
        shortTerm: [],
        longTerm: [longTermEntry],
        opinions: {},
        predictions: [],
      });
      const result = mem.getLongTermMemories();
      expect(result).toHaveLength(1);
      expect(result[0]!.summary).toBe('长期记忆内容');
      // 验证是副本
      expect(result).not.toBe(mem.getLongTermMemories());
    });
  });

  // ── needsCompression ──

  describe('needsCompression', () => {
    it('短期记忆不足 30 条时不需要压缩', () => {
      const mem = new AgentMemory();
      for (let i = 0; i < 29; i++) {
        mem.remember(i, 'event', `记忆 ${i}`);
      }
      expect(mem.needsCompression()).toBe(false);
    });

    it('短期记忆等于 30 条时需要压缩', () => {
      const mem = new AgentMemory();
      for (let i = 0; i < 30; i++) {
        mem.remember(i, 'event', `记忆 ${i}`);
      }
      expect(mem.needsCompression()).toBe(true);
    });

    it('短期记忆超过 30 条时需要压缩', () => {
      const mem = new AgentMemory();
      for (let i = 0; i < 40; i++) {
        mem.remember(i, 'event', `记忆 ${i}`);
      }
      expect(mem.needsCompression()).toBe(true);
    });
  });

  // ── restore ──

  describe('restore', () => {
    it('应从已有状态恢复记忆', () => {
      const mem = new AgentMemory();
      mem.remember(1, 'event', '原始记忆');
      mem.updateOpinion('原始', 0.5, 0.5, '原始', 1);

      const restoreState = {
        shortTerm: [
          { tick: 10, type: 'event' as const, content: '恢复记忆1', importance: 0.8, emotionalImpact: 0.1 },
          { tick: 11, type: 'observation' as const, content: '恢复记忆2', importance: 0.6, emotionalImpact: -0.2 },
        ],
        longTerm: [
          {
            summary: '恢复的长期记忆',
            tickRange: [1, 5] as [number, number],
            keyInsights: ['洞察1'],
            createdAt: 1000,
          },
        ],
        opinions: {
          '恢复话题': { topic: '恢复话题', stance: -0.3, confidence: 0.7, reasoning: '恢复理由', lastUpdatedTick: 8 },
        },
        predictions: [{ tick: 5, prediction: '恢复预测' }],
      };

      mem.restore(restoreState);

      const state = mem.getState();
      expect(state.shortTerm).toHaveLength(2);
      expect(state.shortTerm[0]!.content).toBe('恢复记忆1');
      expect(state.longTerm).toHaveLength(1);
      expect(state.longTerm[0]!.summary).toBe('恢复的长期记忆');
      expect(state.opinions['恢复话题']!.stance).toBe(-0.3);
      expect(state.predictions).toHaveLength(1);
      expect(state.predictions[0]!.prediction).toBe('恢复预测');
    });

    it('restore 后应与原始状态对象解耦', () => {
      const mem = new AgentMemory();
      const restoreState = {
        shortTerm: [{ tick: 1, type: 'event' as const, content: '记忆', importance: 0.5, emotionalImpact: 0 }],
        longTerm: [],
        opinions: {},
        predictions: [],
      };
      mem.restore(restoreState);

      // 修改原始对象不应影响 AgentMemory 内部状态
      restoreState.shortTerm.push({ tick: 2, type: 'event' as const, content: '新增', importance: 0.5, emotionalImpact: 0 });
      expect(mem.getState().shortTerm).toHaveLength(1);
    });
  });

  // ── compress ──

  describe('compress', () => {
    /**
     * 创建 mock LLMClient
     */
    function createMockLLMClient(chatResponse?: string | Error): LLMClient {
      const mockClient = {
        chatCompletion: vi.fn(),
        getModel: vi.fn().mockReturnValue('mock-model'),
      } as unknown as LLMClient;

      if (chatResponse instanceof Error) {
        (mockClient.chatCompletion as ReturnType<typeof vi.fn>).mockRejectedValue(chatResponse);
      } else if (chatResponse !== undefined) {
        (mockClient.chatCompletion as ReturnType<typeof vi.fn>).mockResolvedValue(chatResponse);
      }

      return mockClient;
    }

    /**
     * 向 AgentMemory 批量添加 N 条短期记忆
     */
    function fillMemories(mem: AgentMemory, count: number, startTick: number = 1): void {
      for (let i = 0; i < count; i++) {
        mem.remember(startTick + i, 'event', `记忆内容 ${startTick + i}`, (i % 10) / 10, 0);
      }
    }

    it('短期记忆不足 30 条时应返回 null，不调用 LLM', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 20);
      const mockClient = createMockLLMClient('不应被调用');

      const result = await mem.compress(mockClient);
      expect(result).toBeNull();
      expect(mockClient.chatCompletion).not.toHaveBeenCalled();
    });

    it('LLM 返回有效 JSON 时应正确压缩', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 35);

      const llmResponse = JSON.stringify({
        summary: 'Tick 1-25 期间发生了很多重要事件',
        keyInsights: ['洞察1', '洞察2', '洞察3'],
      });
      const mockClient = createMockLLMClient(llmResponse);

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Tick 1-25 期间发生了很多重要事件');
      expect(result!.keyInsights).toEqual(['洞察1', '洞察2', '洞察3']);
      expect(result!.tickRange).toEqual([1, 25]);
      expect(result!.createdAt).toBeGreaterThan(0);

      // 短期记忆应保留最近 10 条
      expect(mem.getShortTermMemories()).toHaveLength(10);
      // 长期记忆应增加一条
      expect(mem.getLongTermMemories()).toHaveLength(1);
      expect(mem.getLongTermMemories()[0]!.summary).toBe('Tick 1-25 期间发生了很多重要事件');

      // LLM 应被调用一次
      expect(mockClient.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('LLM 返回包含多余文本的 JSON 时仍应正确解析', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 30);

      const llmResponse = '好的，这是压缩结果：\n```json\n{"summary": "摘要内容", "keyInsights": ["洞察X"]}\n```\n以上就是压缩。';
      const mockClient = createMockLLMClient(llmResponse);

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('摘要内容');
      expect(result!.keyInsights).toEqual(['洞察X']);
    });

    it('LLM 返回不含 JSON 的文本时应降级处理', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 30);

      const llmResponse = '这是一段完全没有 JSON 格式的文本，只是普通的描述性内容。';
      const mockClient = createMockLLMClient(llmResponse);

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      // 降级时将整个响应作为摘要
      expect(result!.summary).toBe(llmResponse);
      expect(result!.keyInsights).toEqual(['LLM 响应格式异常，已保留原始文本']);

      // 短期记忆仍应被裁剪
      expect(mem.getShortTermMemories()).toHaveLength(10);
      expect(mem.getLongTermMemories()).toHaveLength(1);
    });

    it('LLM 返回无效 JSON 时应降级处理', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 30);

      // JSON 格式错误（缺少引号）
      const llmResponse = '{summary: 无引号, keyInsights: [1, 2]}';
      const mockClient = createMockLLMClient(llmResponse);

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      expect(result!.keyInsights).toEqual(['LLM 响应格式异常，已保留原始文本']);
    });

    it('LLM 返回的 JSON 缺少必要字段时应降级处理', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 30);

      // JSON 有效但缺少 keyInsights 字段
      const llmResponse = JSON.stringify({ summary: '只有摘要，没有洞察' });
      const mockClient = createMockLLMClient(llmResponse);

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      // 因缺少 keyInsights，走降级路径
      expect(result!.keyInsights).toEqual(['LLM 响应格式异常，已保留原始文本']);
    });

    it('LLM 调用失败时应使用降级本地摘要', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 35);
      const mockClient = createMockLLMClient(new Error('API 超时'));

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      // 降级摘要应包含 tick 范围信息
      expect(result!.summary).toContain('Tick');
      expect(result!.summary).toContain('条记忆');
      // keyInsights 应包含最重要的记忆内容
      expect(result!.keyInsights.length).toBeGreaterThan(0);
      expect(result!.keyInsights.length).toBeLessThanOrEqual(5);

      // 短期记忆仍应被裁剪
      expect(mem.getShortTermMemories()).toHaveLength(10);
      // 长期记忆应增加一条
      expect(mem.getLongTermMemories()).toHaveLength(1);
    });

    it('压缩时应收集 tick 范围内的观点变化', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 35);

      // 添加在压缩范围 [1, 25] 内的观点
      mem.updateOpinion('AI', 0.8, 0.9, '看好AI', 5);
      mem.updateOpinion('区块链', -0.3, 0.6, '不看好区块链', 15);
      // 添加在压缩范围外的观点（不应被包含在 prompt 中）
      mem.updateOpinion('量子计算', 0.5, 0.4, '看好量子', 30);

      const llmResponse = JSON.stringify({
        summary: '带观点的压缩摘要',
        keyInsights: ['包含了观点变化的洞察'],
      });
      const mockClient = createMockLLMClient(llmResponse);

      await mem.compress(mockClient);

      // 验证 LLM 被调用时 prompt 包含观点信息
      const callArgs = (mockClient.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const userMessage = callArgs.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('AI');
      expect(userMessage.content).toContain('看多');
      expect(userMessage.content).toContain('区块链');
      expect(userMessage.content).toContain('看空');
      // 范围外的观点不应在 prompt 中
      expect(userMessage.content).not.toContain('量子计算');
    });

    it('观点 stance === 0 在压缩 prompt 中应显示为中立', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 30);
      mem.updateOpinion('黄金', 0, 0.5, '持观望态度', 5);

      const llmResponse = JSON.stringify({
        summary: '摘要',
        keyInsights: ['洞察'],
      });
      const mockClient = createMockLLMClient(llmResponse);

      await mem.compress(mockClient);

      const callArgs = (mockClient.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const userMessage = callArgs.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('中立');
    });

    it('连续两次压缩应正确累积长期记忆', async () => {
      const mem = new AgentMemory();

      // 第一批：35 条
      fillMemories(mem, 35, 1);
      const llmResponse1 = JSON.stringify({
        summary: '第一次压缩摘要',
        keyInsights: ['第一次洞察'],
      });
      const mockClient1 = createMockLLMClient(llmResponse1);
      await mem.compress(mockClient1);

      expect(mem.getShortTermMemories()).toHaveLength(10);
      expect(mem.getLongTermMemories()).toHaveLength(1);

      // 再添加 25 条（总共 35 条短期），触发第二次压缩
      fillMemories(mem, 25, 100);
      expect(mem.getShortTermMemories()).toHaveLength(35);

      const llmResponse2 = JSON.stringify({
        summary: '第二次压缩摘要',
        keyInsights: ['第二次洞察'],
      });
      const mockClient2 = createMockLLMClient(llmResponse2);
      await mem.compress(mockClient2);

      expect(mem.getShortTermMemories()).toHaveLength(10);
      expect(mem.getLongTermMemories()).toHaveLength(2);
      expect(mem.getLongTermMemories()[0]!.summary).toBe('第一次压缩摘要');
      expect(mem.getLongTermMemories()[1]!.summary).toBe('第二次压缩摘要');
    });

    it('LLM 返回的 keyInsights 包含非字符串元素时应被过滤', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 30);

      // keyInsights 包含非字符串元素
      const llmResponse = '{"summary": "摘要", "keyInsights": ["有效洞察", 123, null, "另一个洞察"]}';
      const mockClient = createMockLLMClient(llmResponse);

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      expect(result!.keyInsights).toEqual(['有效洞察', '另一个洞察']);
    });

    it('LLM 返回超长文本时降级摘要应截断到 500 字', async () => {
      const mem = new AgentMemory();
      fillMemories(mem, 30);

      // 返回超长的非 JSON 文本
      const longText = '这是很长的文本'.repeat(200);
      const mockClient = createMockLLMClient(longText);

      const result = await mem.compress(mockClient);

      expect(result).not.toBeNull();
      expect(result!.summary.length).toBeLessThanOrEqual(500);
    });
  });
});
