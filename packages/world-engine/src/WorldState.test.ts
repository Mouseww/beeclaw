// ============================================================================
// @beeclaw/world-engine WorldState 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { WorldStateManager } from './WorldState.js';
import type { WorldEvent } from '@beeclaw/shared';

function createTestEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 'evt_test',
    type: 'external',
    category: 'finance',
    title: '测试事件',
    content: '测试内容',
    source: 'manual',
    importance: 0.5,
    propagationRadius: 0.3,
    tick: 1,
    tags: [],
    ...overrides,
  };
}

describe('WorldStateManager', () => {
  // ── 构造 ──

  describe('构造函数', () => {
    it('默认状态应正确初始化', () => {
      const mgr = new WorldStateManager();
      const state = mgr.getState();
      expect(state.tick).toBe(0);
      expect(state.timestamp).toBeInstanceOf(Date);
      expect(state.globalFacts).toEqual([]);
      expect(state.sentiment).toEqual({});
      expect(state.activeEvents).toEqual([]);
      expect(state.agentCount).toBe(0);
    });

    it('应支持部分初始状态', () => {
      const mgr = new WorldStateManager({ tick: 10, agentCount: 50 });
      const state = mgr.getState();
      expect(state.tick).toBe(10);
      expect(state.agentCount).toBe(50);
      expect(state.globalFacts).toEqual([]); // 未指定的使用默认值
    });
  });

  // ── advanceTick ──

  describe('advanceTick', () => {
    it('应更新 tick 和 timestamp', () => {
      const mgr = new WorldStateManager();
      mgr.advanceTick(5);
      expect(mgr.getCurrentTick()).toBe(5);
      expect(mgr.getState().timestamp).toBeInstanceOf(Date);
    });
  });

  // ── setAgentCount ──

  describe('setAgentCount', () => {
    it('应更新 Agent 数量', () => {
      const mgr = new WorldStateManager();
      mgr.setAgentCount(100);
      expect(mgr.getState().agentCount).toBe(100);
    });
  });

  // ── addFact ──

  describe('addFact', () => {
    it('应添加全局事实', () => {
      const mgr = new WorldStateManager();
      mgr.addFact('事实1');
      mgr.addFact('事实2');
      expect(mgr.getState().globalFacts).toEqual(['事实1', '事实2']);
    });

    it('超过 100 条应保留最近 100 条', () => {
      const mgr = new WorldStateManager();
      for (let i = 0; i < 110; i++) {
        mgr.addFact(`事实 ${i}`);
      }
      const facts = mgr.getState().globalFacts;
      expect(facts).toHaveLength(100);
      expect(facts[0]).toBe('事实 10');
      expect(facts[99]).toBe('事实 109');
    });
  });

  // ── updateSentiment ──

  describe('updateSentiment', () => {
    it('应添加/更新情绪值', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiment('AI', 0.8);
      expect(mgr.getState().sentiment['AI']).toBe(0.8);
    });

    it('应限制在 -1 ~ 1', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiment('过高', 5.0);
      expect(mgr.getState().sentiment['过高']).toBe(1);
      mgr.updateSentiment('过低', -3.0);
      expect(mgr.getState().sentiment['过低']).toBe(-1);
    });
  });

  // ── updateSentiments ──

  describe('updateSentiments', () => {
    it('应批量更新情绪', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiments({ 'A': 0.5, 'B': -0.3 });
      const s = mgr.getState().sentiment;
      expect(s['A']).toBe(0.5);
      expect(s['B']).toBe(-0.3);
    });
  });

  // ── setActiveEvents ──

  describe('setActiveEvents', () => {
    it('应设置活跃事件', () => {
      const mgr = new WorldStateManager();
      const events = [createTestEvent(), createTestEvent({ id: 'evt_2' })];
      mgr.setActiveEvents(events);
      expect(mgr.getState().activeEvents).toHaveLength(2);
    });
  });

  // ── getState ──

  describe('getState', () => {
    it('应返回状态副本', () => {
      const mgr = new WorldStateManager();
      const state1 = mgr.getState();
      const state2 = mgr.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // 不同引用
    });
  });

  // ── formatStatus ──

  describe('formatStatus', () => {
    it('应返回格式化的字符串', () => {
      const mgr = new WorldStateManager();
      mgr.advanceTick(10);
      mgr.setAgentCount(50);
      mgr.updateSentiment('测试话题', 0.5);
      const status = mgr.formatStatus();
      expect(status).toContain('BeeWorld');
      expect(status).toContain('Tick: 10');
      expect(status).toContain('Agent 数量: 50');
      expect(status).toContain('测试话题');
    });

    it('有活跃事件时应显示事件', () => {
      const mgr = new WorldStateManager();
      mgr.setActiveEvents([createTestEvent({ title: '重大事件' })]);
      const status = mgr.formatStatus();
      expect(status).toContain('重大事件');
    });

    it('负情绪值应显示 📉', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiment('悲观话题', -0.5);
      const status = mgr.formatStatus();
      expect(status).toContain('📉');
      expect(status).toContain('悲观话题');
      expect(status).toContain('-0.50');
    });

    it('正情绪值应显示 📈 和 + 前缀', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiment('乐观话题', 0.7);
      const status = mgr.formatStatus();
      expect(status).toContain('📈');
      expect(status).toContain('+0.70');
    });

    it('零情绪值应显示 ➡️', () => {
      const mgr = new WorldStateManager();
      mgr.updateSentiment('中性话题', 0);
      const status = mgr.formatStatus();
      expect(status).toContain('➡️');
    });

    it('无情绪和无事件时不应显示对应区域', () => {
      const mgr = new WorldStateManager();
      const status = mgr.formatStatus();
      expect(status).not.toContain('情绪地图');
      expect(status).not.toContain('最近事件');
    });

    it('超过 10 个情绪条目时只显示前 10 个', () => {
      const mgr = new WorldStateManager();
      for (let i = 0; i < 15; i++) {
        mgr.updateSentiment(`话题${i}`, i * 0.05);
      }
      const status = mgr.formatStatus();
      expect(status).toContain('情绪地图');
      const lines = status.split('\n');
      const sentimentLines = lines.filter(l => l.includes('📈') || l.includes('📉') || l.includes('➡️'));
      expect(sentimentLines.length).toBeLessThanOrEqual(10);
    });

    it('超过 5 个活跃事件时只显示最近 5 个', () => {
      const mgr = new WorldStateManager();
      const events = Array.from({ length: 8 }, (_, i) =>
        createTestEvent({ id: `evt_${i}`, title: `事件${i}` })
      );
      mgr.setActiveEvents(events);
      const status = mgr.formatStatus();
      expect(status).toContain('最近事件');
      expect(status).toContain('事件3');
      expect(status).toContain('事件7');
    });
  });

  // ── getCurrentTick ──

  describe('getCurrentTick', () => {
    it('应返回当前 tick', () => {
      const mgr = new WorldStateManager({ tick: 42 });
      expect(mgr.getCurrentTick()).toBe(42);
    });

    it('advanceTick 后应更新', () => {
      const mgr = new WorldStateManager();
      mgr.advanceTick(100);
      expect(mgr.getCurrentTick()).toBe(100);
    });
  });
});
