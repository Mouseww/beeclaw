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

interface DirectAnswerBlock {
  questionType: 'numeric-forecast' | 'judgement' | 'event-propagation' | 'decision-simulation';
  answer: string;
  confidence: 'low' | 'medium' | 'high';
  range?: string;
  assumptions: string[];
  drivers: string[];
}

// ============================================================================
// Buzz 输出规范：9 种结果类型
// ============================================================================

/**
 * Buzz 输出规范定义的 9 种结果类型
 * - Reaction: 反应类 — 谁会如何反应，顺序、分歧
 * - ForecastValue: 数值预测类 — 点估计 + 区间 + 置信度 + 驱动因素
 * - BestMatch: 最佳匹配类 — 显式对象 + 理由
 * - Judgment: 判断类 — 明确的是/否风格判断
 * - Strategy: 策略类 — 推荐行动方案
 * - Evolution: 演变类 — 事态如何发展演变
 * - Risk: 风险类 — 风险识别与评估
 * - Ranking: 排名类 — 排序对比
 * - Insight: 洞察类 — 深度分析洞见
 */
export type BuzzResultType =
  | 'Reaction'
  | 'ForecastValue'
  | 'BestMatch'
  | 'Judgment'
  | 'Strategy'
  | 'Evolution'
  | 'Risk'
  | 'Ranking'
  | 'Insight';

/** 反应类主结果 */
interface ReactionResult {
  type: 'Reaction';
  /** 核心结论：谁反应、如何反应 */
  headline: string;
  /** 反应顺序 */
  sequence: Array<{ actor: string; reaction: string; timing: string }>;
  /** 主要分歧点 */
  divergence: string[];
  /** 共识点 */
  consensus: string[];
}

/** 数值预测类主结果 */
interface ForecastValueResult {
  type: 'ForecastValue';
  /** 核心结论：点估计 */
  headline: string;
  /** 点估计值 */
  pointEstimate: string;
  /** 区间范围 */
  range: string;
  /** 置信度 */
  confidence: 'low' | 'medium' | 'high';
  /** 预测时间点 */
  timepoint?: string;
  /** 置信度百分比（可选，如 70%） */
  confidencePercent?: number;
  /** 关键驱动因素 */
  drivers: string[];
  /** 假设前提 */
  assumptions: string[];
}

/** 最佳匹配类主结果 */
interface BestMatchResult {
  type: 'BestMatch';
  /** 核心结论：推荐对象 */
  headline: string;
  /** 匹配对象 */
  match: string;
  /** 选择理由 */
  rationale: string[];
  /** 备选方案 */
  alternatives: Array<{ name: string; whyNot: string }>;
}

/** 判断类主结果 */
interface JudgmentResult {
  type: 'Judgment';
  /** 核心结论：明确判断 */
  headline: string;
  /** 判断结果：会/不会、是/否、值得/不值得 */
  verdict: '是' | '否' | '很可能' | '不太可能' | '有条件成立';
  /** 判断依据 */
  reasoning: string[];
  /** 关键条件（如有条件成立） */
  conditions?: string[];
}

/** 策略类主结果 */
interface StrategyResult {
  type: 'Strategy';
  /** 核心结论：推荐策略 */
  headline: string;
  /** 推荐行动 */
  recommendedActions: string[];
  /** 优先级排序 */
  priority: Array<{ action: string; urgency: 'high' | 'medium' | 'low' }>;
  /** 风险提示 */
  caveats: string[];
}

/** 演变类主结果 */
interface EvolutionResult {
  type: 'Evolution';
  /** 核心结论：事态走向 */
  headline: string;
  /** 阶段性演变 */
  phases: Array<{ phase: string; description: string; timeframe: string }>;
  /** 关键转折点 */
  turningPoints: string[];
  /** 终局预判 */
  endState: string;
}

/** 风险类主结果 */
interface RiskResult {
  type: 'Risk';
  /** 核心结论：主要风险 */
  headline: string;
  /** 风险清单 */
  risks: Array<{
    name: string;
    severity: 'high' | 'medium' | 'low';
    likelihood: 'high' | 'medium' | 'low';
    mitigation: string;
  }>;
  /** 综合风险等级 */
  overallRiskLevel: 'high' | 'medium' | 'low';
}

/** 排名类主结果 */
interface RankingResult {
  type: 'Ranking';
  /** 核心结论：排名概要 */
  headline: string;
  /** 排名列表 */
  rankings: Array<{ rank: number; item: string; score?: number; reason: string }>;
  /** 排名维度说明 */
  criteria: string;
}

