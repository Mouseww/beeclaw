// ============================================================================
// @beeclaw/consensus ConsensusEngine 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ConsensusEngine } from './ConsensusEngine.js';
import type { AgentResponseRecord } from './SentimentAggregator.js';
import type { TargetAnalysis, WorldEvent } from '@beeclaw/shared';

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

function createBullishRecord(agentId: string, emotion: number = 0.6, credibility: number = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    credibility,
    response: {
      opinion: '看好后市',
      action: 'speak',
      emotionalState: emotion,
      reasoning: '基本面向好',
    },
  };
}

function createBearishRecord(agentId: string, emotion: number = -0.6, credibility: number = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    credibility,
    response: {
      opinion: '看空后市',
      action: 'speak',
      emotionalState: emotion,
      reasoning: '风险增大',
    },
  };
}

function createNeutralRecord(agentId: string, credibility: number = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    credibility,
    response: {
      opinion: '观望',
      action: 'silent',
      emotionalState: 0.0,
      reasoning: '等待更多信息',
    },
  };
}

function createTargetAnalysis(overrides: Partial<TargetAnalysis> = {}): TargetAnalysis {
  return {
    name: 'AAPL',
    category: 'stock',
    stance: 0.6,
    confidence: 0.8,
    reasoning: '基本面向好',
    ...overrides,
  };
}

function createTargetRecord(
  agentId: string,
  targets: TargetAnalysis[],
  credibility: number = 0.5
): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    credibility,
    response: {
      opinion: '给出标的判断',
      action: 'predict',
      emotionalState: 0.4,
      reasoning: '综合分析后给出判断',
      targets,
    },
  };
}

