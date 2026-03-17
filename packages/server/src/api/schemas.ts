// ============================================================================
// BeeClaw Server — OpenAPI JSON Schema 定义
// 集中定义所有 API 端点的 request/response schema
// ============================================================================

/** 通用错误响应 */
export const ErrorResponseSchema = {
  type: 'object' as const,
  properties: {
    error: { type: 'string' as const },
  },
  required: ['error'],
};

// ── /api/status ──

export const statusSchema = {
  tags: ['status'],
  summary: '获取世界状态快照',
  response: {
    200: {
      type: 'object' as const,
      properties: {
        tick: { type: 'integer' as const },
        agentCount: { type: 'integer' as const },
        activeAgents: { type: 'integer' as const },
        sentiment: { type: 'object' as const, additionalProperties: true },
        activeEvents: { type: 'integer' as const },
        lastTick: { type: ['object', 'null'] as const, additionalProperties: true },
        wsConnections: { type: 'integer' as const },
        uptime: { type: 'number' as const },
        running: { type: 'boolean' as const },
      },
    },
  },
};

// ── /api/agents ──

export const agentsListSchema = {
  tags: ['agents'],
  summary: '获取 Agent 列表（分页）',
  querystring: {
    type: 'object' as const,
    properties: {
      page: { type: 'string' as const, description: '页码（默认 1）' },
      size: { type: 'string' as const, description: '每页数量（默认 20，最大 100）' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        agents: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              name: { type: 'string' as const },
              profession: { type: 'string' as const },
              status: { type: 'string' as const, enum: ['active', 'dormant', 'dead'] },
              influence: { type: 'number' as const },
              credibility: { type: 'number' as const },
              modelTier: { type: 'string' as const, enum: ['local', 'cheap', 'strong'] },
              followers: { type: 'integer' as const },
              following: { type: 'integer' as const },
              lastActiveTick: { type: 'integer' as const },
            },
          },
        },
        page: { type: 'integer' as const },
        size: { type: 'integer' as const },
        total: { type: 'integer' as const },
        pages: { type: 'integer' as const },
      },
    },
  },
};

export const agentDetailSchema = {
  tags: ['agents'],
  summary: '获取 Agent 详情',
  params: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' as const, description: 'Agent ID' },
    },
    required: ['id'],
  },
  response: {
    200: {
      type: 'object' as const,
      additionalProperties: true,
      description: 'Agent 完整数据',
    },
    404: ErrorResponseSchema,
  },
};

// ── /api/events ──

export const injectEventSchema = {
  tags: ['events'],
  summary: '注入事件到世界',
  body: {
    type: 'object' as const,
    required: ['title', 'content'],
    properties: {
      title: { type: 'string' as const, description: '事件标题' },
      content: { type: 'string' as const, description: '事件内容' },
      category: {
        type: 'string' as const,
        enum: ['finance', 'politics', 'tech', 'social', 'general'],
        description: '事件分类（默认 general）',
      },
      importance: { type: 'number' as const, minimum: 0, maximum: 1, description: '重要性 0-1（默认 0.6）' },
      propagationRadius: { type: 'number' as const, minimum: 0, maximum: 1, description: '传播半径 0-1（默认 0.5）' },
      tags: { type: 'array' as const, items: { type: 'string' as const }, description: '标签' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        ok: { type: 'boolean' as const },
        event: { type: 'object' as const, additionalProperties: true },
      },
    },
    400: ErrorResponseSchema,
  },
};

// ── /api/consensus ──

