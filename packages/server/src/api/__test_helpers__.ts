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

  const app = Fastify({ logger: false });

  const ctx: ServerContext = {
    engine,
    store,
    modelRouter,
    getWsCount: () => wsCount,
  };

  return { app, engine, store, modelRouter, ctx };
}

export function silenceConsole() {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
}
