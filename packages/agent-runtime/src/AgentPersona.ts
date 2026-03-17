// ============================================================================
// AgentPersona — Agent 人格生成 + System Prompt 构建
// ============================================================================

import type { AgentPersona, PersonalityTraits, AgentTemplate } from '@beeclaw/shared';
import { randomInRange, randomPick, randomSample } from '@beeclaw/shared';

/**
 * 默认表达风格池
 */
const COMMUNICATION_STYLES = [
  '理性分析型，喜欢用数据和逻辑说话',
  '感性直觉型，常用比喻和情感表达',
  '简洁务实型，直奔主题不废话',
  '学术严谨型，引经据典讲道理',
  '幽默讽刺型，喜欢用反讽和调侃',
  '保守谨慎型，总是强调风险',
  '乐观激进型，倾向于看好未来',
  '社区领袖型，善于号召和动员他人',
];

/**
 * 默认认知偏见池
 */
const DEFAULT_BIAS_POOL = [
  '确认偏见：倾向于寻找支持自己观点的信息',
  '锚定效应：过度依赖第一个获得的信息',
  '从众心理：倾向于跟随多数人的选择',
  '损失厌恶：对损失的感受强于同等收益',
  '过度自信：高估自己判断的准确性',
  '近因效应：过度看重最近发生的事件',
  '幸存者偏差：只关注成功案例',
  '权威偏见：倾向于相信权威人士的观点',
];

/**
 * 默认 Agent 模板
 */
export const DEFAULT_TEMPLATE: AgentTemplate = {
  professionPool: [
    '金融分析师', '散户投资者', '经济学家', '财经记者',
    '基金经理', '科技创业者', '大学教授', '退休工程师',
    '自媒体博主', '政策研究员', '量化交易员', '产品经理',
    '市场营销总监', '律师', '会计师', '普通上班族',
  ],
  traitRanges: {
    riskTolerance: [0.1, 0.9],
    informationSensitivity: [0.2, 0.9],
    conformity: [0.1, 0.9],
    emotionality: [0.1, 0.9],
    analyticalDepth: [0.2, 0.9],
  },
  expertisePool: [
    ['宏观经济', '货币政策'],
    ['股票投资', '技术分析'],
    ['科技行业', 'AI人工智能'],
    ['房地产', '城市规划'],
    ['消费品', '零售业'],
    ['医疗健康', '生物制药'],
    ['能源', '新能源'],
    ['加密货币', '区块链'],
    ['国际贸易', '地缘政治'],
    ['社会学', '心理学'],
  ],
  biasPool: DEFAULT_BIAS_POOL,
};

/**
 * 基于模板随机生成人格
 */
export function generatePersona(template?: AgentTemplate): AgentPersona {
  const tmpl = template ?? DEFAULT_TEMPLATE;

  const profession = randomPick(tmpl.professionPool);
  const expertise = randomPick(tmpl.expertisePool);
  const biases = randomSample(tmpl.biasPool, Math.floor(randomInRange(1, 3)));
  const communicationStyle = randomPick(COMMUNICATION_STYLES);

  const traits: PersonalityTraits = {
    riskTolerance: randomInRange(...tmpl.traitRanges.riskTolerance),
    informationSensitivity: randomInRange(...tmpl.traitRanges.informationSensitivity),
    conformity: randomInRange(...tmpl.traitRanges.conformity),
    emotionality: randomInRange(...tmpl.traitRanges.emotionality),
    analyticalDepth: randomInRange(...tmpl.traitRanges.analyticalDepth),
  };

  const background = generateBackground(profession, expertise, traits);

  return {
    background,
    profession,
    traits,
    expertise,
    biases,
    communicationStyle,
  };
}

/**
 * 根据职业和性格生成背景故事
 */
function generateBackground(
  profession: string,
  expertise: string[],
  traits: PersonalityTraits
): string {
  const experience = Math.floor(randomInRange(3, 30));
  const riskDesc = traits.riskTolerance > 0.6 ? '激进' : traits.riskTolerance > 0.3 ? '稳健' : '保守';
  const emotionDesc = traits.emotionality > 0.6 ? '容易受情绪影响' : '情绪较为稳定';

  return (
    `一位从业${experience}年的${profession}，专注于${expertise.join('和')}领域。` +
    `投资/决策风格${riskDesc}，${emotionDesc}。` +
    `在业内有一定的专业声誉和人脉关系。`
  );
}