export const consensusSchema = {
  tags: ['consensus'],
  summary: '查询共识信号',
  querystring: {
    type: 'object' as const,
    properties: {
      topic: { type: 'string' as const, description: '按话题过滤' },
      limit: { type: 'string' as const, description: '返回数量上限（默认 20，最大 50）' },
      from_db: { type: 'string' as const, description: '从数据库查询历史（true/false）' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      additionalProperties: true,
      description: '共识信号列表或单个话题的信号历史',
    },
  },
};

// ── /api/history ──

export const historySchema = {
  tags: ['history'],
  summary: '获取 Tick 历史',
  querystring: {
    type: 'object' as const,
    properties: {
      limit: { type: 'string' as const, description: '返回数量上限（默认 50，最大 200）' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        history: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
        source: { type: 'string' as const, enum: ['db', 'memory'] },
      },
    },
  },
};

// ── /api/scenario ──

export const scenarioSchema = {
  tags: ['scenario'],
  summary: '运行场景推演',
  body: {
    type: 'object' as const,
    required: ['seedEvent'],
    properties: {
      seedEvent: {
        type: 'object' as const,
        required: ['title', 'content'],
        properties: {
          title: { type: 'string' as const },
          content: { type: 'string' as const },
          category: { type: 'string' as const, enum: ['finance', 'politics', 'tech', 'social', 'general'] },
          importance: { type: 'number' as const, minimum: 0, maximum: 1 },
          tags: { type: 'array' as const, items: { type: 'string' as const } },
        },
      },
      agentCount: { type: 'integer' as const, minimum: 1, description: 'Agent 数量（默认 10，超过 50 会被 clamp）' },
      ticks: { type: 'integer' as const, minimum: 1, maximum: 20, description: '推演 Tick 数（默认 5，最大 20）' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        scenario: { type: 'string' as const },
        agentCount: { type: 'integer' as const },
        ticks: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
        consensus: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
        agents: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              name: { type: 'string' as const },
              profession: { type: 'string' as const },
              status: { type: 'string' as const },
            },
          },
        },
      },
    },
    400: ErrorResponseSchema,
  },
};

// ── /metrics ──

export const metricsSchema = {
  tags: ['monitoring'],
  summary: '获取运行时指标（JSON）',
  response: {
    200: {
      type: 'object' as const,
      additionalProperties: true,
      description: '详细运行时指标',
    },
  },
};

// ── /health ──

export const healthSchema = {
  tags: ['monitoring'],
  summary: '健康检查',
  response: {
    200: {
      type: 'object' as const,
      properties: {
        status: { type: 'string' as const, enum: ['ok'] },
        uptime: { type: 'number' as const },
        version: { type: 'string' as const },
        tick: { type: 'integer' as const },
      },
    },
  },
};

// ── /metrics/prometheus ──

export const prometheusSchema = {
  tags: ['monitoring'],
  summary: '获取 Prometheus 格式指标',
  response: {
    200: {
      type: 'string' as const,
      description: 'Prometheus text exposition format',
    },
  },
};

// ── /api/config/llm ──

const llmConfigObjectSchema = {
  type: 'object' as const,
  required: ['baseURL', 'apiKey', 'model'],
  properties: {
    baseURL: { type: 'string' as const },
    apiKey: { type: 'string' as const },
    model: { type: 'string' as const },
    maxTokens: { type: 'integer' as const, minimum: 1 },
    temperature: { type: 'number' as const, minimum: 0, maximum: 2 },
  },
};

export const getLLMConfigSchema = {
  tags: ['config'],
  summary: '获取当前 LLM 配置',
  response: {
    200: {
      type: 'object' as const,
      additionalProperties: true,
      description: 'LLM 配置（apiKey 脱敏）',
    },
  },
};

export const putLLMConfigSchema = {
  tags: ['config'],
  summary: '更新全部 LLM 配置',
  body: {
    type: 'object' as const,
    required: ['local', 'cheap', 'strong'],
    properties: {
      local: llmConfigObjectSchema,
      cheap: llmConfigObjectSchema,
      strong: llmConfigObjectSchema,
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        ok: { type: 'boolean' as const },
        config: { type: 'object' as const, additionalProperties: true },
      },
    },
    400: ErrorResponseSchema,
  },
};

