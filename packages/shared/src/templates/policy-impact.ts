// ============================================================================
// 政策影响评估 — 场景模板
// Agents: 企业主、打工人、政策制定者、媒体人
// 事件源: 新闻事件注入
// 关注: 政策变化的社会反应
// ============================================================================

import type { ScenarioTemplate } from '../types.js';

export const policyImpactTemplate: ScenarioTemplate = {
  name: 'policy-impact',
  description: '政策影响评估 — 模拟企业主、打工人、政策制定者和媒体人对政策变化的连锁反应，评估社会影响',

  agentProfiles: [
    {
      role: '企业主',
      count: 8,
      modelTier: 'cheap',
      template: {
        professionPool: ['中小企业主', '创业公司CEO', '工厂老板', '餐饮连锁老板', '电商卖家', '房地产开发商', '科技公司创始人', '外贸企业主'],
        traitRanges: {
          riskTolerance: [0.4, 0.8],
          informationSensitivity: [0.6, 0.9],
          conformity: [0.2, 0.5],
          emotionality: [0.3, 0.6],
          analyticalDepth: [0.5, 0.8],
        },
        expertisePool: [
          ['企业经营', '税务规划', '人力资源'],
          ['市场竞争', '供应链管理', '成本控制'],
          ['融资投资', '商业模式', '行业趋势'],
          ['政策合规', '法律风险', '企业转型'],
        ],
        biasPool: ['损失厌恶', '确认偏见', '过度自信', '锚定效应'],
      },
    },
    {
      role: '打工人',
      count: 10,
      modelTier: 'local',
      template: {
        professionPool: ['普通上班族', '工厂工人', '外卖骑手', '教师', '护士', '程序员', '销售员', '公务员', '自由职业者', '退休工人'],
        traitRanges: {
          riskTolerance: [0.1, 0.5],
          informationSensitivity: [0.4, 0.8],
          conformity: [0.5, 0.9],
          emotionality: [0.5, 0.9],
          analyticalDepth: [0.2, 0.6],
        },
        expertisePool: [
          ['就业市场', '工资收入'],
          ['社会保障', '医疗教育'],
          ['房价物价', '生活成本'],
          ['职业发展', '技能培训'],
        ],
        biasPool: ['从众心理', '损失厌恶', '权威偏见', '近因效应', '可得性偏差'],
      },
    },
    {
      role: '政策制定者',
      count: 5,
      modelTier: 'strong',
      template: {
        professionPool: ['政策研究员', '智库学者', '经济学教授', '政府顾问', '人大代表'],
        traitRanges: {
          riskTolerance: [0.2, 0.5],
          informationSensitivity: [0.7, 1.0],
          conformity: [0.2, 0.5],
          emotionality: [0.1, 0.3],
          analyticalDepth: [0.8, 1.0],
        },
        expertisePool: [
          ['宏观经济', '财政政策', '货币政策'],
          ['社会治理', '公共管理', '制度设计'],
          ['产业政策', '区域发展', '国际比较'],
          ['人口政策', '社会保障', '教育改革'],
        ],
        biasPool: ['确认偏见', '权威偏见', '维持现状偏见'],
      },
    },
    {
      role: '媒体人',
      count: 7,
      modelTier: 'cheap',
      template: {
        professionPool: ['时政记者', '社评作者', '自媒体博主', '新闻评论员', '调查记者', '社会学者', '公益人士'],
        traitRanges: {
          riskTolerance: [0.4, 0.7],
          informationSensitivity: [0.8, 1.0],
          conformity: [0.2, 0.5],
          emotionality: [0.3, 0.7],
          analyticalDepth: [0.5, 0.9],
        },
        expertisePool: [
          ['新闻报道', '深度调查', '舆论分析'],
          ['社会观察', '民生议题', '政策解读'],
          ['经济评论', '产业分析', '市场报道'],
          ['社交媒体', '内容传播', '公众沟通'],
        ],
        biasPool: ['可得性偏差', '确认偏见', '近因效应', '选择性关注'],
      },
    },
  ],

  eventSources: [
    {
      type: 'rss',
      name: '时政新闻',
      config: {
        sources: [
          {
            id: 'policy-news',
            name: '政策新闻源',
            url: 'https://news.example.com/policy/rss',
            category: 'politics',
            tags: ['政策', '时政', '社会'],
          },
        ],
        highImportanceKeywords: ['政策', '改革', '新规', '调控', '立法', '实施'],
        mediumImportanceKeywords: ['征求意见', '试点', '研究', '讨论', '方案'],
      },
    },
    {
      type: 'manual',
      name: '政策事件注入',
      config: {
        description: '手动注入政策发布、法规变化、社会事件等',
      },
    },
  ],

  worldConfig: {
    tickIntervalMs: 45_000,
    maxAgents: 80,
    eventRetentionTicks: 200,
    enableNaturalSelection: false,
  },

  consensusConfig: {
    minResponsesForSignal: 3,
    enableAlerts: true,
  },

  duration: 80,

  spawnRules: [
    {
      trigger: { type: 'event_keyword', keywords: ['新政', '改革', '调控', '税收', '裁员'] },
      template: {
        professionPool: ['关心时事的市民', '受影响行业从业者', '社交媒体评论者'],
        traitRanges: {
          riskTolerance: [0.2, 0.6],
          informationSensitivity: [0.5, 0.8],
          conformity: [0.5, 0.8],
          emotionality: [0.5, 0.9],
          analyticalDepth: [0.2, 0.5],
        },
        expertisePool: [['社会观察', '民生'], ['职场', '收入']],
        biasPool: ['从众心理', '权威偏见', '损失厌恶'],
      },
      count: 4,
      modelTier: 'local',
    },
    {
      trigger: { type: 'population_drop', threshold: 20 },
      template: {
        professionPool: ['普通市民', '社会观察者', '自媒体博主'],
        traitRanges: {
          riskTolerance: [0.2, 0.7],
          informationSensitivity: [0.4, 0.7],
          conformity: [0.4, 0.7],
          emotionality: [0.4, 0.7],
          analyticalDepth: [0.3, 0.6],
        },
        expertisePool: [['社会', '民生'], ['经济', '就业']],
        biasPool: ['从众心理', '权威偏见', '近因效应'],
      },
      count: 3,
      modelTier: 'local',
    },
  ],

  seedEvents: [
    {
      title: '政策影响评估启动',
      content: '政策影响评估仿真系统已启动，开始模拟不同利益群体对政策变化的反应。通过注入政策相关事件来驱动仿真，观察社会各阶层的连锁反应。',
      category: 'politics',
      importance: 0.5,
      tags: ['system', 'policy', 'startup'],
    },
  ],
};