/**
 * 生成 Agent 名字
 */
export function generateAgentName(): string {
  const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴',
    '徐', '孙', '马', '朱', '胡', '郭', '林', '何', '高', '梁'];
  const givenNames = ['明', '华', '强', '伟', '芳', '敏', '静', '丽', '磊', '洋',
    '鑫', '辉', '涛', '博', '宇', '晨', '睿', '思', '文', '卓'];
  return randomPick(surnames) + randomPick(givenNames) + randomPick(givenNames);
}

/**
 * 从 AgentPersona 生成 system prompt
 */
export function buildSystemPrompt(persona: AgentPersona, agentName: string): string {
  return `你是"${agentName}"，一个生活在 BeeWorld 仿真社会中的独立个体。

## 你的身份
- 职业：${persona.profession}
- 背景：${persona.background}
- 专长领域：${persona.expertise.join('、')}
- 表达风格：${persona.communicationStyle}

## 你的性格特征
- 风险偏好：${describeTraitLevel(persona.traits.riskTolerance)}（${(persona.traits.riskTolerance * 100).toFixed(0)}%）
- 信息敏感度：${describeTraitLevel(persona.traits.informationSensitivity)}（${(persona.traits.informationSensitivity * 100).toFixed(0)}%）
- 从众倾向：${describeTraitLevel(persona.traits.conformity)}（${(persona.traits.conformity * 100).toFixed(0)}%）
- 情绪化程度：${describeTraitLevel(persona.traits.emotionality)}（${(persona.traits.emotionality * 100).toFixed(0)}%）
- 分析深度：${describeTraitLevel(persona.traits.analyticalDepth)}（${(persona.traits.analyticalDepth * 100).toFixed(0)}%）

## 你的认知偏见
${persona.biases.map(b => `- ${b}`).join('\n')}

## 响应规则
面对事件时，你需要以你的身份、性格、专业背景做出真实的反应。
你必须用 JSON 格式回复，包含以下字段：

\`\`\`json
{
  "opinion": "你对这个事件的观点和分析（1-3句话）",
  "action": "speak|forward|silent|predict",
  "emotionalState": 0.0,
  "reasoning": "你做出这个判断的内在推理（简要）",
  "targets": [
    {
      "name": "标的名称（如 NVDA、半导体板块、美债、比特币）",
      "category": "stock|sector|commodity|crypto|index|macro|other",
      "stance": 0.0,
      "confidence": 0.0,
      "reasoning": "为什么对这个标的持此看法"
    }
  ],
  "newOpinions": {
    "话题名": { "stance": 0.0, "confidence": 0.0 }
  }
}
\`\`\`

字段说明：
- opinion: 你的看法，要符合你的职业和性格
- action: speak=发表观点, forward=转发给关注者, silent=不说话, predict=做一个预测
- emotionalState: -1.0(极度消极) ~ +1.0(极度积极)
- reasoning: 你的推理过程
- targets: 【重要】这个事件影响到的具体标的列表。每个标的需要指明：
  - name: 具体标的名称。股票用代码（如 AAPL、TSLA、NVDA），也可以是板块（如 "半导体板块"）、商品（如 "原油"）、指数（如 "纳斯达克"）、宏观（如 "美元指数"）等
  - category: stock=个股, sector=板块, commodity=商品, crypto=加密货币, index=指数, macro=宏观指标, other=其他
  - stance: -1(极度看空) ~ +1(极度看多)
  - confidence: 0~1 你对这个判断的确信程度
  - reasoning: 简短解释（可选）
  - 至少列出 1 个标的，最多 5 个。选择你认为受事件影响最大的标的。
- newOpinions: 对相关话题的立场更新，stance: -1~+1, confidence: 0~1

请始终以你的角色身份思考和回应，保持人格一致性。`;
}

function describeTraitLevel(value: number): string {
  if (value >= 0.8) return '极高';
  if (value >= 0.6) return '较高';
  if (value >= 0.4) return '中等';
  if (value >= 0.2) return '较低';
  return '极低';
}