export const putLLMTierConfigSchema = {
  tags: ['config'],
  summary: '更新单个 tier 的 LLM 配置',
  params: {
    type: 'object' as const,
    properties: {
      tier: { type: 'string' as const, description: 'LLM tier (local, cheap, strong)' },
    },
    required: ['tier'],
  },
  body: llmConfigObjectSchema,
  response: {
    200: {
      type: 'object' as const,
      properties: {
        ok: { type: 'boolean' as const },
        tier: { type: 'string' as const },
        config: { type: 'object' as const, additionalProperties: true },
      },
    },
    400: ErrorResponseSchema,
  },
};

// ── /api/webhooks ──

const webhookEventTypes = ['consensus.signal', 'trend.detected', 'trend.shift', 'agent.spawned', 'tick.completed'] as const;

export const createWebhookSchema = {
  tags: ['webhooks'],
  summary: '创建 webhook 订阅',
  body: {
    type: 'object' as const,
    required: ['url', 'events'],
    properties: {
      url: { type: 'string' as const, format: 'uri', description: 'Webhook 回调 URL' },
      events: {
        type: 'array' as const,
        minItems: 1,
        items: { type: 'string' as const, enum: [...webhookEventTypes] },
        description: '订阅的事件类型',
      },
      secret: { type: 'string' as const, description: '自定义 HMAC secret（不提供则自动生成）' },
    },
  },
  response: {
    201: {
      type: 'object' as const,
      properties: {
        ok: { type: 'boolean' as const },
        webhook: { type: 'object' as const, additionalProperties: true },
      },
    },
    400: ErrorResponseSchema,
  },
};

export const listWebhooksSchema = {
  tags: ['webhooks'],
  summary: '列出所有 webhook',
  response: {
    200: {
      type: 'object' as const,
      properties: {
        webhooks: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
        total: { type: 'integer' as const },
      },
    },
  },
};

export const deleteWebhookSchema = {
  tags: ['webhooks'],
  summary: '删除 webhook',
  params: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' as const, description: 'Webhook ID' },
    },
    required: ['id'],
  },
  response: {
    200: {
      type: 'object' as const,
      properties: { ok: { type: 'boolean' as const } },
    },
    404: ErrorResponseSchema,
  },
};

export const updateWebhookSchema = {
  tags: ['webhooks'],
  summary: '更新 webhook',
  params: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' as const, description: 'Webhook ID' },
    },
    required: ['id'],
  },
  body: {
    type: 'object' as const,
    properties: {
      url: { type: 'string' as const, format: 'uri' },
      events: {
        type: 'array' as const,
        minItems: 1,
        items: { type: 'string' as const, enum: [...webhookEventTypes] },
      },
      active: { type: 'boolean' as const },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        ok: { type: 'boolean' as const },
        webhook: { type: 'object' as const, additionalProperties: true },
      },
    },
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
};

export const testWebhookSchema = {
  tags: ['webhooks'],
  summary: '发送测试 webhook payload',
  params: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' as const, description: 'Webhook ID' },
    },
    required: ['id'],
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        ok: { type: 'boolean' as const },
        delivery: { type: 'object' as const, additionalProperties: true },
      },
    },
    404: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

// ── /api/ingestion ──

/** 单个 RSS 数据源状态 */
const ingestionSourceStatusSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    name: { type: 'string' as const },
    url: { type: 'string' as const },
    enabled: { type: 'boolean' as const },
    lastPollTime: { type: ['string', 'null'] as const },
    lastError: { type: ['string', 'null'] as const },
    itemsFetched: { type: 'integer' as const },
    eventsEmitted: { type: 'integer' as const },
  },
};

/** 单个金融数据源状态 */
const ingestionFinanceSourceStatusSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    name: { type: 'string' as const },
    enabled: { type: 'boolean' as const },
    running: { type: 'boolean' as const },
    lastPollTime: { type: ['string', 'null'] as const },
    lastError: { type: ['string', 'null'] as const },
    symbolCount: { type: 'integer' as const },
    quotesPolled: { type: 'integer' as const },
    eventsEmitted: { type: 'integer' as const },
  },
};