describe('ConsensusEngine', () => {
  // ── analyze 基本功能 ──

  describe('analyze', () => {
    it('应返回正确的共识信号结构', () => {
      const engine = new ConsensusEngine();
      const event = createTestEvent();
      const responses = [
        createBullishRecord('a1'),
        createBearishRecord('a2'),
        createNeutralRecord('a3'),
      ];

      const signal = engine.analyze(1, event, responses);
      expect(signal.topic).toBe('央行降息');
      expect(signal.tick).toBe(1);
      expect(signal.sentimentDistribution).toBeDefined();
      expect(signal.intensity).toBeGreaterThanOrEqual(0);
      expect(signal.consensus).toBeGreaterThanOrEqual(0);
      expect(signal.trend).toBeDefined();
      expect(signal.topArguments).toBeDefined();
      expect(signal.alerts).toBeDefined();
    });

    it('空响应列表应正常工作', () => {
      const engine = new ConsensusEngine();
      const signal = engine.analyze(1, createTestEvent(), []);
      expect(signal.sentimentDistribution.neutral).toBe(1);
      expect(signal.intensity).toBe(0);
    });

    it('应将信号保存到历史中', () => {
      const engine = new ConsensusEngine();
      engine.analyze(1, createTestEvent(), [createBullishRecord('a1')]);
      engine.analyze(2, createTestEvent(), [createBearishRecord('a2')]);
      const history = engine.getSignalHistory('央行降息');
      expect(history).toHaveLength(2);
      expect(history[0]!.tick).toBe(1);
      expect(history[1]!.tick).toBe(2);
    });

    it('历史信号应保留最近 50 个', () => {
      const engine = new ConsensusEngine();
      const event = createTestEvent();
      for (let i = 0; i < 55; i++) {
        engine.analyze(i, event, [createBullishRecord('a1')]);
      }
      const history = engine.getSignalHistory('央行降息');
      expect(history).toHaveLength(50);
      expect(history[0]!.tick).toBe(5); // 前 5 个被丢弃
    });
  });

  // ── topArguments ──

  describe('topArguments', () => {
    it('speak/predict 动作的响应应提取论点', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createBullishRecord('a1', 0.6),
        createBullishRecord('a2', 0.7),
        createBearishRecord('a3', -0.5),
      ];
      const signal = engine.analyze(1, createTestEvent(), responses);
      expect(signal.topArguments.length).toBeGreaterThan(0);
    });

    it('全部 silent 动作不应产生论点', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createNeutralRecord('a1'),
        createNeutralRecord('a2'),
      ];
      const signal = engine.analyze(1, createTestEvent(), responses);
      expect(signal.topArguments).toHaveLength(0);
    });

    it('论点应按支持者人数排序', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createBullishRecord('a1'),
        createBullishRecord('a2'),
        createBullishRecord('a3'),
        createBearishRecord('a4'),
      ];
      const signal = engine.analyze(1, createTestEvent(), responses);
      if (signal.topArguments.length >= 2) {
        expect(signal.topArguments[0]!.supporters).toBeGreaterThanOrEqual(
          signal.topArguments[1]!.supporters
        );
      }
    });
  });

  // ── trend 检测 ──

  describe('trend', () => {
    it('首次分析应返回 forming', () => {
      const engine = new ConsensusEngine();
      const signal = engine.analyze(1, createTestEvent(), [createBullishRecord('a1')]);
      expect(signal.trend).toBe('forming');
    });

    it('历史不足两条时应持续返回 forming', () => {
      const engine = new ConsensusEngine();
      engine.analyze(1, createTestEvent(), [createBullishRecord('a1')]);
      const signal2 = engine.analyze(2, createTestEvent(), [createBullishRecord('a2')]);
      expect(signal2.trend).toBe('forming');
    });

    it('变化极小且共识较高时应检测到 strengthening', () => {
      const engine = new ConsensusEngine();
      engine.analyze(1, createTestEvent(), [
        createBullishRecord('a1', 0.6),
        createBullishRecord('a2', 0.7),
        createBullishRecord('a3', 0.65),
      ]);
      engine.analyze(2, createTestEvent(), [
        createBullishRecord('a1', 0.6),
        createBullishRecord('a2', 0.7),
        createBullishRecord('a3', 0.65),
      ]);
      const signal3 = engine.analyze(3, createTestEvent(), [
        createBullishRecord('a1', 0.2),
        createBullishRecord('a2', 0.3),
        createBullishRecord('a3', 0.4),
      ]);
      expect(signal3.trend).toBe('strengthening');
    });

    it('变化极小且共识较低时应保持 forming', () => {
      const engine = new ConsensusEngine();
      engine.analyze(1, createTestEvent(), [
        createBullishRecord('a1', 0.7),
        createBullishRecord('a2', 0.6),
        createBearishRecord('a3', -0.6),
      ]);
      engine.analyze(2, createTestEvent(), [
        createBullishRecord('a1', 0.7),
        createBullishRecord('a2', 0.6),
        createBearishRecord('a3', -0.6),
      ]);
      const signal3 = engine.analyze(3, createTestEvent(), [
        createBullishRecord('a1', 1.0),
        createBullishRecord('a2', 0.2),
        createBearishRecord('a3', -0.2),
      ]);
      expect(signal3.trend).toBe('forming');
    });

    it('方向反转时应检测到 reversing', () => {
      const engine = new ConsensusEngine();
      // 第一次：全部看多
      engine.analyze(1, createTestEvent(), [
        createBullishRecord('a1', 0.8),
        createBullishRecord('a2', 0.7),
        createBullishRecord('a3', 0.9),
      ]);
      // 第二次：也看多（建立趋势）
      engine.analyze(2, createTestEvent(), [
        createBullishRecord('a1', 0.8),
        createBullishRecord('a2', 0.7),
        createBullishRecord('a3', 0.9),
      ]);
      // 第三次：全部看空（反转）
      const signal3 = engine.analyze(3, createTestEvent(), [
        createBearishRecord('a1', -0.8),
        createBearishRecord('a2', -0.7),
        createBearishRecord('a3', -0.9),
      ]);
      expect(signal3.trend).toBe('reversing');
    });

    it('同方向情绪增强时应检测到 strengthening', () => {
      const engine = new ConsensusEngine();
      // 第一次：温和看多
      engine.analyze(1, createTestEvent(), [
        createBullishRecord('a1', 0.3),
        createBullishRecord('a2', 0.3),
        createNeutralRecord('a3'),
      ]);
      // 第二次：温和看多（建立历史）
      engine.analyze(2, createTestEvent(), [
        createBullishRecord('a1', 0.4),
        createBullishRecord('a2', 0.3),
        createNeutralRecord('a3'),
      ]);
      // 第三次：更强烈的看多（增强）
      const signal3 = engine.analyze(3, createTestEvent(), [
        createBullishRecord('a1', 0.9),
        createBullishRecord('a2', 0.9),
        createBullishRecord('a3', 0.8),
      ]);
      expect(signal3.trend).toBe('strengthening');
    });

    it('同方向情绪减弱时应检测到 weakening', () => {
      const engine = new ConsensusEngine();
      // 第一次：强烈看多
      engine.analyze(1, createTestEvent(), [
        createBullishRecord('a1', 0.9),
        createBullishRecord('a2', 0.9),
        createBullishRecord('a3', 0.9),
      ]);
      // 第二次：强烈看多（建立历史）
      engine.analyze(2, createTestEvent(), [
        createBullishRecord('a1', 0.9),
        createBullishRecord('a2', 0.8),
        createBullishRecord('a3', 0.9),
      ]);
      // 第三次：温和看多（减弱，但同方向）
      const signal3 = engine.analyze(3, createTestEvent(), [
        createBullishRecord('a1', 0.3),
        createBullishRecord('a2', 0.3),
        createNeutralRecord('a3'),
      ]);
      expect(signal3.trend).toBe('weakening');
    });
  });

  // ── targetSentiments 聚合 ──

  describe('targetSentiments', () => {
    it('单个标的分析时应输出 targetSentiments', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createTargetRecord('a1', [createTargetAnalysis({ name: 'AAPL', stance: 0.8, confidence: 0.9 })], 0.7),
      ];

      const signal = engine.analyze(1, createTestEvent(), responses);

      expect(signal.targetSentiments).toHaveLength(1);
      expect(signal.targetSentiments?.[0]).toMatchObject({
        name: 'AAPL',
        category: 'stock',
        bullish: 1,
        bearish: 0,
        neutral: 0,
      });
      expect(signal.targetSentiments?.[0]?.avgStance).toBeCloseTo(0.8);
      expect(signal.targetSentiments?.[0]?.avgConfidence).toBeCloseTo(0.9);
    });

    it('应按 credibility 加权聚合同一标的的 stance', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createTargetRecord('a1', [createTargetAnalysis({ name: 'TSLA', stance: 1, confidence: 0.9 })], 1),
        createTargetRecord('a2', [createTargetAnalysis({ name: 'TSLA', stance: -1, confidence: 0.4 })], 0),
      ];

      const signal = engine.analyze(1, createTestEvent(), responses);
      const target = signal.targetSentiments?.[0];

      expect(target).toBeDefined();
      expect(target?.name).toBe('TSLA');
      expect(target?.bullish).toBe(1);
      expect(target?.bearish).toBe(1);
      expect(target?.neutral).toBe(0);
      expect(target?.avgStance).toBeCloseTo(1 / 3, 5);
      expect(target?.avgConfidence).toBeCloseTo(0.65);
    });

    it('应合并不同大小写的同名标的', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createTargetRecord('a1', [createTargetAnalysis({ name: 'btc', category: 'crypto', stance: 0.7 })], 0.6),
        createTargetRecord('a2', [createTargetAnalysis({ name: 'BTC', category: 'crypto', stance: 0.1 })], 0.4),
      ];

      const signal = engine.analyze(1, createTestEvent(), responses);

      expect(signal.targetSentiments).toHaveLength(1);
      expect(signal.targetSentiments?.[0]).toMatchObject({
        name: 'BTC',
        category: 'crypto',
        bullish: 1,
        bearish: 0,
        neutral: 1,
      });
    });

    it('多个标的时应按参与人数降序排序', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createTargetRecord('a1', [createTargetAnalysis({ name: 'AAPL', stance: 0.7 })]),
        createTargetRecord('a2', [createTargetAnalysis({ name: 'AAPL', stance: 0.6 })]),
        createTargetRecord('a3', [createTargetAnalysis({ name: 'MSFT', stance: -0.8 })]),
      ];

      const signal = engine.analyze(1, createTestEvent(), responses);

      expect(signal.targetSentiments).toHaveLength(2);
      expect(signal.targetSentiments?.map(target => target.name)).toEqual(['AAPL', 'MSFT']);
    });

    it('空 targets 或缺失 targets 时不应输出 targetSentiments', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createBullishRecord('a1'),
        createTargetRecord('a2', []),
      ];

      const signal = engine.analyze(1, createTestEvent(), responses);

      expect(signal.targetSentiments).toBeUndefined();
    });
  });

  // ── alerts 检测 ──

  describe('alerts', () => {
    it('高激烈度应触发 sentiment_shift 预警', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createBullishRecord('a1', 0.9),
        createBearishRecord('a2', -0.9),
        createBullishRecord('a3', 0.8),
        createBearishRecord('a4', -0.8),
      ];
      const signal = engine.analyze(1, createTestEvent(), responses);
      // intensity = avg(|0.9|, |-0.9|, |0.8|, |-0.8|) = avg(0.9,0.9,0.8,0.8) = 0.85 > 0.7
      const sentimentShift = signal.alerts.find(a => a.type === 'sentiment_shift');
      expect(sentimentShift).toBeDefined();
    });

    it('低共识度且人数足够应触发 consensus_break 预警', () => {
      const engine = new ConsensusEngine();
      // 生成高度分化的响应
      const responses = [
        createBullishRecord('a1', 0.9),
        createBearishRecord('a2', -0.9),
        createBullishRecord('a3', 0.8),
        createBearishRecord('a4', -0.8),
        createBullishRecord('a5', 0.7),
      ];
      const signal = engine.analyze(1, createTestEvent(), responses);
      // 如果 consensus < 0.3 且 responses.length >= 5 应触发
      if (signal.consensus < 0.3) {
        const consensusBreak = signal.alerts.find(a => a.type === 'consensus_break');
        expect(consensusBreak).toBeDefined();
      }
    });

    it('平稳情绪不应产生预警', () => {
      const engine = new ConsensusEngine();
      const responses = [
        createNeutralRecord('a1'),
        createNeutralRecord('a2'),
      ];
      const signal = engine.analyze(1, createTestEvent(), responses);
      // 全部 silent 不会触发 topArguments 相关的预警
      const sentimentShift = signal.alerts.find(a => a.type === 'sentiment_shift');
      expect(sentimentShift).toBeUndefined();
    });

    it('逆向者涌现应触发 contrarian_surge 预警', () => {
      const engine = new ConsensusEngine();
      // 大部分看多，但有足够多的逆向者
      const responses: AgentResponseRecord[] = [];
      // 7 个看多
      for (let i = 0; i < 7; i++) {
        responses.push(createBullishRecord(`bull_${i}`, 0.6));
      }
      // 3 个强烈看空（逆向者）
      for (let i = 0; i < 3; i++) {
        responses.push(createBearishRecord(`bear_${i}`, -0.5));
      }
      const signal = engine.analyze(1, createTestEvent(), responses);
      const contrarianSurge = signal.alerts.find(a => a.type === 'contrarian_surge');
      expect(contrarianSurge).toBeDefined();
    });
  });

  // ── 查询方法 ──

  describe('查询方法', () => {
    it('getSignalHistory 不存在的话题应返回空数组', () => {
      const engine = new ConsensusEngine();
      expect(engine.getSignalHistory('不存在的话题')).toEqual([]);
    });

    it('getAllTopics 应返回所有分析过的话题', () => {
      const engine = new ConsensusEngine();
      engine.analyze(1, createTestEvent({ title: '话题A' }), [createBullishRecord('a1')]);
      engine.analyze(2, createTestEvent({ title: '话题B' }), [createBearishRecord('a2')]);
      const topics = engine.getAllTopics();
      expect(topics).toContain('话题A');
      expect(topics).toContain('话题B');
      expect(topics).toHaveLength(2);
    });

    it('getLatestSignals 应返回每个话题的最新信号', () => {
      const engine = new ConsensusEngine();
      engine.analyze(1, createTestEvent({ title: '话题A' }), [createBullishRecord('a1')]);
      engine.analyze(2, createTestEvent({ title: '话题A' }), [createBearishRecord('a2')]);
      engine.analyze(3, createTestEvent({ title: '话题B' }), [createNeutralRecord('a3')]);

      const latest = engine.getLatestSignals();
      expect(latest).toHaveLength(2);
      const topicATick = latest.find(s => s.topic === '话题A');
      expect(topicATick?.tick).toBe(2);
    });
  });

  describe('持久化恢复', () => {
    it('restoreSignals 应按 tick 排序恢复历史', () => {
      const engine = new ConsensusEngine();

      engine.restoreSignals([
        {
          topic: '恢复话题',
          tick: 3,
          sentimentDistribution: { bullish: 1, bearish: 0, neutral: 0 },
          intensity: 0.8,
          consensus: 0.9,
          trend: 'forming',
          topArguments: [],
          alerts: [],
        },
        {
          topic: '恢复话题',
          tick: 1,
          sentimentDistribution: { bullish: 0, bearish: 1, neutral: 0 },
          intensity: 0.8,
          consensus: 0.9,
          trend: 'forming',
          topArguments: [],
          alerts: [],
        },
        {
          topic: '恢复话题',
          tick: 2,
          sentimentDistribution: { bullish: 0, bearish: 0, neutral: 1 },
          intensity: 0,
          consensus: 1,
          trend: 'forming',
          topArguments: [],
          alerts: [],
        },
      ]);

      expect(engine.getSignalHistory('恢复话题').map(signal => signal.tick)).toEqual([1, 2, 3]);
    });

    it('restoreSignals 应合并不同话题并分别排序', () => {
      const engine = new ConsensusEngine();

      engine.restoreSignals([
        {
          topic: '话题A',
          tick: 3,
          sentimentDistribution: { bullish: 1, bearish: 0, neutral: 0 },
          intensity: 0.6,
          consensus: 0.8,
          trend: 'forming',
          topArguments: [],
          alerts: [],
        },
        {
          topic: '话题B',
          tick: 2,
          sentimentDistribution: { bullish: 0, bearish: 1, neutral: 0 },
          intensity: 0.6,
          consensus: 0.8,
          trend: 'forming',
          topArguments: [],
          alerts: [],
        },
        {
          topic: '话题A',
          tick: 1,
          sentimentDistribution: { bullish: 0, bearish: 0, neutral: 1 },
          intensity: 0,
          consensus: 1,
          trend: 'forming',
          topArguments: [],
          alerts: [],
        },
      ]);

      expect(engine.getSignalHistory('话题A').map(signal => signal.tick)).toEqual([1, 3]);
      expect(engine.getSignalHistory('话题B').map(signal => signal.tick)).toEqual([2]);
    });

    it('restoreSignals 应仅保留最近 50 条历史', () => {
      const engine = new ConsensusEngine();
      const signals = Array.from({ length: 55 }, (_, index) => ({
        topic: '长历史话题',
        tick: 55 - index,
        sentimentDistribution: { bullish: 1, bearish: 0, neutral: 0 },
        intensity: 0.5,
        consensus: 0.8,
        trend: 'forming' as const,
        topArguments: [],
        alerts: [],
      }));

      engine.restoreSignals(signals);

      const history = engine.getSignalHistory('长历史话题');
      expect(history).toHaveLength(50);
      expect(history[0]?.tick).toBe(6);
      expect(history.at(-1)?.tick).toBe(55);
    });
  });
});
