// ============================================================================
// @beeclaw/agent-runtime ModelRouter 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
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
});
