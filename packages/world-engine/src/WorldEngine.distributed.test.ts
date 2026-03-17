// ============================================================================
// WorldEngine 分布式模式集成测试
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldEngine } from './WorldEngine.js';
import { ModelRouter } from '@beeclaw/agent-runtime';
import type { WorldConfig } from '@beeclaw/shared';

describe('WorldEngine - Distributed Mode', () => {
  let engine: WorldEngine;
  let modelRouter: ModelRouter;

  beforeEach(() => {
    modelRouter = new ModelRouter();
  });

  describe('分布式模式初始化', () => {
    it('应该在启用 distributed 时初始化 TickCoordinator', () => {
      const config: WorldConfig = {
        tickIntervalMs: 1000,
        maxAgents: 100,
        eventRetentionTicks: 10,
        enableNaturalSelection: false,
        distributed: true,
        workerCount: 2,
      };

      engine = new WorldEngine({ config, modelRouter });

      const status = engine.getCoordinatorStatus();
      expect(status).not.toBeNull();
      expect(status?.enabled).toBe(true);
      expect(status?.workers).toHaveLength(2);
    });

    it('应该在未启用 distributed 时返回 null', () => {
      const config: WorldConfig = {
        tickIntervalMs: 1000,
        maxAgents: 100,
        eventRetentionTicks: 10,
        enableNaturalSelection: false,
      };

      engine = new WorldEngine({ config, modelRouter });

      const status = engine.getCoordinatorStatus();
      expect(status).toBeNull();
    });

    it('应该使用默认 Worker 数量 2', () => {
      const config: WorldConfig = {
        tickIntervalMs: 1000,
        maxAgents: 100,
        eventRetentionTicks: 10,
        enableNaturalSelection: false,
        distributed: true,
      };

      engine = new WorldEngine({ config, modelRouter });

      const status = engine.getCoordinatorStatus();
      expect(status?.workers).toHaveLength(2);
    });

    it('应该支持自定义 Worker 数量', () => {
      const config: WorldConfig = {
        tickIntervalMs: 1000,
        maxAgents: 100,
        eventRetentionTicks: 10,
        enableNaturalSelection: false,
        distributed: true,
        workerCount: 4,
      };

      engine = new WorldEngine({ config, modelRouter });

      const status = engine.getCoordinatorStatus();
      expect(status?.workers).toHaveLength(4);
    });
  });

  describe('Agent 分配', () => {
    beforeEach(() => {
      const config: WorldConfig = {
        tickIntervalMs: 1000,
        maxAgents: 100,
        eventRetentionTicks: 10,
        enableNaturalSelection: false,
        distributed: true,
        workerCount: 2,
      };

      engine = new WorldEngine({ config, modelRouter });
    });

    it('应该在添加 Agent 时自动分配到 Worker', () => {
      const agents = engine.spawner.spawnBatch(10, 0);
      engine.addAgents(agents);

      const status = engine.getCoordinatorStatus();
      expect(status).not.toBeNull();

      const assignments = status!.assignments;
      expect(assignments).toHaveLength(2);

      const totalAssigned = assignments.reduce((sum, a) => sum + a.agentIds.length, 0);
      expect(totalAssigned).toBe(10);
    });

    it('应该均匀分配 Agent 到各个 Worker', () => {
      const agents = engine.spawner.spawnBatch(20, 0);
      engine.addAgents(agents);

      const status = engine.getCoordinatorStatus();
      const assignments = status!.assignments;

      // 每个 Worker 应该分配到 10 个 Agent
      expect(assignments[0]!.agentIds.length).toBe(10);
      expect(assignments[1]!.agentIds.length).toBe(10);
    });
  });

  describe('向后兼容性', () => {
    it('应该在未启用分布式模式时正常工作', async () => {
      const config: WorldConfig = {
        tickIntervalMs: 1000,
        maxAgents: 100,
        eventRetentionTicks: 10,
        enableNaturalSelection: false,
      };

      engine = new WorldEngine({ config, modelRouter });

      const agents = engine.spawner.spawnBatch(5, 0);
      engine.addAgents(agents);

      engine.injectEvent({
        title: '测试事件',
        content: '这是一个测试事件',
        category: 'general',
        importance: 0.5,
        propagationRadius: 0.5,
        tags: ['test'],
      });

      const result = await engine.step();

      expect(result.tick).toBe(1);
      expect(result.eventsProcessed).toBeGreaterThan(0);
    });
  });
});
