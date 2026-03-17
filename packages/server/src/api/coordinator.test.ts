// ============================================================================
// @beeclaw/server — /api/coordinator 路由测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestContext,
  silenceConsole,
  type TestContext,
} from './__test_helpers__.js';
import { registerCoordinatorRoute } from './coordinator.js';

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
// GET /api/coordinator
// ════════════════════════════════════════

describe('GET /api/coordinator', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    registerCoordinatorRoute(testCtx.app, testCtx.ctx);
    await testCtx.app.ready();
    app = testCtx.app;
  });

  it('未启用分布式模式时应返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/coordinator' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toBe('Distributed mode is not enabled');
  });

  it('启用分布式模式时应返回 200 和协调器状态', async () => {
    // Mock getCoordinatorStatus 返回分布式状态
    const mockStatus = {
      enabled: true,
      currentTick: 0,
      workers: [
        { id: 'worker-1', status: 'online', agentCount: 5, consecutiveTimeouts: 0, lastHeartbeat: Date.now() },
        { id: 'worker-2', status: 'online', agentCount: 5, consecutiveTimeouts: 0, lastHeartbeat: Date.now() },
      ],
      assignments: [
        { workerId: 'worker-1', agentIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
        { workerId: 'worker-2', agentIds: ['a6', 'a7', 'a8', 'a9', 'a10'] },
      ],
    };
    vi.spyOn(testCtx.engine, 'getCoordinatorStatus').mockReturnValue(mockStatus);

    const res = await app.inject({ method: 'GET', url: '/api/coordinator' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.enabled).toBe(true);
    expect(body.currentTick).toBe(0);
    expect(body.workers).toHaveLength(2);
    expect(body.workers[0].id).toBe('worker-1');
    expect(body.workers[0].status).toBe('online');
    expect(body.workers[1].id).toBe('worker-2');
    expect(body.assignments).toHaveLength(2);
    expect(body.assignments[0].agentIds).toHaveLength(5);
    expect(body.assignments[1].agentIds).toHaveLength(5);
  });
});
