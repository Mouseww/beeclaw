// ============================================================================
// @beeclaw/agent-runtime ModelRouter 单元测试
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { ModelRouter } from './ModelRouter.js';
import type { ModelRouterConfig } from '@beeclaw/shared';

const TEST_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://local:8000', apiKey: 'key-local', model: 'local-model', maxTokens: 512, temperature: 0.5 },
  cheap: { baseURL: 'http://cheap:8000', apiKey: 'key-cheap', model: 'cheap-model', maxTokens: 1024, temperature: 0.7 },
  strong: { baseURL: 'http://strong:8000', apiKey: 'key-strong', model: 'strong-model', maxTokens: 2048, temperature: 0.8 },
};

describe('ModelRouter', () => {
  describe('getClient', () => {
    it('应返回 local 层级的客户端', () => {
      const router = new ModelRouter(TEST_CONFIG);
      const client = router.getClient('local');
      expect(client).toBeDefined();
      expect(client.getModel()).toBe('local-model');
    });

    it('应返回 cheap 层级的客户端', () => {
      const router = new ModelRouter(TEST_CONFIG);
      const client = router.getClient('cheap');
      expect(client.getModel()).toBe('cheap-model');
    });

    it('应返回 strong 层级的客户端', () => {
      const router = new ModelRouter(TEST_CONFIG);
      const client = router.getClient('strong');
      expect(client.getModel()).toBe('strong-model');
    });
  });

  describe('getModelId', () => {
    it('应返回指定层级的模型 ID', () => {
      const router = new ModelRouter(TEST_CONFIG);
      expect(router.getModelId('local')).toBe('local-model');
      expect(router.getModelId('cheap')).toBe('cheap-model');
      expect(router.getModelId('strong')).toBe('strong-model');
    });
  });

  describe('默认配置', () => {
    it('不传配置时应使用默认值，不抛出', () => {
      expect(() => new ModelRouter()).not.toThrow();
    });

    it('默认配置应有三个层级', () => {
      const router = new ModelRouter();
      expect(router.getClient('local')).toBeDefined();
      expect(router.getClient('cheap')).toBeDefined();
      expect(router.getClient('strong')).toBeDefined();
    });
  });

  // ── 动态配置 API ──

  describe('updateConfig', () => {
    it('应更新单个 tier 的配置并创建新客户端', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const router = new ModelRouter(TEST_CONFIG);

      const newConfig = {
        baseURL: 'http://new-local:9000',
        apiKey: 'new-key-local',
        model: 'new-local-model',
        maxTokens: 2048,
        temperature: 0.9,
      };
      router.updateConfig('local', newConfig);

      expect(router.getModelId('local')).toBe('new-local-model');
      // 其他 tier 不受影响
      expect(router.getModelId('cheap')).toBe('cheap-model');
      expect(router.getModelId('strong')).toBe('strong-model');
    });

    it('更新后 getRawConfig 应反映新配置', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const router = new ModelRouter(TEST_CONFIG);

      router.updateConfig('strong', {
        baseURL: 'http://new-strong:9000',
        apiKey: 'new-key-strong-1234',
        model: 'gpt-4-turbo',
      });

      const raw = router.getRawConfig();
      expect(raw.strong.model).toBe('gpt-4-turbo');
      expect(raw.strong.baseURL).toBe('http://new-strong:9000');
      expect(raw.strong.apiKey).toBe('new-key-strong-1234');
    });

    it('无效 tier 应抛出错误', () => {
      const router = new ModelRouter(TEST_CONFIG);
      expect(() =>
        router.updateConfig('invalid' as 'local', {
          baseURL: 'http://x',
          apiKey: 'k',
          model: 'm',
        })
      ).toThrow('Invalid model tier');
    });
  });

  describe('updateGlobalConfig', () => {
    it('应同时更新所有 tier 的配置', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const router = new ModelRouter(TEST_CONFIG);

      const newGlobalConfig: ModelRouterConfig = {
        local: { baseURL: 'http://gl:1000', apiKey: 'gl-key', model: 'gl-local' },
        cheap: { baseURL: 'http://gl:2000', apiKey: 'gl-key', model: 'gl-cheap' },
        strong: { baseURL: 'http://gl:3000', apiKey: 'gl-key', model: 'gl-strong' },
      };
      router.updateGlobalConfig(newGlobalConfig);

      expect(router.getModelId('local')).toBe('gl-local');
      expect(router.getModelId('cheap')).toBe('gl-cheap');
      expect(router.getModelId('strong')).toBe('gl-strong');
    });
  });

  describe('getRawConfig', () => {
    it('应返回所有 tier 的原始配置（含完整 apiKey）', () => {
      const router = new ModelRouter(TEST_CONFIG);
      const raw = router.getRawConfig();

      expect(raw.local.apiKey).toBe('key-local');
      expect(raw.cheap.apiKey).toBe('key-cheap');
      expect(raw.strong.apiKey).toBe('key-strong');
      expect(raw.local.model).toBe('local-model');
      expect(raw.cheap.baseURL).toBe('http://cheap:8000');
      expect(raw.strong.maxTokens).toBe(2048);
    });

    it('返回值应是副本，修改不影响内部状态', () => {
      const router = new ModelRouter(TEST_CONFIG);
      const raw = router.getRawConfig();
      raw.local.model = 'tampered';

      expect(router.getModelId('local')).toBe('local-model');
    });
  });

  describe('getConfig（脱敏）', () => {
    it('应返回脱敏后的配置', () => {
      const router = new ModelRouter(TEST_CONFIG);
      const masked = router.getConfig();

      // apiKey 应被脱敏（key-local 长度为 9 > 8）
      expect(masked.local.apiKey).toBe('key-****ocal');
      expect(masked.local.model).toBe('local-model');
      expect(masked.local.baseURL).toBe('http://local:8000');
      expect(masked.local.maxTokens).toBe(512);
      expect(masked.local.temperature).toBe(0.5);
    });

    it('短 apiKey（<=8 字符）应显示为 ****', () => {
      const shortKeyConfig: ModelRouterConfig = {
        local: { baseURL: 'http://x', apiKey: 'short', model: 'm' },
        cheap: { baseURL: 'http://x', apiKey: '12345678', model: 'm' },
        strong: { baseURL: 'http://x', apiKey: '', model: 'm' },
      };
      const router = new ModelRouter(shortKeyConfig);
      const masked = router.getConfig();

      expect(masked.local.apiKey).toBe('****'); // 'short' 长度 5 <= 8
      expect(masked.cheap.apiKey).toBe('****'); // '12345678' 长度 8 <= 8
      expect(masked.strong.apiKey).toBe('****'); // '' 空字符串
    });

    it('长 apiKey 应只显示前4位和后4位', () => {
      const longKeyConfig: ModelRouterConfig = {
        local: { baseURL: 'http://x', apiKey: 'sk-1234567890abcdef', model: 'm' },
        cheap: { baseURL: 'http://x', apiKey: 'key-cheap', model: 'm' },
        strong: { baseURL: 'http://x', apiKey: 'key-strong', model: 'm' },
      };
      const router = new ModelRouter(longKeyConfig);
      const masked = router.getConfig();

      // 'sk-1234567890abcdef' 长度 18 > 8 → 'sk-1****cdef'
      expect(masked.local.apiKey).toBe('sk-1****cdef');
    });

    it('三个 tier 都应有脱敏配置', () => {
      const router = new ModelRouter(TEST_CONFIG);
      const masked = router.getConfig();

      for (const tier of ['local', 'cheap', 'strong'] as const) {
        expect(masked[tier]).toBeDefined();
        expect(masked[tier].model).toBeDefined();
        expect(masked[tier].baseURL).toBeDefined();
        expect(masked[tier].apiKey).toBeDefined();
      }
    });
  });
});
