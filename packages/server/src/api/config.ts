// ============================================================================
// BeeClaw Server — API: /api/config/llm
// LLM 配置动态管理（查询 + 更新 + 持久化）
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import type { LLMConfig, ModelTier } from '@beeclaw/shared';

const VALID_TIERS: ModelTier[] = ['local', 'cheap', 'strong'];

/** 校验 LLMConfig 字段 */
function validateLLMConfig(body: unknown): LLMConfig | string {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object';

  const obj = body as Record<string, unknown>;

  if (typeof obj['baseURL'] !== 'string' || obj['baseURL'].length === 0) {
    return 'baseURL is required and must be a non-empty string';
  }
  if (typeof obj['apiKey'] !== 'string' || obj['apiKey'].length === 0) {
    return 'apiKey is required and must be a non-empty string';
  }
  if (typeof obj['model'] !== 'string' || obj['model'].length === 0) {
    return 'model is required and must be a non-empty string';
  }
  if (obj['maxTokens'] !== undefined && (typeof obj['maxTokens'] !== 'number' || obj['maxTokens'] <= 0)) {
    return 'maxTokens must be a positive number';
  }
  if (obj['temperature'] !== undefined && (typeof obj['temperature'] !== 'number' || obj['temperature'] < 0 || obj['temperature'] > 2)) {
    return 'temperature must be a number between 0 and 2';
  }

  return {
    baseURL: obj['baseURL'] as string,
    apiKey: obj['apiKey'] as string,
    model: obj['model'] as string,
    maxTokens: obj['maxTokens'] as number | undefined,
    temperature: obj['temperature'] as number | undefined,
  };
}

export function registerConfigRoute(app: FastifyInstance, ctx: ServerContext): void {
  // GET /api/config/llm — 获取当前 LLM 配置（apiKey 脱敏）
  app.get('/api/config/llm', async () => {
    return ctx.modelRouter.getConfig();
  });

  // PUT /api/config/llm — 更新全部 LLM 配置
  app.put('/api/config/llm', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'Body must contain local, cheap, strong configs' });
    }

    // 校验每个 tier
    const configs: Record<string, LLMConfig> = {};
    for (const tier of VALID_TIERS) {
      const tierBody = body[tier];
      if (!tierBody) {
        return reply.code(400).send({ error: `Missing config for tier: ${tier}` });
      }
      const result = validateLLMConfig(tierBody);
      if (typeof result === 'string') {
        return reply.code(400).send({ error: `${tier}: ${result}` });
      }
      configs[tier] = result;
    }

    // 更新 ModelRouter
    ctx.modelRouter.updateGlobalConfig({
      local: configs['local']!,
      cheap: configs['cheap']!,
      strong: configs['strong']!,
    });

    // 持久化到数据库
    ctx.store.saveLLMConfigs({
      local: configs['local']!,
      cheap: configs['cheap']!,
      strong: configs['strong']!,
    });

    console.log('[Config] LLM 全局配置已更新并持久化');
    return { ok: true, config: ctx.modelRouter.getConfig() };
  });

  // PUT /api/config/llm/:tier — 更新单个 tier 配置
  app.put<{ Params: { tier: string } }>('/api/config/llm/:tier', async (req, reply) => {
    const tier = req.params.tier as ModelTier;
    if (!VALID_TIERS.includes(tier)) {
      return reply.code(400).send({ error: `Invalid tier: ${tier}. Must be one of: ${VALID_TIERS.join(', ')}` });
    }

    const result = validateLLMConfig(req.body);
    if (typeof result === 'string') {
      return reply.code(400).send({ error: result });
    }

    // 更新 ModelRouter
    ctx.modelRouter.updateConfig(tier, result);

    // 持久化到数据库
    ctx.store.saveLLMConfig(tier, result);

    console.log(`[Config] LLM ${tier} 配置已更新并持久化`);
    return { ok: true, tier, config: ctx.modelRouter.getConfig() };
  });
}
