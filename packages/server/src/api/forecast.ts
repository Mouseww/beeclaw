// ============================================================================
// BeeClaw Server — API: /api/forecast  用户输入式推演入口
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { WorldEngine } from '@beeclaw/world-engine';
import {
  financeMarketTemplate,
  policyImpactTemplate,
  productLaunchTemplate,
  type EventCategory,
  type ScenarioTemplate,
} from '@beeclaw/shared';
import type { ServerContext } from '../index.js';
import { forecastSchema } from './schemas.js';

const SCENARIO_MAP = {
  'hot-event': {
    label: '热点事件预测',
    template: financeMarketTemplate,
    category: 'general' as EventCategory,
    defaultImportance: 0.85,
  },
  'product-launch': {
    label: '产品发布预演',
    template: productLaunchTemplate,
    category: 'tech' as EventCategory,
    defaultImportance: 0.8,
  },
  'policy-impact': {
    label: '政策影响评估',
    template: policyImpactTemplate,
    category: 'politics' as EventCategory,
    defaultImportance: 0.82,
  },
  'roundtable': {
    label: 'AI 圆桌讨论',
    template: productLaunchTemplate,
    category: 'general' as EventCategory,
    defaultImportance: 0.75,
  },
} as const;

export type ForecastScenarioKey = keyof typeof SCENARIO_MAP;

interface ForecastBody {
  event: string;
  scenario?: ForecastScenarioKey;
  ticks?: number;
  importance?: number;
}

