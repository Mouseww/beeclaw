// ============================================================================
// BeeClaw Benchmark — AgentSpawner 批量孵化性能
// 测试 Agent 批量生成、模板匹配和事件触发孵化性能
// ============================================================================

import { bench, describe } from 'vitest';
import { Agent, AgentSpawner } from '@beeclaw/agent-runtime';
import type { AgentTemplate, SpawnRule, WorldEvent } from '@beeclaw/shared';

// ── 测试模板 ──────────────────────────────────────────────────────────────────

const FINANCIAL_TEMPLATE: AgentTemplate = {
  professionPool: [
    '金融分析师',
    '券商研究员',
    '基金经理',
    '散户投资者',
    '财经记者',
    '经济学家',
    '交易员',
    '风控经理',
  ],
  traitRanges: {
    riskTolerance: [0.2, 0.8],
    informationSensitivity: [0.3, 0.9],
    conformity: [0.1, 0.7],
    emotionality: [0.1, 0.8],
    analyticalDepth: [0.3, 0.9],
  },
  expertisePool: [
    ['宏观经济', '货币政策'],
    ['股票分析', '技术分析'],
    ['债券市场', '固定收益'],
    ['加密货币', '区块链'],
    ['外汇市场', '汇率分析'],
    ['大宗商品', '期货交易'],
  ],
  biasPool: [
    '确认偏见',
    '锚定效应',
    '损失厌恶',
    '群体从众',
    '过度自信',
    '近期偏见',
    '幸存者偏差',
    '沉没成本谬误',
  ],
};

const DIVERSE_TEMPLATE: AgentTemplate = {
  professionPool: [
    '软件工程师',
    '产品经理',
    '设计师',
    '数据科学家',
    '市场营销',
    '销售经理',
    '人力资源',
    '法务顾问',
    '媒体人',
    '学生',
    '退休人员',
    '自由职业者',
    '教师',
    '医生',
    '律师',
    '公务员',
  ],
  traitRanges: {
    riskTolerance: [0.1, 0.9],
    informationSensitivity: [0.1, 0.9],
    conformity: [0.1, 0.9],
    emotionality: [0.1, 0.9],
    analyticalDepth: [0.1, 0.9],
  },
  expertisePool: [
    ['技术', '编程'],
    ['金融', '投资'],
    ['法律', '合规'],
    ['医疗', '健康'],
    ['教育', '培训'],
    ['媒体', '传播'],
    ['社会', '心理'],
  ],
  biasPool: [
    '确认偏见',
    '锚定效应',
    '损失厌恶',
    '群体从众',
    '过度自信',
    '权威崇拜',
    '可得性偏误',
    '反权威',
  ],
};

function createTestEvent(tick: number, keywords: string[] = ['金融']): WorldEvent {
  return {
    id: `evt_spawn_${tick}`,
    type: 'external',
    category: 'finance',
    title: keywords.join(' '),
    content: `测试事件：${keywords.join('、')}`,
    source: 'benchmark',
    importance: 0.7,
    propagationRadius: 0.5,
    tick,
    tags: keywords,
  };
}

// ── spawnBatch 批量生成性能 ────────────────────────────────────────────────────

describe('AgentSpawner.spawnBatch — 批量孵化', () => {
  bench(
    '生成 10 个 Agent (金融模板)',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(10, 1, 'cheap', FINANCIAL_TEMPLATE);
    },
    { iterations: 200, warmupIterations: 20 },
  );

  bench(
    '生成 50 个 Agent (金融模板)',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(50, 1, 'cheap', FINANCIAL_TEMPLATE);
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    '生成 100 个 Agent (多样化模板)',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(100, 1, 'local', DIVERSE_TEMPLATE);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '生成 500 个 Agent (多样化模板)',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(500, 1, 'local', DIVERSE_TEMPLATE);
    },
    { iterations: 20, warmupIterations: 3 },
  );

  bench(
    '生成 1000 个 Agent (默认模板)',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(1000, 1, 'local');
    },
    { iterations: 10, warmupIterations: 2 },
  );
});

// ── 不同 ModelTier 生成性能 ────────────────────────────────────────────────────

describe('AgentSpawner — ModelTier 分布', () => {
  bench(
    '100 Agent — local tier',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(100, 1, 'local', FINANCIAL_TEMPLATE);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '100 Agent — cheap tier',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(100, 1, 'cheap', FINANCIAL_TEMPLATE);
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '100 Agent — strong tier',
    () => {
      const spawner = new AgentSpawner();
      spawner.spawnBatch(100, 1, 'strong', FINANCIAL_TEMPLATE);
    },
    { iterations: 50, warmupIterations: 5 },
  );
});

// ── 事件触发孵化性能 ──────────────────────────────────────────────────────────

describe('AgentSpawner — 事件触发孵化', () => {
  function createSpawnerWithRules(): AgentSpawner {
    const spawner = new AgentSpawner([
      {
        trigger: { type: 'event_keyword', keywords: ['金融', '利率'] },
        template: FINANCIAL_TEMPLATE,
        count: 5,
        modelTier: 'cheap',
      },
      {
        trigger: { type: 'event_keyword', keywords: ['科技', '人工智能'] },
        template: DIVERSE_TEMPLATE,
        count: 3,
        modelTier: 'local',
      },
      {
        trigger: { type: 'population_drop', threshold: 50 },
        template: DIVERSE_TEMPLATE,
        count: 10,
        modelTier: 'local',
      },
    ]);
    return spawner;
  }

  bench(
    '事件关键词触发 — 匹配命中',
    () => {
      const spawner = createSpawnerWithRules();
      spawner.checkEventTriggers(createTestEvent(1, ['金融', '利率']), 100, 1);
    },
    { iterations: 200, warmupIterations: 20 },
  );

  bench(
    '事件关键词触发 — 无匹配',
    () => {
      const spawner = createSpawnerWithRules();
      spawner.checkEventTriggers(createTestEvent(1, ['天气', '气象']), 100, 1);
    },
    { iterations: 200, warmupIterations: 20 },
  );

  bench(
    '定时触发检查 — 50 规则',
    () => {
      const rules: SpawnRule[] = [];
      for (let i = 0; i < 50; i++) {
        rules.push({
          trigger: { type: 'scheduled', intervalTicks: 10 + i },
          template: FINANCIAL_TEMPLATE,
          count: 2,
          modelTier: 'local',
        });
      }
      const spawner = new AgentSpawner(rules);
      spawner.checkScheduledTriggers(100, 50);
    },
    { iterations: 100, warmupIterations: 10 },
  );
});

// ── Agent 实例化性能（独立测试）───────────────────────────────────────────────

describe('Agent — 实例化性能', () => {
  bench(
    '100 Agent 直接构造',
    () => {
      const agents: Agent[] = [];
      for (let i = 0; i < 100; i++) {
        agents.push(
          new Agent({
            id: `agent_${i}`,
            name: `Agent-${i}`,
            modelTier: 'local',
            spawnedAtTick: 0,
          }),
        );
      }
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    '1000 Agent 直接构造',
    () => {
      const agents: Agent[] = [];
      for (let i = 0; i < 1000; i++) {
        agents.push(
          new Agent({
            id: `agent_${i}`,
            name: `Agent-${i}`,
            modelTier: 'local',
            spawnedAtTick: 0,
          }),
        );
      }
    },
    { iterations: 20, warmupIterations: 3 },
  );
});
