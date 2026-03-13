// ============================================================================
// 金融市场情绪预测 — 场景模板
// Agents: 散户、机构交易员、分析师、新闻记者
// 事件源: FinanceDataSource（股票/加密货币行情）
// 关注: 股价/加密货币情绪走向
// ============================================================================

import type { ScenarioTemplate } from '../types.js';

export const financeMarketTemplate: ScenarioTemplate = {
  name: 'finance-market',
  description: '金融市场情绪预测 — 模拟散户、机构交易员、分析师和财经记者对市场行情的群体反应，预测情绪走向',

  agentProfiles: [
    {
      role: '散户投资者',
      count: 10,
      modelTier: 'local',
      template: {
        professionPool: ['散户投资者', '个人理财者', '股票爱好者', '兼职炒股的上班族'],
        traitRanges: {
          riskTolerance: [0.3, 0.9],
          informationSensitivity: [0.5, 0.9],
          conformity: [0.5, 0.9],
          emotionality: [0.5, 0.9],
          analyticalDepth: [0.1, 0.5],
        },
        expertisePool: [
          ['股票投资', '技术分析'],
          ['加密货币', '短线交易'],
          ['基金理财', '市场热点'],
          ['社交媒体', '散户论坛'],
        ],
        biasPool: ['从众心理', '损失厌恶', '过度自信', '锚定效应', '近因效应'],
      },
    },
    {
      role: '机构交易员',
      count: 5,
      modelTier: 'cheap',
      template: {
        professionPool: ['量化交易员', '基金经理', '对冲基金分析师', '投行交易员', '资产管理经理'],
        traitRanges: {
          riskTolerance: [0.3, 0.7],
          informationSensitivity: [0.6, 0.9],
          conformity: [0.2, 0.5],
          emotionality: [0.1, 0.4],
          analyticalDepth: [0.7, 1.0],
        },
        expertisePool: [
          ['量化分析', '衍生品定价'],
          ['宏观经济', '货币政策'],
          ['风险管理', '资产配置'],
          ['算法交易', '高频交易'],
        ],
        biasPool: ['过度自信', '确认偏见', '锚定效应', '幸存者偏差'],
      },
    },
    {
      role: '金融分析师',
      count: 5,
      modelTier: 'strong',
      template: {
        professionPool: ['证券分析师', '首席经济学家', '策略研究员', '行业分析师', '独立投资顾问'],
        traitRanges: {
          riskTolerance: [0.3, 0.6],
          informationSensitivity: [0.7, 1.0],
          conformity: [0.2, 0.5],
          emotionality: [0.1, 0.4],
          analyticalDepth: [0.8, 1.0],
        },
        expertisePool: [
          ['宏观经济', '货币政策', '财政政策'],
          ['股票投资', '基本面分析', '技术分析'],
          ['加密货币', '区块链', 'DeFi'],
          ['国际贸易', '地缘政治', '大宗商品'],
        ],
        biasPool: ['确认偏见', '权威偏见', '锚定效应'],
      },
    },
    {
      role: '财经记者',
      count: 5,
      modelTier: 'cheap',
      template: {
        professionPool: ['财经记者', '金融自媒体博主', '经济评论员', '市场观察员', '投资内容创作者'],
        traitRanges: {
          riskTolerance: [0.3, 0.7],
          informationSensitivity: [0.8, 1.0],
          conformity: [0.3, 0.6],
          emotionality: [0.4, 0.7],
          analyticalDepth: [0.4, 0.7],
        },
        expertisePool: [
          ['财经报道', '市场分析'],
          ['科技行业', 'AI人工智能'],
          ['宏观经济', '政策解读'],
          ['社交媒体', '舆论传播'],
        ],
        biasPool: ['近因效应', '确认偏见', '可得性偏差', '权威偏见'],
      },
    },
  ],

  eventSources: [
    {
      type: 'finance',
      name: '美股核心行情',
      config: {
        id: 'us-stocks',
        name: '美股核心行情',
        symbols: [
          { symbol: 'AAPL', name: 'Apple', type: 'stock' },
          { symbol: 'GOOGL', name: 'Alphabet', type: 'stock' },
          { symbol: 'MSFT', name: 'Microsoft', type: 'stock' },
          { symbol: 'TSLA', name: 'Tesla', type: 'stock' },
          { symbol: 'NVDA', name: 'NVIDIA', type: 'stock' },
        ],
        pollIntervalMs: 60_000,
        priceChangeThreshold: 2,
        enableSentimentEvents: true,
      },
    },
    {
      type: 'finance',
      name: '加密货币行情',
      config: {
        id: 'crypto',
        name: '加密货币行情',
        symbols: [
          { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', tags: ['crypto', 'BTC'] },
          { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto', tags: ['crypto', 'ETH'] },
          { symbol: 'SOL-USD', name: 'Solana', type: 'crypto', tags: ['crypto', 'SOL'] },
        ],
        pollIntervalMs: 60_000,
        priceChangeThreshold: 3,
        enableSentimentEvents: true,
      },
    },
  ],

  worldConfig: {
    tickIntervalMs: 60_000,
    maxAgents: 100,
    eventRetentionTicks: 200,
    enableNaturalSelection: true,
  },

  consensusConfig: {
    minResponsesForSignal: 3,
    enableAlerts: true,
  },

  duration: 100,

  spawnRules: [
    {
      trigger: { type: 'event_keyword', keywords: ['暴涨', '暴跌', '崩盘', '创新高'] },
      template: {
        professionPool: ['散户投资者', '跟风炒股者', '恐慌抛售者'],
        traitRanges: {
          riskTolerance: [0.5, 1.0],
          informationSensitivity: [0.7, 1.0],
          conformity: [0.7, 1.0],
          emotionality: [0.7, 1.0],
          analyticalDepth: [0.1, 0.3],
        },
        expertisePool: [['股票', '短线'], ['加密货币', '投机']],
        biasPool: ['从众心理', '损失厌恶', '过度自信'],
      },
      count: 3,
      modelTier: 'local',
    },
    {
      trigger: { type: 'population_drop', threshold: 15 },
      template: {
        professionPool: ['散户投资者', '金融分析师', '记者'],
        traitRanges: {
          riskTolerance: [0.2, 0.8],
          informationSensitivity: [0.3, 0.8],
          conformity: [0.3, 0.7],
          emotionality: [0.3, 0.7],
          analyticalDepth: [0.3, 0.7],
        },
        expertisePool: [['金融', '股票'], ['经济', '政策']],
        biasPool: ['确认偏见', '锚定效应', '从众心理'],
      },
      count: 5,
      modelTier: 'cheap',
    },
  ],

  seedEvents: [
    {
      title: '金融市场仿真启动',
      content: '金融市场情绪仿真系统已启动，开始监测市场行情和群体情绪变化。关注重点：美股科技股和主流加密货币的价格波动及情绪反应。',
      category: 'finance',
      importance: 0.6,
      tags: ['system', 'finance', 'startup'],
    },
  ],
};
