// ============================================================================
// @beeclaw/agent-runtime AgentMemory 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { AgentMemory } from './AgentMemory.js';

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
  });
});
