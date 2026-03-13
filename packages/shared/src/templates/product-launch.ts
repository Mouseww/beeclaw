// ============================================================================
// 产品舆论推演 — 场景模板
// Agents: 早期用户、意见领袖、普通消费者、竞品用户
// 事件源: RSS（产品相关新闻）
// 关注: 产品口碑传播和情绪变化
// ============================================================================

import type { ScenarioTemplate } from '../types.js';

export const productLaunchTemplate: ScenarioTemplate = {
  name: 'product-launch',
  description: '产品舆论推演 — 模拟新品发布后早期用户、意见领袖、普通消费者和竞品用户的口碑传播和情绪变化',

  agentProfiles: [
    {
      role: '早期用户',
      count: 8,
      modelTier: 'cheap',
      template: {
        professionPool: ['科技爱好者', '产品测评博主', '极客用户', '技术社区活跃者', '开发者', 'Beta测试者', '产品体验官', '数码发烧友'],
        traitRanges: {
          riskTolerance: [0.6, 1.0],
          informationSensitivity: [0.7, 1.0],
          conformity: [0.1, 0.4],
          emotionality: [0.3, 0.7],
          analyticalDepth: [0.5, 0.9],
        },
        expertisePool: [
          ['科技产品', '用户体验'],
          ['软件开发', '技术架构'],
          ['产品设计', '交互体验'],
          ['数码硬件', '性能评测'],
        ],
        biasPool: ['新奇偏好', '确认偏见', '过度自信', '锚定效应'],
      },
    },
    {
      role: '意见领袖',
      count: 5,
      modelTier: 'strong',
      template: {
        professionPool: ['科技KOL', '产品评测博主', '行业分析师', '知名自媒体人', '技术大V'],
        traitRanges: {
          riskTolerance: [0.4, 0.7],
          informationSensitivity: [0.7, 1.0],
          conformity: [0.1, 0.3],
          emotionality: [0.3, 0.6],
          analyticalDepth: [0.7, 1.0],
        },
        expertisePool: [
          ['产品评测', '用户体验', '行业分析'],
          ['科技趋势', 'AI人工智能', '消费电子'],
          ['内容创作', '社交媒体', '粉丝运营'],
          ['市场营销', '品牌策略', '消费心理'],
        ],
        biasPool: ['权威偏见', '确认偏见', '可得性偏差'],
      },
    },
    {
      role: '普通消费者',
      count: 10,
      modelTier: 'local',
      template: {
        professionPool: ['普通上班族', '学生', '家庭主妇', '自由职业者', '教师', '公务员', '店铺老板', '退休人员'],
        traitRanges: {
          riskTolerance: [0.2, 0.6],
          informationSensitivity: [0.3, 0.7],
          conformity: [0.5, 0.9],
          emotionality: [0.4, 0.8],
          analyticalDepth: [0.1, 0.5],
        },
        expertisePool: [
          ['日常消费', '生活品质'],
          ['社交媒体', '购物决策'],
          ['品牌认知', '口碑评价'],
          ['性价比', '实用性'],
        ],
        biasPool: ['从众心理', '权威偏见', '损失厌恶', '锚定效应', '可得性偏差'],
      },
    },
    {
      role: '竞品用户',
      count: 7,
      modelTier: 'cheap',
      template: {
        professionPool: ['竞品忠实用户', '品牌粉丝', '对比评测者', '产品经理', '行业从业者', '竞品社区管理员', '技术对比爱好者'],
        traitRanges: {
          riskTolerance: [0.2, 0.5],
          informationSensitivity: [0.5, 0.8],
          conformity: [0.3, 0.6],
          emotionality: [0.4, 0.8],
          analyticalDepth: [0.4, 0.7],
        },
        expertisePool: [
          ['竞品分析', '产品对比'],
          ['品牌忠诚', '用户社区'],
          ['产品功能', '技术规格'],
          ['市场竞争', '定价策略'],
        ],
        biasPool: ['确认偏见', '禀赋效应', '品牌忠诚偏见', '锚定效应'],
      },
    },
  ],

  eventSources: [
    {
      type: 'rss',
      name: '科技新闻',
      config: {
        sources: [
          {
            id: 'tech-news-36kr',
            name: '36氪科技',
            url: 'https://36kr.com/feed',
            category: 'tech',
            tags: ['科技', '产品', '创业'],
          },
        ],
        highImportanceKeywords: ['发布', '上市', '新品', '评测', '对比', '降价'],
        mediumImportanceKeywords: ['更新', '功能', '体验', '口碑', '销量'],
      },
    },
    {
      type: 'manual',
      name: '产品事件注入',
      config: {
        description: '手动注入产品发布、评测、价格变动等关键事件',
      },
    },
  ],

  worldConfig: {
    tickIntervalMs: 30_000,
    maxAgents: 80,
    eventRetentionTicks: 150,
    enableNaturalSelection: false,
  },

  consensusConfig: {
    minResponsesForSignal: 2,
    enableAlerts: true,
  },

  duration: 50,

  spawnRules: [
    {
      trigger: { type: 'event_keyword', keywords: ['发布', '上市', '新品', '评测'] },
      template: {
        professionPool: ['好奇观众', '潜在消费者', '吃瓜群众'],
        traitRanges: {
          riskTolerance: [0.3, 0.7],
          informationSensitivity: [0.5, 0.8],
          conformity: [0.5, 0.8],
          emotionality: [0.4, 0.7],
          analyticalDepth: [0.2, 0.5],
        },
        expertisePool: [['消费品', '购物'], ['社交媒体', '热点']],
        biasPool: ['从众心理', '新奇偏好', '可得性偏差'],
      },
      count: 3,
      modelTier: 'local',
    },
  ],

  seedEvents: [
    {
      title: '产品舆论推演启动',
      content: '产品舆论推演仿真系统已启动，开始追踪产品发布后的口碑传播和用户情绪变化。通过注入产品相关事件来驱动仿真。',
      category: 'tech',
      importance: 0.5,
      tags: ['system', 'product', 'startup'],
    },
  ],
};
