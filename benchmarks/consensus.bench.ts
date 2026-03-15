// ============================================================================
// BeeClaw Benchmark — ConsensusEngine 聚合性能
// 测试大量 Agent 响应的情绪聚合和共识分析性能
// ============================================================================

import { bench, describe } from 'vitest';
import { ConsensusEngine, aggregateSentiment } from '@beeclaw/consensus';
import type { WorldEvent, AgentResponseRecord } from '@beeclaw/shared';

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function createTestEvent(tick: number, topic: string = '央行降息'): WorldEvent {
  return {
    id: `evt_bench_${tick}`,
    type: 'external',
    category: 'finance',
    title: topic,
    content: `${topic} — 市场测试事件`,
    source: 'benchmark',
    importance: 0.7,
    propagationRadius: 0.5,
    tick,
    tags: ['金融'],
  };
}

function createBullishRecord(agentId: string, credibility = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent-${agentId}`,
    credibility,
    response: {
      opinion: '看好后市',
      action: 'speak',
      emotionalState: 0.4 + Math.random() * 0.5,
      reasoning: '基本面向好',
    },
  };
}

function createBearishRecord(agentId: string, credibility = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent-${agentId}`,
    credibility,
    response: {
      opinion: '看空后市',
      action: 'speak',
      emotionalState: -(0.3 + Math.random() * 0.5),
      reasoning: '经济下行',
    },
  };
}

function createNeutralRecord(agentId: string, credibility = 0.5): AgentResponseRecord {
  return {
    agentId,
    agentName: `Agent-${agentId}`,
    credibility,
    response: {
      opinion: '保持观望',
      action: 'silent',
      emotionalState: (Math.random() - 0.5) * 0.2,
      reasoning: '信息不明',
    },
  };
}

function generateMixedResponses(count: number): AgentResponseRecord[] {
  const records: AgentResponseRecord[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const id = `agent_${i}`;
    const credibility = 0.2 + Math.random() * 0.6;
    if (r < 0.4) {
      records.push(createBullishRecord(id, credibility));
    } else if (r < 0.75) {
      records.push(createBearishRecord(id, credibility));
    } else {
      records.push(createNeutralRecord(id, credibility));
    }
  }
  return records;
}

// ── aggregateSentiment 纯函数性能 ──────────────────────────────────────────────

describe('aggregateSentiment — 情绪聚合', () => {
  const responses50 = generateMixedResponses(50);
  const responses200 = generateMixedResponses(200);
  const responses500 = generateMixedResponses(500);
  const responses1000 = generateMixedResponses(1000);
  const responses5000 = generateMixedResponses(5000);

  bench(
    '50 条响应聚合',
    () => {
      aggregateSentiment(responses50);
    },
    { iterations: 500, warmupIterations: 50 },
  );

  bench(
    '200 条响应聚合',
    () => {
      aggregateSentiment(responses200);
    },
    { iterations: 200, warmupIterations: 20 },
  );

  bench(
    '500 条响应聚合',
    () => {
      aggregateSentiment(responses500);
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    '1000 条响应聚合',
    () => {
      aggregateSentiment(responses1000);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '5000 条响应聚合',
    () => {
      aggregateSentiment(responses5000);
    },
    { iterations: 20, warmupIterations: 3 },
  );
});

// ── ConsensusEngine.analyze 完整流程 ──────────────────────────────────────────

describe('ConsensusEngine.analyze — 完整共识分析', () => {
  bench(
    '100 条响应 — 单次分析',
    () => {
      const engine = new ConsensusEngine();
      const event = createTestEvent(1);
      const responses = generateMixedResponses(100);
      engine.analyze(1, event, responses);
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    '500 条响应 — 单次分析',
    () => {
      const engine = new ConsensusEngine();
      const event = createTestEvent(1);
      const responses = generateMixedResponses(500);
      engine.analyze(1, event, responses);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '1000 条响应 — 单次分析',
    () => {
      const engine = new ConsensusEngine();
      const event = createTestEvent(1);
      const responses = generateMixedResponses(1000);
      engine.analyze(1, event, responses);
    },
    { iterations: 30, warmupIterations: 3 },
  );
});

// ── 多轮累积分析（趋势检测）───────────────────────────────────────────────────

describe('ConsensusEngine — 多轮趋势检测', () => {
  bench(
    '20 tick × 100 响应/tick — 趋势累积',
    () => {
      const engine = new ConsensusEngine();
      for (let t = 1; t <= 20; t++) {
        const event = createTestEvent(t, '央行利率决策');
        const responses = generateMixedResponses(100);
        engine.analyze(t, event, responses);
      }
    },
    { iterations: 20, warmupIterations: 3 },
  );

  bench(
    '50 tick × 200 响应/tick — 趋势累积',
    () => {
      const engine = new ConsensusEngine();
      for (let t = 1; t <= 50; t++) {
        const event = createTestEvent(t, '央行利率决策');
        const responses = generateMixedResponses(200);
        engine.analyze(t, event, responses);
      }
    },
    { iterations: 10, warmupIterations: 2 },
  );
});

// ── 多主题并发分析 ─────────────────────────────────────────────────────────────

describe('ConsensusEngine — 多主题并发', () => {
  const topics = ['央行利率', '科技股走势', '房地产政策', '加密货币', '就业数据'];

  bench(
    '5 主题 × 100 响应/主题 — 并发分析',
    () => {
      const engine = new ConsensusEngine();
      for (const topic of topics) {
        const event = createTestEvent(1, topic);
        const responses = generateMixedResponses(100);
        engine.analyze(1, event, responses);
      }
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '5 主题 × 500 响应/主题 — 并发分析',
    () => {
      const engine = new ConsensusEngine();
      for (const topic of topics) {
        const event = createTestEvent(1, topic);
        const responses = generateMixedResponses(500);
        engine.analyze(1, event, responses);
      }
    },
    { iterations: 20, warmupIterations: 3 },
  );
});
