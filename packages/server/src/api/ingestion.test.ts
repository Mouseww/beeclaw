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
    addSource: vi.fn(),
    removeSource: vi.fn(),
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

// ── POST /api/ingestion/sources ──

describe('POST /api/ingestion/sources', () => {
  let app: FastifyInstance;

  describe('有 ingestion 实例时', () => {
    let mockIngestion: ReturnType<typeof createMockIngestion>;
    let saveRssSourceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      mockIngestion = createMockIngestion();
      (testCtx.ctx as any).ingestion = mockIngestion;
      saveRssSourceSpy = vi.spyOn(testCtx.store, 'saveRssSource').mockImplementation(() => {});
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应成功创建数据源并返回 200', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: { id: 'new-src', name: 'New Source', url: 'https://example.com/feed' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ ok: true, id: 'new-src' });
    });

    it('应调用 ingestion.addSource 传入正确的参数', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: { id: 'new-src', name: 'New Source', url: 'https://example.com/feed' },
      });
      expect(mockIngestion.addSource).toHaveBeenCalledTimes(1);
      expect(mockIngestion.addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-src',
          name: 'New Source',
          url: 'https://example.com/feed',
          category: 'general',
          tags: [],
          pollIntervalMs: 300_000,
          enabled: true,
        }),
      );
    });

    it('应调用 store.saveRssSource 持久化', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: { id: 'new-src', name: 'New Source', url: 'https://example.com/feed' },
      });
      expect(saveRssSourceSpy).toHaveBeenCalledTimes(1);
      expect(saveRssSourceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-src', name: 'New Source' }),
      );
    });

    it('应支持自定义可选字段', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: {
          id: 'custom-src',
          name: 'Custom',
          url: 'https://custom.com/feed',
          category: 'finance',
          tags: ['stock'],
          pollIntervalMs: 60_000,
          enabled: false,
        },
      });
      expect(mockIngestion.addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'finance',
          tags: ['stock'],
          pollIntervalMs: 60_000,
          enabled: false,
        }),
      );
    });

    it('缺少 id 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: { name: 'No ID', url: 'https://example.com/feed' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it('缺少 name 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: { id: 'no-name', url: 'https://example.com/feed' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it('缺少 url 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: { id: 'no-url', name: 'No URL' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
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
        method: 'POST',
        url: '/api/ingestion/sources',
        payload: { id: 'test', name: 'Test', url: 'https://example.com/feed' },
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toContain('not available');
    });
  });
});

// ── PUT /api/ingestion/sources/:sourceId ──

describe('PUT /api/ingestion/sources/:sourceId', () => {
  let app: FastifyInstance;

  describe('源存在时', () => {
    let mockIngestion: ReturnType<typeof createMockIngestion>;
    let saveRssSourceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      const sourceStatus: IngestionSourceStatus = {
        id: 'existing-src',
        name: 'Existing Source',
        url: 'https://old.com/feed',
        enabled: true,
        lastPollTime: '2024-01-01T00:00:00.000Z',
        lastError: null,
        itemsFetched: 10,
        eventsEmitted: 5,
      };
      mockIngestion = createMockIngestion({ sourceStatus });
      (testCtx.ctx as any).ingestion = mockIngestion;
      saveRssSourceSpy = vi.spyOn(testCtx.store, 'saveRssSource').mockImplementation(() => {});
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应成功更新数据源并返回 200', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/ingestion/sources/existing-src',
        payload: { name: 'Updated Name' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ ok: true, id: 'existing-src' });
    });

    it('应先 removeSource 再 addSource', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/ingestion/sources/existing-src',
        payload: { name: 'Updated Name' },
      });
      expect(mockIngestion.removeSource).toHaveBeenCalledWith('existing-src');
      expect(mockIngestion.addSource).toHaveBeenCalledTimes(1);
      // removeSource 应在 addSource 之前被调用
      const removeOrder = mockIngestion.removeSource.mock.invocationCallOrder[0]!;
      const addOrder = mockIngestion.addSource.mock.invocationCallOrder[0]!;
      expect(removeOrder).toBeLessThan(addOrder);
    });

    it('应调用 store.saveRssSource 持久化更新后的源', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/ingestion/sources/existing-src',
        payload: { name: 'Updated', url: 'https://new.com/feed' },
      });
      expect(saveRssSourceSpy).toHaveBeenCalledTimes(1);
      expect(saveRssSourceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'existing-src', name: 'Updated', url: 'https://new.com/feed' }),
      );
    });

    it('未提供的字段应从 existing 继承', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/ingestion/sources/existing-src',
        payload: { url: 'https://new-url.com/feed' },
      });
      expect(mockIngestion.addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-src',
          name: 'Existing Source',
          url: 'https://new-url.com/feed',
          enabled: true,
        }),
      );
    });
  });

  describe('源不存在时', () => {
    let mockIngestion: ReturnType<typeof createMockIngestion>;

    beforeEach(async () => {
      mockIngestion = createMockIngestion({ sourceStatus: undefined });
      (testCtx.ctx as any).ingestion = mockIngestion;
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 404', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/ingestion/sources/nonexistent',
        payload: { name: 'No Such Source' },
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
        method: 'PUT',
        url: '/api/ingestion/sources/any-id',
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toContain('not available');
    });
  });
});

// ── DELETE /api/ingestion/sources/:sourceId ──

describe('DELETE /api/ingestion/sources/:sourceId', () => {
  let app: FastifyInstance;

  describe('源存在时', () => {
    let mockIngestion: ReturnType<typeof createMockIngestion>;
    let deleteRssSourceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      const sourceStatus: IngestionSourceStatus = {
        id: 'del-src',
        name: 'To Delete',
        url: 'https://delete.com/feed',
        enabled: true,
        lastPollTime: '2024-01-01T00:00:00.000Z',
        lastError: null,
        itemsFetched: 20,
        eventsEmitted: 15,
      };
      mockIngestion = createMockIngestion({ sourceStatus });
      (testCtx.ctx as any).ingestion = mockIngestion;
      deleteRssSourceSpy = vi.spyOn(testCtx.store, 'deleteRssSource').mockImplementation(() => true);
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应成功删除数据源并返回 200', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/ingestion/sources/del-src',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ ok: true, deleted: 'del-src' });
    });

    it('应调用 ingestion.removeSource', async () => {
      await app.inject({
        method: 'DELETE',
        url: '/api/ingestion/sources/del-src',
      });
      expect(mockIngestion.removeSource).toHaveBeenCalledWith('del-src');
    });

    it('应调用 store.deleteRssSource 从数据库删除', async () => {
      await app.inject({
        method: 'DELETE',
        url: '/api/ingestion/sources/del-src',
      });
      expect(deleteRssSourceSpy).toHaveBeenCalledWith('del-src');
    });
  });

  describe('源不存在时', () => {
    let mockIngestion: ReturnType<typeof createMockIngestion>;

    beforeEach(async () => {
      mockIngestion = createMockIngestion({ sourceStatus: undefined });
      (testCtx.ctx as any).ingestion = mockIngestion;
      registerIngestionRoute(testCtx.app, testCtx.ctx);
      await testCtx.app.ready();
      app = testCtx.app;
    });

    it('应返回 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/ingestion/sources/nonexistent',
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
        method: 'DELETE',
        url: '/api/ingestion/sources/any-id',
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toContain('not available');
    });
  });
});
