// ============================================================================
// @beeclaw/server — /api/ingestion 路由测试
// ============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerIngestionRoute } from './ingestion.js';
import type { IngestionStatus, IngestionSourceStatus } from '@beeclaw/event-ingestion';

// ── Mock EventIngestion ──

function createMockIngestion(overrides?: Partial<{
  status: IngestionStatus;
  sourceStatus: IngestionSourceStatus | undefined;
}>) {
  const defaultStatus: IngestionStatus = {
    running: true,
    sourceCount: 2,
    financeSourceCount: 1,
    deduplicationCacheSize: 42,
    sources: [
      {
        id: 'reuters-world',
        name: 'Reuters World News',
        url: 'https://feeds.reuters.com/reuters/worldNews',
        enabled: true,
        lastPollTime: '2024-01-01T00:00:00.000Z',
        lastError: null,
        itemsFetched: 15,
        eventsEmitted: 10,
      },
      {
        id: 'hackernews',
        name: 'Hacker News',
        url: 'https://hnrss.org/best',
        enabled: true,
        lastPollTime: '2024-01-01T00:05:00.000Z',
        lastError: 'HTTP 503 Service Unavailable',
        itemsFetched: 5,
        eventsEmitted: 3,
      },
    ],
    financeSources: [
      {
        id: 'fin-1',
        name: 'Finance Source',
        enabled: true,
        running: true,
        lastPollTime: '2024-01-01T00:02:00.000Z',
        lastError: null,
        symbolCount: 5,
        quotesPolled: 100,
        eventsEmitted: 20,
      },
    ],
  };

  return {
    getStatus: vi.fn().mockReturnValue(overrides?.status ?? defaultStatus),
    getSourceStatus: vi.fn().mockReturnValue(overrides?.sourceStatus ?? undefined),
  };
}

// ── 测试套件 ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(0);
});

afterEach(async () => {
  await testCtx.app.close();
});

describe('GET /api/ingestion', () => {
  let app: FastifyInstance;

  describe('有 ingestion 实例时', () => {
    beforeEach(async () => {
      const mockIngestion = createMockIngestion();
      (testCtx.ctx as any).ingestion = mockIngestion;
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 200 和完整状态', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/ingestion' });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body).toHaveProperty('running', true);
      expect(body).toHaveProperty('sourceCount', 2);
      expect(body).toHaveProperty('financeSourceCount', 1);
      expect(body).toHaveProperty('deduplicationCacheSize', 42);
      expect(body.sources).toHaveLength(2);
      expect(body.financeSources).toHaveLength(1);
    });

    it('sources 应包含完整的字段', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/ingestion' });
      const body = res.json();
      const source = body.sources[0];

      expect(source).toHaveProperty('id', 'reuters-world');
      expect(source).toHaveProperty('name', 'Reuters World News');
      expect(source).toHaveProperty('url');
      expect(source).toHaveProperty('enabled', true);
      expect(source).toHaveProperty('lastPollTime');
      expect(source).toHaveProperty('lastError', null);
      expect(source).toHaveProperty('itemsFetched', 15);
      expect(source).toHaveProperty('eventsEmitted', 10);
    });

    it('有错误的源应包含 lastError', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/ingestion' });
      const body = res.json();
      const errSource = body.sources[1];

      expect(errSource.lastError).toBe('HTTP 503 Service Unavailable');
    });

    it('financeSources 应包含完整的字段', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/ingestion' });
      const body = res.json();
      const fin = body.financeSources[0];

      expect(fin).toHaveProperty('id', 'fin-1');
      expect(fin).toHaveProperty('name', 'Finance Source');
      expect(fin).toHaveProperty('enabled', true);
      expect(fin).toHaveProperty('running', true);
      expect(fin).toHaveProperty('symbolCount', 5);
      expect(fin).toHaveProperty('quotesPolled', 100);
      expect(fin).toHaveProperty('eventsEmitted', 20);
    });
  });

  describe('无 ingestion 实例时', () => {
    beforeEach(async () => {
      // 不设置 ingestion
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 503', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/ingestion' });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toContain('not available');
    });
  });
});

describe('GET /api/ingestion/:sourceId', () => {
  let app: FastifyInstance;

  describe('源存在时', () => {
    beforeEach(async () => {
      const sourceStatus: IngestionSourceStatus = {
        id: 'reuters-world',
        name: 'Reuters World News',
        url: 'https://feeds.reuters.com/reuters/worldNews',
        enabled: true,
        lastPollTime: '2024-01-01T00:00:00.000Z',
        lastError: null,
        itemsFetched: 15,
        eventsEmitted: 10,
      };
      const mockIngestion = createMockIngestion({ sourceStatus });
      (testCtx.ctx as any).ingestion = mockIngestion;
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 200 和源详情', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/ingestion/reuters-world',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('reuters-world');
      expect(body.name).toBe('Reuters World News');
      expect(body).toHaveProperty('itemsFetched', 15);
      expect(body).toHaveProperty('eventsEmitted', 10);
    });
  });

  describe('源不存在时', () => {
    beforeEach(async () => {
      const mockIngestion = createMockIngestion({ sourceStatus: undefined });
      (testCtx.ctx as any).ingestion = mockIngestion;
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/ingestion/nonexistent',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('无 ingestion 实例时', () => {
    beforeEach(async () => {
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 503', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/ingestion/any-id',
      });
      expect(res.statusCode).toBe(503);
    });
  });
});
