// ============================================================================
// @beeclaw/coordinator AgentPartitioner 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import { AgentPartitioner } from './AgentPartitioner.js';

describe('AgentPartitioner', () => {
  const partitioner = new AgentPartitioner();

  describe('partition', () => {
    it('应将 Agent 均匀分配到多个 Worker', () => {
      const agentIds = ['a1', 'a2', 'a3', 'a4'];
      const workerIds = ['w1', 'w2'];

      const result = partitioner.partition(agentIds, workerIds);

      expect(result).toHaveLength(2);
      // 所有 Agent 都应被分配
      const allAgents = result.flatMap((r) => r.agentIds);
      expect(allAgents.sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
    });

    it('Worker 之间的 Agent 数量差不超过 1', () => {
      const agentIds = ['a1', 'a2', 'a3', 'a4', 'a5'];
      const workerIds = ['w1', 'w2', 'w3'];

      const result = partitioner.partition(agentIds, workerIds);

      const counts = result.map((r) => r.agentIds.length);
      const maxDiff = Math.max(...counts) - Math.min(...counts);
      expect(maxDiff).toBeLessThanOrEqual(1);
    });

    it('多次调用结果应一致（排序稳定）', () => {
      const agentIds = ['c', 'a', 'b', 'd'];
      const workerIds = ['w1', 'w2'];

      const r1 = partitioner.partition(agentIds, workerIds);
      const r2 = partitioner.partition(agentIds, workerIds);

      expect(r1).toEqual(r2);
    });

    it('空 Worker 列表应返回空数组', () => {
      const result = partitioner.partition(['a1', 'a2'], []);
      expect(result).toEqual([]);
    });

    it('空 Agent 列表应返回空分配', () => {
      const result = partitioner.partition([], ['w1', 'w2']);
      expect(result).toEqual([
        { workerId: 'w1', agentIds: [] },
        { workerId: 'w2', agentIds: [] },
      ]);
    });

    it('单个 Worker 应获得全部 Agent', () => {
      const agentIds = ['a1', 'a2', 'a3'];
      const result = partitioner.partition(agentIds, ['w1']);

      expect(result).toHaveLength(1);
      expect(result[0]!.agentIds.sort()).toEqual(['a1', 'a2', 'a3']);
    });

    it('Agent 数量少于 Worker 数量时部分 Worker 为空', () => {
      const result = partitioner.partition(['a1'], ['w1', 'w2', 'w3']);

      expect(result).toHaveLength(3);
      const nonEmpty = result.filter((r) => r.agentIds.length > 0);
      expect(nonEmpty).toHaveLength(1);
      expect(nonEmpty[0]!.agentIds).toEqual(['a1']);
    });

    it('大量 Agent 应均匀分配', () => {
      const agentIds = Array.from({ length: 100 }, (_, i) => `agent_${i.toString().padStart(3, '0')}`);
      const workerIds = ['w1', 'w2', 'w3', 'w4'];

      const result = partitioner.partition(agentIds, workerIds);

      // 每个 Worker 应有 25 个
      for (const assignment of result) {
        expect(assignment.agentIds.length).toBe(25);
      }

      // 总数对
      const total = result.reduce((sum, r) => sum + r.agentIds.length, 0);
      expect(total).toBe(100);
    });
  });

  describe('addAgents', () => {
    it('应将新 Agent 分配给负载最轻的 Worker', () => {
      const current = [
        { workerId: 'w1', agentIds: ['a1', 'a2', 'a3'] },
        { workerId: 'w2', agentIds: ['a4'] },
      ];

      const result = partitioner.addAgents(['a5'], current);

      // a5 应分配给 w2（负载最轻）
      const w2 = result.find((r) => r.workerId === 'w2')!;
      expect(w2.agentIds).toContain('a5');
    });

    it('多个新 Agent 应平衡分配', () => {
      const current = [
        { workerId: 'w1', agentIds: ['a1'] },
        { workerId: 'w2', agentIds: ['a2'] },
      ];

      const result = partitioner.addAgents(['a3', 'a4'], current);

      // 每个 Worker 最终应有 2 个
      for (const assignment of result) {
        expect(assignment.agentIds.length).toBe(2);
      }
    });

    it('空新 Agent 列表不改变分配', () => {
      const current = [
        { workerId: 'w1', agentIds: ['a1'] },
      ];

      const result = partitioner.addAgents([], current);
      expect(result).toEqual(current);
    });

    it('空分配方案不改变', () => {
      const result = partitioner.addAgents(['a1'], []);
      expect(result).toEqual([]);
    });

    it('不应修改原始数据', () => {
      const current = [
        { workerId: 'w1', agentIds: ['a1'] },
        { workerId: 'w2', agentIds: ['a2'] },
      ];
      const original = JSON.parse(JSON.stringify(current));

      partitioner.addAgents(['a3'], current);
      expect(current).toEqual(original);
    });
  });

  describe('removeAgents', () => {
    it('应从分配中移除指定 Agent', () => {
      const current = [
        { workerId: 'w1', agentIds: ['a1', 'a2', 'a3'] },
        { workerId: 'w2', agentIds: ['a4', 'a5'] },
      ];

      const result = partitioner.removeAgents(new Set(['a2', 'a4']), current);

      expect(result[0]!.agentIds).toEqual(['a1', 'a3']);
      expect(result[1]!.agentIds).toEqual(['a5']);
    });

    it('移除不存在的 Agent 不影响结果', () => {
      const current = [
        { workerId: 'w1', agentIds: ['a1'] },
      ];

      const result = partitioner.removeAgents(new Set(['not_exist']), current);
      expect(result[0]!.agentIds).toEqual(['a1']);
    });

    it('移除全部 Agent 后分配为空', () => {
      const current = [
        { workerId: 'w1', agentIds: ['a1', 'a2'] },
      ];

      const result = partitioner.removeAgents(new Set(['a1', 'a2']), current);
      expect(result[0]!.agentIds).toEqual([]);
    });
  });
});
