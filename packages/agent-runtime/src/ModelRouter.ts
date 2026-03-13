// ============================================================================
// ModelRouter — 模型路由器，根据 Agent 的 modelTier 路由到不同 LLM
// 支持运行时动态更新配置
// ============================================================================

import type { ModelTier, ModelRouterConfig, LLMConfig } from '@beeclaw/shared';
import { LLMClient } from './LLMClient.js';

/** apiKey 脱敏显示：只显示前4位和后4位 */
function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/** 脱敏后的 LLM 配置（用于 GET 响应） */
export interface LLMConfigMasked {
  baseURL: string;
  apiKey: string;  // 已脱敏
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/** 脱敏后的全部配置 */
export interface ModelRouterConfigMasked {
  local: LLMConfigMasked;
  cheap: LLMConfigMasked;
  strong: LLMConfigMasked;
}

const ALL_TIERS: ModelTier[] = ['local', 'cheap', 'strong'];

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
  private configs: Map<ModelTier, LLMConfig> = new Map();

  constructor(config?: ModelRouterConfig) {
    const cfg = config ?? getDefaultConfig();
    for (const tier of ALL_TIERS) {
      this.configs.set(tier, { ...cfg[tier] });
      this.clients.set(tier, new LLMClient(cfg[tier]));
    }
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

  // ── 动态配置 API ──

  /**
   * 运行时更新单个 tier 的 LLM 配置
   * 会创建新的 LLMClient 实例替换旧的
   */
  updateConfig(tier: ModelTier, config: LLMConfig): void {
    if (!ALL_TIERS.includes(tier)) {
      throw new Error(`Invalid model tier: ${tier}`);
    }
    this.configs.set(tier, { ...config });
    this.clients.set(tier, new LLMClient(config));
    console.log(`[ModelRouter] ${tier} 配置已更新 → model=${config.model}, baseURL=${config.baseURL}`);
  }

  /**
   * 一次更新所有 tier 的 LLM 配置
   */
  updateGlobalConfig(config: ModelRouterConfig): void {
    for (const tier of ALL_TIERS) {
      this.updateConfig(tier, config[tier]);
    }
  }

  /**
   * 获取当前所有 tier 的原始配置（apiKey 未脱敏）
   */
  getRawConfig(): ModelRouterConfig {
    return {
      local: { ...this.configs.get('local')! },
      cheap: { ...this.configs.get('cheap')! },
      strong: { ...this.configs.get('strong')! },
    };
  }

  /**
   * 获取当前所有 tier 的配置（apiKey 脱敏显示）
   */
  getConfig(): ModelRouterConfigMasked {
    const mask = (tier: ModelTier): LLMConfigMasked => {
      const cfg = this.configs.get(tier)!;
      return {
        baseURL: cfg.baseURL,
        apiKey: maskApiKey(cfg.apiKey),
        model: cfg.model,
        maxTokens: cfg.maxTokens,
        temperature: cfg.temperature,
      };
    };
    return {
      local: mask('local'),
      cheap: mask('cheap'),
      strong: mask('strong'),
    };
  }
}