export const ingestionStatusSchema = {
  tags: ['ingestion'],
  summary: '获取事件接入状态汇总',
  response: {
    200: {
      type: 'object' as const,
      properties: {
        running: { type: 'boolean' as const },
        sourceCount: { type: 'integer' as const },
        financeSourceCount: { type: 'integer' as const },
        deduplicationCacheSize: { type: 'integer' as const },
        sources: {
          type: 'array' as const,
          items: ingestionSourceStatusSchema,
        },
        financeSources: {
          type: 'array' as const,
          items: ingestionFinanceSourceStatusSchema,
        },
      },
    },
    503: ErrorResponseSchema,
  },
};

export const ingestionSourceDetailSchema = {
  tags: ['ingestion'],
  summary: '获取单个 RSS 数据源详情',
  params: {
    type: 'object' as const,
    properties: {
      sourceId: { type: 'string' as const, description: '数据源 ID' },
    },
    required: ['sourceId'],
  },
  response: {
    200: ingestionSourceStatusSchema,
    404: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

// ── v2.0: /api/ticks/:tick/events ──

export const tickEventsSchema = {
  tags: ['history'],
  summary: '获取某个 Tick 的所有事件',
  params: {
    type: 'object' as const,
    properties: {
      tick: { type: 'string' as const, description: 'Tick 编号' },
    },
    required: ['tick'],
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        tick: { type: 'integer' as const },
        events: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
        count: { type: 'integer' as const },
      },
    },
  },
};

// ── v2.0: /api/ticks/:tick/responses ──

export const tickResponsesSchema = {
  tags: ['history'],
  summary: '获取某个 Tick 的所有 Agent 响应',
  params: {
    type: 'object' as const,
    properties: {
      tick: { type: 'string' as const, description: 'Tick 编号' },
    },
    required: ['tick'],
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        tick: { type: 'integer' as const },
        responses: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
        count: { type: 'integer' as const },
      },
    },
  },
};

// ── v2.0: /api/events/search ──

export const eventSearchSchema = {
  tags: ['events'],
  summary: '搜索事件',
  querystring: {
    type: 'object' as const,
    properties: {
      q: { type: 'string' as const, description: '搜索关键词' },
      limit: { type: 'string' as const, description: '返回数量上限（默认 20，最大 100）' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const },
        events: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
        count: { type: 'integer' as const },
      },
    },
    400: ErrorResponseSchema,
  },
};

// ── v2.0: /api/keys ──

export const createApiKeySchema = {
  tags: ['auth'],
  summary: '创建新 API Key',
  body: {
    type: 'object' as const,
    required: ['name'],
    properties: {
      name: { type: 'string' as const, description: 'API Key 名称' },
      permissions: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: '权限列表',
      },
      rateLimit: { type: 'integer' as const, minimum: 1, description: '速率限制（每分钟请求数，默认 100）' },
    },
  },
  response: {
    201: {
      type: 'object' as const,
      properties: {
        ok: { type: 'boolean' as const },
        id: { type: 'string' as const },
        name: { type: 'string' as const },
        key: { type: 'string' as const, description: '仅返回一次的明文 API Key' },
      },
    },
    400: ErrorResponseSchema,
  },
};

export const listApiKeysSchema = {
  tags: ['auth'],
  summary: '列出所有 API Key',
  response: {
    200: {
      type: 'object' as const,
      properties: {
        keys: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              name: { type: 'string' as const },
              permissions: { type: 'array' as const, items: { type: 'string' as const } },
              rateLimit: { type: 'integer' as const },
              createdAt: { type: 'integer' as const },
              lastUsedAt: { type: ['integer', 'null'] as const },
              active: { type: 'boolean' as const },
            },
          },
        },
        total: { type: 'integer' as const },
      },
    },
  },
};

export const deleteApiKeySchema = {
  tags: ['auth'],
  summary: '删除 API Key',
  params: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' as const, description: 'API Key ID' },
    },
    required: ['id'],
  },
  response: {
    200: {
      type: 'object' as const,
      properties: { ok: { type: 'boolean' as const } },
    },
    404: ErrorResponseSchema,
  },
};