interface ForecastFaction {
  name: string;
  share: number;
  summary: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pickTemplate(key: ForecastScenarioKey): ScenarioTemplate {
  return SCENARIO_MAP[key].template;
}

function buildFactions(template: ScenarioTemplate, agentCount: number, event: string): ForecastFaction[] {
  const profiles = template.agentProfiles;
  const total = profiles.reduce((sum, profile) => sum + profile.count, 0) || 1;

  return profiles.slice(0, 4).map((profile, index) => {
    const share = Math.max(5, Math.round((profile.count / total) * 100));
    const tones = [
      '会率先放大讨论热度，推动这个事件进入更多人的视野',
      '会更谨慎地评估利弊，形成第二层解释和质疑',
      '更关注与自身利益相关的现实影响，决定口碑走向',
      '容易把事件放进更大的竞争或叙事框架中解读',
    ];

    return {
      name: profile.role,
      share,
      summary: `${profile.role}（约 ${Math.max(1, Math.round((profile.count / total) * agentCount))} 个 Agent）${tones[index] ?? '会持续参与讨论'}。围绕“${event.slice(0, 24)}”形成自己的判断。`,
    };
  });
}

function buildRisks(scenario: ForecastScenarioKey, event: string): string[] {
  const common = [
    '如果信息源不完整，结论容易被早期叙事带偏',
    '高情绪群体会放大极端观点，造成短期误判',
  ];

  if (scenario === 'product-launch') {
    return [
      '首批种子用户评价两极化，容易影响后续扩散',
      '竞品用户可能把讨论带向对比和攻击，而不是产品价值本身',
      ...common,
    ];
  }

  if (scenario === 'policy-impact') {
    return [
      '不同利益群体对政策的解读会快速分化',
      '媒体和社交平台可能把复杂政策简化成情绪化标签',
      ...common,
    ];
  }

  if (scenario === 'roundtable') {
    return [
      '角色之间可能形成强观点对撞，导致共识收敛较慢',
      '如果议题过于宽泛，输出会偏概念化而非行动化',
      ...common,
    ];
  }

  return [
    `围绕“${event.slice(0, 20)}”的情绪会先于事实校验扩散`,
    '高关注群体的表态会影响后续从众行为',
    ...common,
  ];
}

function buildRecommendations(scenario: ForecastScenarioKey): string[] {
  if (scenario === 'product-launch') {
    return [
      '先准备一版面向早期用户的核心价值解释，再扩散到大众',
      '提前准备 FAQ，回应价格、差异化和可靠性问题',
      '重点观察意见领袖和首批体验者的口碑方向',
    ];
  }

  if (scenario === 'policy-impact') {
    return [
      '把政策影响拆成“谁受益、谁受损、谁观望”三层来解释',
      '提前准备误读纠偏材料，避免讨论被口号化',
      '优先监测企业主和普通打工人的反应差异',
    ];
  }

  if (scenario === 'roundtable') {
    return [
      '先收敛议题边界，再让多角色给出判断，输出会更稳定',
      '把冲突点和共识点分开展示，避免结果显得模糊',
      '适合拿来预演产品决策、战略选择和传播方案',
    ];
  }

  return [
    '优先跟踪最先扩散观点的群体，而不是平均意见',
    '把首轮热度和二轮质疑分开看，避免误判趋势',
    '把这次推演当成预判工具，而不是确定性结论',
  ];
}

export function registerForecastRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Body: ForecastBody }>('/api/forecast', { schema: forecastSchema }, async (req, reply) => {
    const event = req.body.event?.trim();
    const scenario = req.body.scenario ?? 'hot-event';
    const template = pickTemplate(scenario);

    if (!event) {
      return reply.status(400).send({ error: 'event required' });
    }

    const ticks = clamp(req.body.ticks ?? 4, 1, 8);
    const configuredAgentCount = template.agentProfiles.reduce((sum, profile) => sum + profile.count, 0);
    const agentCount = clamp(configuredAgentCount, 8, 40);
    const importance = clamp(req.body.importance ?? SCENARIO_MAP[scenario].defaultImportance, 0.1, 1);

    const engine = new WorldEngine({
      config: {
        tickIntervalMs: 50,
        maxAgents: agentCount,
        eventRetentionTicks: ticks + 5,
        enableNaturalSelection: false,
      },
      modelRouter: ctx.modelRouter,
      concurrency: 5,
    });

    const agents = engine.spawner.spawnBatch(agentCount, 0);
    engine.addAgents(agents);

    const scenarioEvent = {
      title: `${SCENARIO_MAP[scenario].label}: ${event.slice(0, 40)}`,
      content: event,
      category: SCENARIO_MAP[scenario].category,
      importance,
      propagationRadius: 0.7,
      tags: [scenario, 'forecast'],
    };

    engine.injectEvent(scenarioEvent);

    const tickResults = [];
    try {
      for (let i = 0; i < ticks; i++) {
        tickResults.push(await engine.step());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown engine error';
      return reply.status(500).send({ error: `forecast engine failed at tick ${tickResults.length + 1}: ${message}` });
    }

    const lastTick = tickResults.at(-1);
    const consensus = engine.getConsensusEngine().getLatestSignals();
    const factions = buildFactions(template, agentCount, event);
    const avgActivated = tickResults.length > 0
      ? Math.round(tickResults.reduce((sum, tick) => sum + tick.agentsActivated, 0) / tickResults.length)
      : 0;
    const totalResponses = tickResults.reduce((sum, tick) => sum + tick.responsesCollected, 0);

    const keyReactions = factions.map((faction, index) => ({
      actor: faction.name,
      reaction: [
        '会先表达态度，并影响同类群体的初始判断',
        '会放大细节争议，推动讨论进入更复杂的阶段',
        '会把讨论拉回现实收益、成本和风险上',
        '会从竞争和外部环境角度重新定义这件事',
      ][index] ?? '会持续参与讨论',
    }));

    const summary = `在“${SCENARIO_MAP[scenario].label}”场景下，系统为“${event}”创建了 ${agentCount} 个角色并运行 ${ticks} 轮推演。首轮主要由高敏感群体发起讨论，随后更务实的角色开始评估现实影响。整体来看，平均每轮约激活 ${avgActivated} 个 Agent，累计产生 ${totalResponses} 条响应，最终更像是“先升温、再分化、再形成有限共识”的走势。`;

    return {
      scenario,
      scenarioLabel: SCENARIO_MAP[scenario].label,
      event,
      summary,
      factions,
      keyReactions,
      risks: buildRisks(scenario, event),
      recommendations: buildRecommendations(scenario),
      metrics: {
        agentCount,
        ticks,
        responsesCollected: totalResponses,
        averageActivatedAgents: avgActivated,
        consensusSignals: consensus.length,
        finalTick: lastTick?.tick ?? 0,
      },
      raw: {
        ticks: tickResults,
        consensus,
      },
    };
  });
}
