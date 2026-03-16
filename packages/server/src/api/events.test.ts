// ============================================================================
// @beeclaw/server — /api/events 路由测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerEventsRoute } from './events.js';

// Mock broadcast 以避免 WS 副作用
vi.mock('../ws/handler.js', () => ({
  broadcast: vi.fn(),
}));

// ── 共享 setup ──

let testCtx: TestContext;

beforeEach(async () => {
  silenceConsole();
  testCtx = await buildTestContext(0);
});

afterEach(async () => {
  await testCtx.app.close();
});

// ════════════════════════════════════════
// POST /api/events
// ════════════════════════════════════════

describe('POST /api/events', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerEventsRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('应成功注入事件并返回 ok 和 event 对象', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '测试事件',
        content: '这是一个测试事件内容',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.event).toBeDefined();
    expect(body.event.title).toBe('测试事件');
  });

  it('应使用默认参数值（category=general, importance=0.6, propagationRadius=0.5）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '默认参数事件',
        content: '测试默认参数',
      },
    });
    const body = res.json();
    expect(body.event.category).toBe('general');
    expect(body.event.importance).toBe(0.6);
    expect(body.event.propagationRadius).toBe(0.5);
  });

  it('应支持自定义 category、importance、propagationRadius、tags', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '自定义参数事件',
        content: '使用自定义参数',
        category: 'finance',
        importance: 0.9,
        propagationRadius: 0.8,
        tags: ['crypto', 'market'],
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.event.category).toBe('finance');
    expect(body.event.importance).toBe(0.9);
    expect(body.event.tags).toEqual(['crypto', 'market']);
  });

  it('应调用 broadcast 通知 WebSocket 客户端', async () => {
    const { broadcast } = await import('../ws/handler.js');
    await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '广播事件',
        content: '测试广播',
      },
    });
    expect(broadcast).toHaveBeenCalledWith(
      'event_injected',
      expect.objectContaining({ title: '广播事件' }),
    );
  });

  // ── 参数验证 ──

  it('缺少 title 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        content: '缺少标题',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('缺少 content 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '缺少内容',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('空 body 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('importance 超出范围 (>1) 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '超范围',
        content: '测试',
        importance: 1.5,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('importance 低于范围 (<0) 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '超范围',
        content: '测试',
        importance: -0.1,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('无效 category 应返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: '无效分类',
        content: '测试',
        category: 'invalid_category',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
