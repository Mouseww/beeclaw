// ============================================================================
// @beeclaw/server — 测试辅助工具
// 共享的 mock 配置和构建函数
// ============================================================================

import { vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { WorldEngine } from '@beeclaw/world-engine';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig, ModelRouterConfig } from '@beeclaw/shared';
import { initDatabase } from '../persistence/database.js';
import { Store } from '../persistence/store.js';
import type { ServerContext } from '../index.js';

export const TEST_CONFIG: WorldConfig = {
  tickIntervalMs: 100,
  maxAgents: 50,
  eventRetentionTicks: 50,
  enableNaturalSelection: false,
};

export const MOCK_MODEL_CONFIG: ModelRouterConfig = {
  local: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-local' },
  cheap: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-cheap' },
  strong: { baseURL: 'http://mock', apiKey: 'mock', model: 'mock-strong' },
};

export function createMockedModelRouter(): ModelRouter {
  const router = new ModelRouter(MOCK_MODEL_CONFIG);
  let callCount = 0;
  const responses = [
    '{"opinion":"看好","action":"speak","emotionalState":0.5,"reasoning":"利好"}',
    '{"opinion":"谨慎","action":"silent","emotionalState":-0.2,"reasoning":"观望"}',
    '{"opinion":"中立","action":"forward","emotionalState":0.0,"reasoning":"传播"}',
  ];
  for (const tier of ['local', 'cheap', 'strong'] as const) {
    vi.spyOn(router.getClient(tier), 'chatCompletion').mockImplementation(async () => {
      const idx = callCount % responses.length;
      callCount++;
      return responses[idx]!;
    });
  }
  return router;
}

export interface TestContext {
  app: FastifyInstance;
  engine: WorldEngine;
  store: Store;
  modelRouter: ModelRouter;
  ctx: ServerContext;
}

export async function buildTestContext(wsCount = 0): Promise<TestContext> {
  const db = initDatabase(':memory:');
  const store = new Store(db);
  const modelRouter = createMockedModelRouter();
  const engine = new WorldEngine({
    config: TEST_CONFIG,
    modelRouter,
    concurrency: 3,
  });

  const app = Fastify({
    logger: false,
    schemaErrorFormatter(errors, dataVar) {
      // 提取第一个验证错误，返回包含字段名的描述性消息
      const first = errors[0];
      if (first) {
        const field = first.instancePath
          ? first.instancePath.replace(/^\//, '').replace(/\//g, '.')
          : (first.params as Record<string, unknown>)?.['missingProperty'] as string | undefined;
        const msg = field
          ? `${field}: ${first.message ?? 'validation failed'}`
          : `${dataVar} ${first.message ?? 'validation failed'}`;
        return new Error(msg);
      }
      return new Error('Validation failed');
    },
  });

  const ctx: ServerContext = {
    engine,
    store,
    modelRouter,
    getWsCount: () => wsCount,
  };

  // 将 schema validation 错误统一为 { error: "..." } 格式（与路由手动验证一致）
  app.setErrorHandler((error, _req, reply) => {
    if (error.validation) {
      return reply.status(400).send({ error: error.message });
    }
    reply.status(error.statusCode ?? 500).send({ error: error.message });
  });

  return { app, engine, store, modelRouter, ctx };
}

export function silenceConsole() {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
}