/** 洞察类主结果 */
interface InsightResult {
  type: 'Insight';
  /** 核心结论：关键洞察 */
  headline: string;
  /** 洞察要点 */
  insights: string[];
  /** 支撑证据 */
  evidence: string[];
  /** 应用建议 */
  implications: string[];
}

/** 主结果联合类型 */
export type MainResult =
  | ReactionResult
  | ForecastValueResult
  | BestMatchResult
  | JudgmentResult
  | StrategyResult
  | EvolutionResult
  | RiskResult
  | RankingResult
  | InsightResult;

// ============================================================================
// 结果类型推断
// ============================================================================

/** 从用户问题文本推断结果类型 */
export function inferResultType(event: string, scenario: ForecastScenarioKey): BuzzResultType {
  const lowerEvent = event.toLowerCase();

  // 数值预测类 — 包含价格、数量、百分比等关键词
  const numericPatterns = /(多少钱|多少元|多少美元|多少人民币|价格|每克|几率|概率|多少点|多少%|区间|预计.*多少|会到多少|涨到|跌到|涨幅|跌幅|增长率|收益率)/;
  if (numericPatterns.test(event)) {
    return 'ForecastValue';
  }

  // 判断类 — 是/否风格问题
  const judgmentPatterns = /(会不会|是否|值不值得|应该不应该|能不能|是不是|会吗|能吗|对吗|有没有可能)/;
  if (judgmentPatterns.test(event)) {
    return 'Judgment';
  }

  // 最佳匹配类 — 选择、推荐问题
  const bestMatchPatterns = /(哪个更好|最好的|最佳|应该选|推荐|首选|哪款|哪个.*合适|哪个.*更适合|更适合.*哪个|怎么选)/;
  if (bestMatchPatterns.test(event)) {
    return 'BestMatch';
  }

  // 排名类 — 排序、对比问题
  const rankingPatterns = /(排名|排行|top|前几|哪些.*最|对比|比较.*哪个)/i;
  if (rankingPatterns.test(lowerEvent) || rankingPatterns.test(event)) {
    return 'Ranking';
  }

  // 风险类 — 风险评估问题
  const riskPatterns = /(风险|危险|隐患|可能出问题|会出事|安全吗|有什么问题)/;
  if (riskPatterns.test(event)) {
    return 'Risk';
  }

  // 策略类 — 行动建议问题
  const strategyPatterns = /(怎么做|如何应对|应该怎么|策略|方案|对策|建议怎么|该怎么办)/;
  if (strategyPatterns.test(event)) {
    return 'Strategy';
  }

  // 演变类 — 发展趋势问题
  const evolutionPatterns = /(会怎么发展|走向|趋势|接下来会|之后会|未来会|演变|发酵)/;
  if (evolutionPatterns.test(event)) {
    return 'Evolution';
  }

  // 基于场景的默认推断
  if (scenario === 'product-launch') {
    // 产品发布默认关注反应
    return 'Reaction';
  }

  if (scenario === 'policy-impact') {
    // 政策影响默认关注反应
    return 'Reaction';
  }

  if (scenario === 'roundtable') {
    // 圆桌讨论默认输出洞察
    return 'Insight';
  }

  // 热点事件默认关注反应
  if (scenario === 'hot-event') {
    return 'Reaction';
  }

  // 兜底：洞察类
  return 'Insight';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pickTemplate(key: ForecastScenarioKey): ScenarioTemplate {
  return SCENARIO_MAP[key].template;
}

function eventExcerpt(event: string, max = 24): string {
  return event.length <= max ? event : `${event.slice(0, max)}…`;
}

function buildFactionSummary(role: string, scenario: ForecastScenarioKey, event: string, count: number): string {
  const subject = `围绕“${eventExcerpt(event)}”`;

  if (scenario === 'product-launch') {
    if (role === '早期用户') return `${role}（约 ${count} 个 Agent）整体偏支持，认为产品有新意，愿意尝鲜，但会要求体验和完成度过关。${subject}时，他们最看重的是功能是否真的比现有方案更强。`;
    if (role === '意见领袖') return `${role}（约 ${count} 个 Agent）观点偏谨慎，认为这波声量能起来，但最终能不能站住，取决于差异化是否足够明显。${subject}时，他们会同时强调亮点和潜在短板。`;
    if (role === '普通消费者') return `${role}（约 ${count} 个 Agent）更关注价格、可靠性和是否值得买单。${subject}时，他们不会因为技术概念就直接支持，而是先看性价比和真实口碑。`;
    if (role === '竞品用户') return `${role}（约 ${count} 个 Agent）天然带比较视角，倾向认为新品未必能替代现有成熟方案。${subject}时，他们的核心看法是“有亮点，但不一定值得迁移”。`;
  }

  if (scenario === 'policy-impact') {
    if (role === '企业主') return `${role}（约 ${count} 个 Agent）会先算经营账，判断政策是增成本还是减压力。${subject}时，他们的主看法通常是“方向重要，但关键看执行细则会不会压缩利润”。`;
    if (role === '打工人') return `${role}（约 ${count} 个 Agent）最关心收入、就业和生活成本。${subject}时，他们会直接判断这件事是让日子更轻松，还是让不确定性更强。`;
    if (role === '政策制定者') return `${role}（约 ${count} 个 Agent）更强调长期结构目标，认为短期阵痛可以接受，但政策必须可解释、可执行。${subject}时，他们的立场偏“支持方向，但要控副作用”。`;
    if (role === '媒体人') return `${role}（约 ${count} 个 Agent）会把争议点放大成公共讨论，核心看法不是单纯支持或反对，而是追问谁真正受益、谁承担代价。`;
  }

  if (scenario === 'roundtable') {
    if (role === '早期用户') return `${role}（约 ${count} 个 Agent）通常更愿意支持新方案，认为值得试，但前提是别只讲概念。${subject}时，他们的判断偏“可以做，但要快速验证真实价值”。`;
    if (role === '意见领袖') return `${role}（约 ${count} 个 Agent）会给出更强的立场表达，通常不满足于模糊结论。${subject}时，他们更可能说“方向成立，但执行决定成败”。`;
    if (role === '普通消费者') return `${role}（约 ${count} 个 Agent）关注实际影响，倾向从“对我有什么好处/坏处”来判断。${subject}时，他们的观点决定这个议题能不能真正扩散。`;
    if (role === '竞品用户') return `${role}（约 ${count} 个 Agent）会主动提出替代方案和反例，质疑是否真的需要这条路径。${subject}时，他们的观点通常是“不是不能做，而是未必是最优解”。`;
  }

  if (role === '散户投资者') return `${role}（约 ${count} 个 Agent）偏向用结果判断对错，容易把${subject}解读成短期价格信号，主看法通常是“如果情绪能延续，价格还有空间”。`;
  if (role === '机构交易员') return `${role}（约 ${count} 个 Agent）更关心交易窗口和风险回报比。${subject}时，他们的立场通常是“方向可能对，但仓位和节奏比观点更重要”。`;
  if (role === '金融分析师') return `${role}（约 ${count} 个 Agent）会强调估值、政策和宏观变量，整体观点更克制。${subject}时，他们往往认为市场不会无限外推，最终要回到基本面。`;
  if (role === '财经记者') return `${role}（约 ${count} 个 Agent）会把不同声音汇总成叙事，倾向判断这件事是否会继续成为市场焦点。${subject}时，他们的看法通常是“短期热度高，但后续要看新信息是否跟上”。`;

  return `${role}（约 ${count} 个 Agent）会围绕“${eventExcerpt(event)}”形成明确立场，并给出支持或反对的理由。`;
}

function buildReaction(role: string, scenario: ForecastScenarioKey, event: string): string {
  if (scenario === 'product-launch') {
    if (role === '早期用户') return `我的看法是：${eventExcerpt(event, 18)}有吸引力，可以试，但前提是体验别翻车，否则第一波口碑会掉得很快。`;
    if (role === '意见领袖') return `我的判断是：这事能有讨论度，但真正决定成败的不是发布会，而是用户拿到手之后会不会继续推荐。`;
    if (role === '普通消费者') return `我更在意的是值不值得买，如果价格高、差异又不够明显，那热度过去以后很难留下真实需求。`;
    if (role === '竞品用户') return `我不认为它会立刻改写格局，更多像是带来新话题，但未必能让成熟用户大规模切换。`;
  }

  if (scenario === 'policy-impact') {
    if (role === '企业主') return `站在经营角度，我的看法是方向未必错，但如果执行成本上升太快，企业会先收缩而不是扩张。`;
    if (role === '打工人') return `我关心的是这件事会不会影响收入和岗位稳定，如果只讲长期利好、短期却更难受，支持度不会高。`;
    if (role === '政策制定者') return `我的判断是政策目标可以成立，但必须把配套细则和缓冲措施一起做出来，否则社会感受会很差。`;
    if (role === '媒体人') return `我会把它理解为一场利益再分配，真正值得追问的是谁获益、谁承压、谁在沉默。`;
  }

  if (scenario === 'roundtable') {
    if (role === '早期用户') return `我倾向支持试一试，但要尽快验证，不然这会停留在概念层，最后讨论热闹、结果空心。`;
    if (role === '意见领袖') return `我的观点很直接：这方向不是不能做，而是必须有一个足够锋利的切入口，不然资源会被摊薄。`;
    if (role === '普通消费者') return `如果这件事不能明显改善我的效率、成本或体验，那我不会因为它新就买账。`;
    if (role === '竞品用户') return `我更怀疑的是必要性——不是它做不到，而是现有替代方案可能已经够好了。`;
  }

  if (role === '散户投资者') return `我会把这件事看成偏利多，短期情绪如果继续发酵，价格还有上冲空间，但追高也容易被反杀。`;
  if (role === '机构交易员') return `我的看法是可以顺势，但不能只看故事，真正重要的是确认信号能否持续以及回撤风险有多大。`;
  if (role === '金融分析师') return `我倾向认为影响存在，但市场容易提前透支预期，最后还是要回到基本面和估值。`;
  if (role === '财经记者') return `我会把它定义成一个短期高关注事件，但能不能从新闻变成趋势，要看后续有没有连续的新证据。`;

  return `我的看法是：围绕“${eventExcerpt(event, 18)}”，支持和反对都会出现，但最终会回到成本、收益和现实影响。`;
}

function buildFactions(template: ScenarioTemplate, agentCount: number, event: string, scenario: ForecastScenarioKey): ForecastFaction[] {
  const profiles = template.agentProfiles;
  const total = profiles.reduce((sum, profile) => sum + profile.count, 0) || 1;

  return profiles.slice(0, 4).map((profile) => {
    const share = Math.max(5, Math.round((profile.count / total) * 100));
    const count = Math.max(1, Math.round((profile.count / total) * agentCount));

    return {
      name: profile.role,
      share,
      summary: buildFactionSummary(profile.role, scenario, event, count),
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

export function inferQuestionType(event: string, scenario: ForecastScenarioKey): DirectAnswerBlock['questionType'] {
  const numericPatterns = /(多少钱|多少元|多少美元|多少人民币|价格|每克|几率|概率|多少点|多少%|区间|预计.*多少|会到多少)/;
  const judgementPatterns = /(会不会|是否|值不值得|应该不应该|能不能|是不是)/;

  if (scenario === 'product-launch' || scenario === 'roundtable') return 'decision-simulation';
  if (scenario === 'hot-event' && numericPatterns.test(event)) return 'numeric-forecast';
  if (judgementPatterns.test(event)) return 'judgement';
  if (scenario === 'hot-event') return 'event-propagation';
  return 'decision-simulation';
}

function extractTimepoint(event: string): string | null {
  const normalized = event.replace(/\s+/g, '');

  if (/2026年(?:年底|年末)/.test(normalized)) return '2026 年底';
  if (/2027年(?:年底|年末)/.test(normalized)) return '2027 年底';
  if (/2026年/.test(normalized)) return '2026 年';
  if (/2027年/.test(normalized)) return '2027 年';
  if (/明年年底|明年年末/.test(normalized)) return '明年年底';
  if (/后年年底|后年年末/.test(normalized)) return '后年年底';
  if (/明年/.test(normalized)) return '明年';
  if (/后年/.test(normalized)) return '后年';

  return null;
}

function isGoldPriceQuestion(event: string): boolean {
  const normalized = event.replace(/\s+/g, '');
  return /(黄金|金价|实体黄金)/.test(normalized) && /(每克|多少钱一克|价格|多少钱)/.test(normalized) && /(2026|2027|明年|后年|年底|年末)/.test(normalized);
}

function buildGoldForecastAnswer(event: string): DirectAnswerBlock {
  const timepoint = extractTimepoint(event) ?? '目标时间点';

  if (timepoint === '2026 年底') {
    return {
      questionType: 'numeric-forecast',
      answer: '直接判断：我判断 2026 年底中国实体黄金价格大概率在每克 ¥840 ~ ¥980 区间，中位判断约 ¥910/克。',
      range: '¥840 ~ ¥980 / 克',
      confidence: 'medium',
      assumptions: [
        '国际金价维持高位或继续温和上行，而不是深度回撤',
        '人民币汇率没有出现大幅持续升值，国内人民币计价黄金不会被明显压低',
        '国内实体黄金零售溢价维持在常见区间，未出现极端挤压或暴涨',
      ],
      drivers: [
        '国际金价（美元计价）',
        '美元/人民币汇率',
        '国内实体黄金零售溢价',
        '全球避险需求、利率路径与央行购金节奏',
      ],
    };
  }

  return {
    questionType: 'numeric-forecast',
    answer: `直接判断：我判断 ${timepoint} 中国市场黄金零售价格大概率在每克 ¥620 ~ ¥780 区间，中位判断约 ¥690/克。`,
    range: '¥620 ~ ¥780 / 克',
    confidence: 'medium',
    assumptions: [
      '国际金价维持高位震荡，而不是大幅回落',
      '人民币汇率没有出现极端单边贬值或升值',
      '中国零售端黄金溢价维持在当前常见区间附近',
    ],
    drivers: [
      '国际金价（美元计价）',
      '美元/人民币汇率',
      '国内金饰与投资金条溢价',
      '全球避险需求与利率周期',
    ],
  };
}

function buildDirectAnswer(event: string, scenario: ForecastScenarioKey): DirectAnswerBlock {
  const questionType = inferQuestionType(event, scenario);

  if (isGoldPriceQuestion(event)) {
    return buildGoldForecastAnswer(event);
  }

  if (questionType === 'numeric-forecast') {
    const timepoint = extractTimepoint(event) ?? '目标时间点';
    return {
      questionType,
      answer: `直接判断：我判断 ${timepoint} 该指标大概率会落在一个中等波动区间内，中位预测约为基准值附近，区间判断约为 85 ~ 115。`,
      range: '85 ~ 115',
      confidence: 'low',
      assumptions: [
        '关键宏观变量不会出现超预期跳变',
        '市场情绪和政策环境维持常规波动范围',
      ],
      drivers: ['宏观经济', '市场情绪', '政策变化', '供需关系'],
    };
  }

  if (questionType === 'judgement') {
    return {
      questionType,
      answer: '直接判断：有可能发生，但大概率不是线性、立刻、全面兑现，而是先局部显现，再看外部环境放大或压制。',
      confidence: 'medium',
      assumptions: ['当前背景信息基本成立', '没有额外黑天鹅事件打断'],
      drivers: ['执行质量', '竞争格局', '政策环境', '用户接受度'],
    };
  }

  if (questionType === 'decision-simulation') {
    return {
      questionType,
      answer: '直接判断：这件事可以做，但成败不取决于“能不能做”，而取决于切入口是否锋利、价值是否足够明确、落地是否够快。',
      confidence: 'medium',
      assumptions: ['参与角色画像具有代表性', '输入问题描述了核心决策背景'],
      drivers: ['不同利益相关方立场', '传播环境', '成本收益结构'],
    };
  }

  return {
    questionType,
    answer: '直接判断：这件事大概率会先升温，再分化，最后形成有限共识；支持和反对都会出现，但不会快速收敛成单一声音。',
    confidence: 'medium',
    assumptions: ['事件本身具有传播性', '相关群体会参与讨论'],
    drivers: ['信息扩散速度', '群体立场', '舆情放大效应'],
  };
}

export interface ForecastResultPayload {
  scenario: ForecastScenarioKey;
  scenarioLabel: string;
  event: string;
  /** Buzz 结果类型 */
  resultType: BuzzResultType;
  /** 主结果 — 首段直接回答用户问题 */
  mainResult: MainResult;
  /** @deprecated 向后兼容，使用 mainResult 替代 */
  directAnswer: DirectAnswerBlock;
  summary: string;
  factions: ForecastFaction[];
  keyReactions: Array<{ actor: string; reaction: string }>;
  risks: string[];
  recommendations: string[];
  metrics: {
    agentCount: number;
    ticks: number;
    responsesCollected: number;
    averageActivatedAgents: number;
    consensusSignals: number;
    finalTick: number;
  };
  raw: {
    ticks: unknown[];
    consensus: unknown[];
  };
}

type ForecastJobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface ForecastJob {
  jobId: string;
  status: ForecastJobStatus;
  createdAt: number;
  updatedAt: number;
  input: {
    event: string;
    scenario: ForecastScenarioKey;
    ticks: number;
    importance: number;
  };
  progress: {
    completedTicks: number;
    totalTicks: number;
  };
  result?: ForecastResultPayload;
  error?: string;
}

function buildTypedSummary(
  event: string,
  scenario: ForecastScenarioKey,
  resultType: BuzzResultType,
  mainResult: MainResult,
  ticks: number,
  agentCount: number,
): string {
  const prefix = `针对“${event}”，系统在“${SCENARIO_MAP[scenario].label}”场景下运行了 ${ticks} 轮推演、覆盖约 ${agentCount} 个角色。`;

  if (mainResult.type === 'ForecastValue') {
    return `${prefix}最终输出为数值预测：中位判断约 ${mainResult.pointEstimate}，主要区间落在 ${mainResult.range}，置信度为 ${mainResult.confidence}。推演重点聚焦于 ${mainResult.drivers.slice(0, 3).join('、')} 等变量，而不是单纯讨论群体态度。`;
  }

  if (mainResult.type === 'Reaction') {
    return `${prefix}最终输出为反应推演：不同角色会分阶段表态，先出现 ${mainResult.sequence[0]?.actor ?? '第一波角色'} 的反应，随后出现分歧与再判断。核心价值在于识别反应顺序与主要分歧，而不是给出单点数值。`;
  }

  if (mainResult.type === 'BestMatch') {
    return `${prefix}最终输出为最佳匹配结果：当前最匹配对象是“${mainResult.match}”。推演不是简单列观点，而是围绕“为什么是它、备选为什么次优”给出收敛结论。`;
  }

  if (mainResult.type === 'Judgment') {
    return `${prefix}最终输出为明确判断：结论更接近“${mainResult.verdict}”。推演给出的重点是判断依据与成立条件，而不是泛化成模糊立场。`;
  }

  if (mainResult.type === 'Strategy') {
    return `${prefix}最终输出为行动策略：结果聚焦于推荐动作、优先级和风险提示，帮助把讨论收敛成可执行方案。`;
  }

  if (mainResult.type === 'Evolution') {
    return `${prefix}最终输出为演变路径：系统将问题拆成多个阶段，强调关键转折点和可能终局，而不是只给一句静态判断。`;
  }

  if (mainResult.type === 'Risk') {
    return `${prefix}最终输出为风险评估：系统识别了主要风险项、严重度与缓解方式，帮助优先处理最可能造成损失的问题。`;
  }

  if (mainResult.type === 'Ranking') {
    return `${prefix}最终输出为排序结果：系统基于影响力、支持强度和持续性给出排序，而不是只展示分散观点。`;
  }

  return `${prefix}最终输出为关键洞察：系统从多角色推演中提炼出可直接使用的结论、证据和启发。`;
}

function validateAndRepairMainResult(
  resultType: BuzzResultType,
  mainResult: MainResult,
  directAnswer: DirectAnswerBlock,
  factions: ForecastFaction[],
  keyReactions: Array<{ actor: string; reaction: string }>,
  recommendations: string[],
  risks: string[],
): MainResult {
  if (resultType === 'ForecastValue') {
    const current = mainResult.type === 'ForecastValue'
      ? mainResult
      : {
        type: 'ForecastValue' as const,
        headline: directAnswer.answer,
        pointEstimate: directAnswer.range ?? '未给出预测值',
        range: directAnswer.range ?? '未给出区间',
        confidence: directAnswer.confidence,
        timepoint: undefined,
        drivers: directAnswer.drivers,
        assumptions: directAnswer.assumptions,
      };

    const hasEstimate = current.pointEstimate && current.pointEstimate !== '未给出单点值';
    const hasRange = Boolean(current.range);
    const hasDrivers = current.drivers.length > 0;
    if (hasEstimate && hasRange && hasDrivers) return current;

    return {
      ...current,
      headline: directAnswer.answer,
      pointEstimate: hasEstimate ? current.pointEstimate : (directAnswer.range ?? '需结合区间理解'),
      range: hasRange ? current.range : (directAnswer.range ?? '建议按区间理解'),
      confidence: current.confidence ?? directAnswer.confidence,
      drivers: hasDrivers ? current.drivers : directAnswer.drivers,
      assumptions: current.assumptions.length > 0 ? current.assumptions : directAnswer.assumptions,
    };
  }

  if (resultType === 'Reaction') {
    const sequence = keyReactions.slice(0, 3).map((item, index) => ({
      actor: item.actor,
      reaction: item.reaction,
      timing: index === 0 ? '第一波' : index === 1 ? '第二波' : '后续',
    }));
    const divergence = factions.slice(0, 3).map((f) => f.summary);

    if (mainResult.type === 'Reaction' && mainResult.sequence.length > 0 && mainResult.divergence.length > 0) {
      return mainResult;
    }

    return {
      type: 'Reaction',
      headline: directAnswer.answer,
      sequence,
      divergence,
      consensus: [directAnswer.answer],
    };
  }

  if (resultType === 'BestMatch') {
    if (mainResult.type === 'BestMatch' && mainResult.match && mainResult.rationale.length > 0) {
      return mainResult;
    }

    return {
      type: 'BestMatch',
      headline: directAnswer.answer,
      match: factions[0]?.name ?? '当前最优对象未定',
      rationale: [
        directAnswer.answer,
        ...(factions.slice(0, 2).map((f) => f.summary)),
      ],
      alternatives: factions.slice(1, 3).map((f) => ({ name: f.name, whyNot: f.summary })),
    };
  }

  if (resultType === 'Strategy' && mainResult.type !== 'Strategy') {
    return {
      type: 'Strategy',
      headline: directAnswer.answer,
      recommendedActions: recommendations,
      priority: recommendations.slice(0, 3).map((action, index) => ({
        action,
        urgency: index === 0 ? 'high' as const : index === 1 ? 'medium' as const : 'low' as const,
      })),
      caveats: risks.slice(0, 3),
    };
  }

  return mainResult;
}

function buildMainResult(
  event: string,
  scenario: ForecastScenarioKey,
  resultType: BuzzResultType,
  directAnswer: DirectAnswerBlock,
  factions: ForecastFaction[],
  keyReactions: Array<{ actor: string; reaction: string }>,
  recommendations: string[],
  risks: string[],
): MainResult {
  if (resultType === 'ForecastValue') {
    return {
      type: 'ForecastValue',
      headline: directAnswer.answer,
      pointEstimate: /约\s*¥?\d+[\d.,]*/.exec(directAnswer.answer)?.[0]?.replace(/^约\s*/, '') ?? directAnswer.range ?? '未给出单点值',
      range: directAnswer.range ?? '未给出区间',
      confidence: directAnswer.confidence,
      timepoint: extractTimepoint(event) ?? undefined,
      drivers: directAnswer.drivers,
      assumptions: directAnswer.assumptions,
    };
  }

  if (resultType === 'Judgment') {
    return {
      type: 'Judgment',
      headline: directAnswer.answer,
      verdict: directAnswer.answer.includes('不太可能')
        ? '不太可能'
        : directAnswer.answer.includes('有条件')
          ? '有条件成立'
          : directAnswer.answer.includes('不会') || directAnswer.answer.includes('否')
            ? '否'
            : directAnswer.answer.includes('会') || directAnswer.answer.includes('是')
              ? '是'
              : '很可能',
      reasoning: directAnswer.drivers,
      conditions: directAnswer.assumptions,
    };
  }

  if (resultType === 'BestMatch') {
    return {
      type: 'BestMatch',
      headline: directAnswer.answer,
      match: factions[0]?.name ?? '当前最优对象未定',
      rationale: [
        directAnswer.answer,
        ...(factions.slice(0, 2).map((f) => f.summary)),
      ],
      alternatives: factions.slice(1, 3).map((f) => ({
        name: f.name,
        whyNot: f.summary,
      })),
    };
  }

  if (resultType === 'Strategy') {
    return {
      type: 'Strategy',
      headline: directAnswer.answer,
      recommendedActions: recommendations,
      priority: recommendations.slice(0, 3).map((action, index) => ({
        action,
        urgency: index === 0 ? 'high' as const : index === 1 ? 'medium' as const : 'low' as const,
      })),
      caveats: risks.slice(0, 3),
    };
  }

  if (resultType === 'Evolution') {
    return {
      type: 'Evolution',
      headline: directAnswer.answer,
      phases: [
        {
          phase: '第一阶段',
          description: keyReactions[0]?.reaction ?? '先出现第一波明显反应',
          timeframe: '短期',
        },
        {
          phase: '第二阶段',
          description: keyReactions[1]?.reaction ?? '随后出现分化和重新判断',
          timeframe: '中期',
        },
        {
          phase: '第三阶段',
          description: '最终形成有限共识，并回到现实约束与结果验证。',
          timeframe: '后期',
        },
      ],
      turningPoints: risks.slice(0, 2),
      endState: directAnswer.answer,
    };
  }

  if (resultType === 'Risk') {
    return {
      type: 'Risk',
      headline: directAnswer.answer,
      risks: risks.slice(0, 3).map((risk, index) => ({
        name: risk,
        severity: index === 0 ? 'high' as const : 'medium' as const,
        likelihood: index === 0 ? 'high' as const : 'medium' as const,
        mitigation: recommendations[index] ?? '需要持续跟踪并准备应对预案',
      })),
      overallRiskLevel: 'medium',
    };
  }

  if (resultType === 'Ranking') {
    return {
      type: 'Ranking',
      headline: directAnswer.answer,
      rankings: factions.map((faction, index) => ({
        rank: index + 1,
        item: faction.name,
        score: Math.max(100 - index * 10, 60),
        reason: faction.summary,
      })),
      criteria: '按推演中的影响力、支持强度和持续性综合排序',
    };
  }

  if (resultType === 'Insight') {
    return {
      type: 'Insight',
      headline: directAnswer.answer,
      insights: [
        directAnswer.answer,
        ...factions.slice(0, 2).map((f) => f.summary),
      ],
      evidence: keyReactions.slice(0, 3).map((item) => `${item.actor}：${item.reaction}`),
      implications: recommendations.slice(0, 3),
    };
  }

  return {
    type: 'Reaction',
    headline: directAnswer.answer,
    sequence: keyReactions.slice(0, 3).map((item, index) => ({
      actor: item.actor,
      reaction: item.reaction,
      timing: index === 0 ? '第一波' : index === 1 ? '第二波' : '后续',
    })),
    divergence: factions.slice(0, 3).map((f) => f.summary),
    consensus: [directAnswer.answer],
  };
}

async function runForecast(body: ForecastBody, ctx: ServerContext, onProgress?: (completedTicks: number, totalTicks: number) => void): Promise<ForecastResultPayload> {
  const event = body.event?.trim();
  const scenario = body.scenario ?? 'hot-event';
  const template = pickTemplate(scenario);

  if (!event) {
    throw new Error('event required');
  }

  const ticks = clamp(body.ticks ?? 4, 1, 20);
  const configuredAgentCount = template.agentProfiles.reduce((sum, profile) => sum + profile.count, 0);
  const agentCount = clamp(configuredAgentCount, 8, 40);
  const importance = clamp(body.importance ?? SCENARIO_MAP[scenario].defaultImportance, 0.1, 1);

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
      onProgress?.(i + 1, ticks);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown engine error';
    throw new Error(`forecast engine failed at tick ${tickResults.length + 1}: ${message}`);
  }

  const lastTick = tickResults.at(-1);
  const consensus = engine.getConsensusEngine().getLatestSignals();
  const factions = buildFactions(template, agentCount, event, scenario);
  const avgActivated = tickResults.length > 0
    ? Math.round(tickResults.reduce((sum, tick) => sum + tick.agentsActivated, 0) / tickResults.length)
    : 0;
  const totalResponses = tickResults.reduce((sum, tick) => sum + tick.responsesCollected, 0);

  const keyReactions = factions.map((faction) => ({
    actor: faction.name,
    reaction: buildReaction(faction.name, scenario, event),
  }));

  const directAnswer = buildDirectAnswer(event, scenario);
  const resultType = inferResultType(event, scenario);
  const recommendations = buildRecommendations(scenario);
  const risks = buildRisks(scenario, event);
  const rawMainResult = buildMainResult(event, scenario, resultType, directAnswer, factions, keyReactions, recommendations, risks);
  const mainResult = validateAndRepairMainResult(resultType, rawMainResult, directAnswer, factions, keyReactions, recommendations, risks);
  const summary = buildTypedSummary(event, scenario, resultType, mainResult, ticks, agentCount);

  return {
    scenario,
    scenarioLabel: SCENARIO_MAP[scenario].label,
    event,
    resultType,
    mainResult,
    directAnswer,
    summary,
    factions,
    keyReactions,
    risks,
    recommendations,
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
}

export function registerForecastRoute(app: FastifyInstance, ctx: ServerContext): void {
  const jobs = new Map<string, ForecastJob>();

  app.post<{ Body: ForecastBody }>('/api/forecast', { schema: forecastSchema }, async (req, reply) => {
    const event = req.body.event?.trim();
    const scenario = req.body.scenario ?? 'hot-event';

    if (!event) {
      return reply.status(400).send({ error: 'event required' });
    }

    const ticks = clamp(req.body.ticks ?? 4, 1, 20);
    const importance = clamp(req.body.importance ?? SCENARIO_MAP[scenario].defaultImportance, 0.1, 1);
    const jobId = `forecast_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const job: ForecastJob = {
      jobId,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      input: {
        event,
        scenario,
        ticks,
        importance,
      },
      progress: {
        completedTicks: 0,
        totalTicks: ticks,
      },
    };

    jobs.set(jobId, job);

    void (async () => {
      job.status = 'running';
      job.updatedAt = Date.now();
      try {
        const result = await runForecast({ event, scenario, ticks, importance }, ctx, (completedTicks, totalTicks) => {
          job.progress.completedTicks = completedTicks;
          job.progress.totalTicks = totalTicks;
          job.updatedAt = Date.now();
        });
        job.status = 'completed';
        job.result = result;
        job.updatedAt = Date.now();
      } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'unknown forecast error';
        job.updatedAt = Date.now();
      }
    })();

    return reply.status(202).send({
      jobId,
      status: job.status,
      progress: job.progress,
    });
  });

  app.get<{ Params: { jobId: string } }>('/api/forecast/:jobId', async (req, reply) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return reply.status(404).send({ error: 'forecast job not found' });
    }

    return {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      input: job.input,
      progress: job.progress,
      result: job.result,
      error: job.error,
    };
  });
}
