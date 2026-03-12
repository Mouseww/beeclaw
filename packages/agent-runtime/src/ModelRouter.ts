// ============================================================================
// ModelRouter — 模型路由器，根据 Agent 的 modelTier 路由到不同 LLM
// ============================================================================

import type { ModelTier, ModelRouterConfig, LLMConfig } from '@beeclaw/shared';
import { LLMClient } from './LLMClient.js';

/**
 * 默认模型路由配置（全部指向同一个 endpoint，生产环境应分开配置）
 */
function getDefaultConfig(): ModelRouterConfig {
  const baseURL = process.env['BEECLAW_LLM_BASE_URL'] ?? 'http://localhost:11434';
  const apiKey = process.env['BEECLAW_LLM_API_KEY'] ?? 'no-key';
  return {
    local: {
      baseURL,
      apiKey,
      model: process.env['BEECLAW_LOCAL_MODEL'] ?? 'qwen2.5:7b',
      maxTokens: 1024,
      temperature: 0.7,
    },
    cheap: {
      baseURL,
      apiKey,
      model: process.env['BEECLAW_CHEAP_MODEL'] ?? 'qwen2.5:7b',
      maxTokens: 1536,
      temperature: 0.7,
    },
    strong: {
      baseURL,
      apiKey,
      model: process.env['BEECLAW_STRONG_MODEL'] ?? 'qwen2.5:72b',
      maxTokens: 2048,
      temperature: 0.7,
    },
  };
}

export class ModelRouter {
  private clients: Map<ModelTier, LLMClient> = new Map();

  constructor(config?: ModelRouterConfig) {
    const cfg = config ?? getDefaultConfig();
    this.clients.set('local', new LLMClient(cfg.local));
    this.clients.set('cheap', new LLMClient(cfg.cheap));
    this.clients.set('strong', new LLMClient(cfg.strong));
  }

  /**
   * 获取指定层级的 LLM 客户端
   */
  getClient(tier: ModelTier): LLMClient {
    const client = this.clients.get(tier);
    if (!client) {
      throw new Error(`No LLM client configured for tier: ${tier}`);
    }
    return client;
  }

  /**
   * 获取指定层级的模型配置
   */
  getModelId(tier: ModelTier): string {
    return this.getClient(tier).getModel();
  }
}