// ── /api/signals (Phase 2.2) ──

/** 信号可信度评分 schema */
const signalCredibilitySchema = {
  type: 'object' as const,
  properties: {
    weightedScore: { type: 'number' as const },
    agentCount: { type: 'integer' as const },
    avgCredibility: { type: 'number' as const },
    highCredibilityCount: { type: 'integer' as const },
  },
};

/** 标准化预测信号 schema */
const predictionSignalSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    topic: { type: 'string' as const },
    tick: { type: 'integer' as const },
    timestamp: { type: 'number' as const },
    sentimentDistribution: {
      type: 'object' as const,
      properties: {
        bullish: { type: 'number' as const },
        bearish: { type: 'number' as const },
        neutral: { type: 'number' as const },
      },
    },
    consensus: { type: 'number' as const },
    intensity: { type: 'number' as const },
    trend: { type: 'string' as const, enum: ['forming', 'strengthening', 'weakening', 'reversing'] },
    credibility: signalCredibilitySchema,
    alerts: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
    topArguments: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
  },
};

export const signalsLatestSchema = {
  tags: ['signals'],
  summary: '获取最新预测信号',
  querystring: {
    type: 'object' as const,
    properties: {
      limit: { type: 'string' as const, description: '返回数量上限（默认 20，最大 50）' },
      topic: { type: 'string' as const, description: '按 topic 过滤' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        signals: { type: 'array' as const, items: predictionSignalSchema },
        total: { type: 'integer' as const },
        topic: { type: ['string', 'null'] as const },
        timestamp: { type: 'number' as const },
      },
    },
  },
};

export const signalsTopicSchema = {
  tags: ['signals'],
  summary: '按 topic 查询信号历史与趋势分析',
  params: {
    type: 'object' as const,
    properties: {
      topic: { type: 'string' as const, description: 'Topic 名称' },
    },
    required: ['topic'],
  },
  querystring: {
    type: 'object' as const,
    properties: {
      limit: { type: 'string' as const, description: '返回数量上限（默认 50，最大 100）' },
      from_tick: { type: 'string' as const, description: '起始 tick（含）' },
      to_tick: { type: 'string' as const, description: '结束 tick（含）' },
    },
  },
  response: {
    200: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string' as const },
        signals: { type: 'array' as const, items: predictionSignalSchema },
        total: { type: 'integer' as const },
        trend: {
          type: 'object' as const,
          properties: {
            direction: { type: 'string' as const, enum: ['forming', 'strengthening', 'weakening', 'reversing'] },
            momentumDelta: { type: 'number' as const },
            sentimentMean: { type: 'number' as const },
            dataPoints: { type: 'integer' as const },
          },
        },
        timestamp: { type: 'number' as const },
      },
    },
  },
};

export const signalsTrendsSchema = {
  tags: ['signals'],
  summary: '获取当前活跃趋势摘要',
  response: {
    200: {
      type: 'object' as const,
      properties: {
        activeTopics: { type: 'integer' as const },
        topics: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              topic: { type: 'string' as const },
              latestSignal: predictionSignalSchema,
              trend: { type: 'string' as const, enum: ['forming', 'strengthening', 'weakening', 'reversing'] },
              signalCount: { type: 'integer' as const },
            },
          },
        },
        globalSentimentMean: { type: 'number' as const },
        highConfidenceAlerts: { type: 'integer' as const },
        timestamp: { type: 'number' as const },
      },
    },
  },
};

export const signalsAccuracySchema = {
  tags: ['signals'],
  summary: '获取预测准确性统计',
  response: {
    200: {
      type: 'object' as const,
      properties: {
        totalSignals: { type: 'integer' as const },
        evaluatedSignals: { type: 'integer' as const },
        accuracyRate: { type: 'number' as const },
        byTopic: { type: 'object' as const, additionalProperties: true },
        byTrend: { type: 'object' as const, additionalProperties: true },
        timestamp: { type: 'number' as const },
      },
    },
  },
};
