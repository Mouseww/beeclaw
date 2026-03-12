// ============================================================================
// @beeclaw/consensus SentimentAggregator 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { aggregateSentiment, type AgentResponseRecord } from './SentimentAggregator.js';

function createRecord(
  emotionalState: number,
  credibility: number = 0.5,
  action: string = 'speak',
  agentId: string = 'agent_1'
): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    credibility,
    response: {
      opinion: '测试观点',
      action: action as any,
      emotionalState,
      reasoning: '测试推理',
    },
  };
}

describe('aggregateSentiment', () => {
  // ── 空输入 ──

  it('空数组应返回默认值', () => {
    const result = aggregateSentiment([]);
    expect(result.distribution).toEqual({ bullish: 0, bearish: 0, neutral: 1 });
    expect(result.intensity).toBe(0);
    expect(result.averageEmotion).toBe(0);
    expect(result.consensus).toBe(0);
  });

  // ── 分布计算 ──

  describe('情绪分布', () => {
    it('全部看多应 bullish=1', () => {
      const records = [
        createRecord(0.5, 0.5, 'speak', 'a1'),
        createRecord(0.8, 0.5, 'speak', 'a2'),
        createRecord(0.3, 0.5, 'speak', 'a3'),
      ];
      const result = aggregateSentiment(records);
      expect(result.distribution.bullish).toBe(1);
      expect(result.distribution.bearish).toBe(0);
      expect(result.distribution.neutral).toBe(0);
    });

    it('全部看空应 bearish=1', () => {
      const records = [
        createRecord(-0.5, 0.5, 'speak', 'a1'),
        createRecord(-0.8, 0.5, 'speak', 'a2'),
      ];
      const result = aggregateSentiment(records);
      expect(result.distribution.bearish).toBe(1);
      expect(result.distribution.bullish).toBe(0);
    });

    it('全部中立应 neutral=1', () => {
      const records = [
        createRecord(0.0, 0.5, 'speak', 'a1'),
        createRecord(0.1, 0.5, 'speak', 'a2'),
        createRecord(-0.1, 0.5, 'speak', 'a3'),
      ];
      const result = aggregateSentiment(records);
      expect(result.distribution.neutral).toBe(1);
    });

    it('混合分布应正确计算比例', () => {
      const records = [
        createRecord(0.5, 0.5, 'speak', 'a1'),   // bullish
        createRecord(-0.5, 0.5, 'speak', 'a2'),  // bearish
        createRecord(0.0, 0.5, 'speak', 'a3'),   // neutral
        createRecord(0.8, 0.5, 'speak', 'a4'),   // bullish
      ];
      const result = aggregateSentiment(records);
      expect(result.distribution.bullish).toBe(0.5);   // 2/4
      expect(result.distribution.bearish).toBe(0.25);  // 1/4
      expect(result.distribution.neutral).toBe(0.25);  // 1/4
    });

    it('分布总和应为 1', () => {
      const records = [
        createRecord(0.5, 0.5, 'speak', 'a1'),
        createRecord(-0.5, 0.5, 'speak', 'a2'),
        createRecord(0.1, 0.5, 'speak', 'a3'),
      ];
      const result = aggregateSentiment(records);
      const sum = result.distribution.bullish + result.distribution.bearish + result.distribution.neutral;
      expect(sum).toBeCloseTo(1, 10);
    });
  });

  // ── 情绪激烈度 ──

  describe('intensity', () => {
    it('情绪为 0 时激烈度为 0', () => {
      const records = [
        createRecord(0.0, 0.5, 'speak', 'a1'),
        createRecord(0.0, 0.5, 'speak', 'a2'),
      ];
      const result = aggregateSentiment(records);
      expect(result.intensity).toBe(0);
    });

    it('极端情绪应有高激烈度', () => {
      const records = [
        createRecord(1.0, 0.5, 'speak', 'a1'),
        createRecord(-1.0, 0.5, 'speak', 'a2'),
      ];
      const result = aggregateSentiment(records);
      expect(result.intensity).toBe(1);
    });

    it('中等情绪应有中等激烈度', () => {
      const records = [
        createRecord(0.5, 0.5, 'speak', 'a1'),
        createRecord(-0.3, 0.5, 'speak', 'a2'),
      ];
      const result = aggregateSentiment(records);
      expect(result.intensity).toBeCloseTo(0.4, 10);
    });
  });

  // ── 加权平均情绪 ──

  describe('averageEmotion', () => {
    it('相同信誉的平均情绪', () => {
      const records = [
        createRecord(0.6, 0.5, 'speak', 'a1'),
        createRecord(0.4, 0.5, 'speak', 'a2'),
      ];
      const result = aggregateSentiment(records);
      // weight = 0.5 + 0.5*0.5 = 0.75 each
      // averageEmotion = (0.6*0.75 + 0.4*0.75) / (0.75+0.75) = 0.5
      expect(result.averageEmotion).toBeCloseTo(0.5, 5);
    });

    it('高信誉应有更大权重', () => {
      const records = [
        createRecord(1.0, 1.0, 'speak', 'a1'),  // weight = 0.5+1*0.5 = 1.0
        createRecord(-1.0, 0.0, 'speak', 'a2'), // weight = 0.5+0*0.5 = 0.5
      ];
      const result = aggregateSentiment(records);
      // (1.0*1.0 + (-1.0)*0.5) / (1.0+0.5) = 0.5/1.5 ≈ 0.333
      expect(result.averageEmotion).toBeCloseTo(1 / 3, 5);
    });
  });

  // ── 共识度 ──

  describe('consensus', () => {
    it('完全一致的情绪应有高共识度', () => {
      const records = [
        createRecord(0.5, 0.5, 'speak', 'a1'),
        createRecord(0.5, 0.5, 'speak', 'a2'),
        createRecord(0.5, 0.5, 'speak', 'a3'),
      ];
      const result = aggregateSentiment(records);
      expect(result.consensus).toBeCloseTo(1, 5);
    });

    it('极端分化的情绪应有低共识度', () => {
      const records = [
        createRecord(1.0, 0.5, 'speak', 'a1'),
        createRecord(-1.0, 0.5, 'speak', 'a2'),
      ];
      const result = aggregateSentiment(records);
      expect(result.consensus).toBeLessThan(0.5);
    });

    it('单个响应应有最高共识度', () => {
      const records = [createRecord(0.5, 0.5, 'speak', 'a1')];
      const result = aggregateSentiment(records);
      expect(result.consensus).toBeCloseTo(1, 5);
    });
  });
});
