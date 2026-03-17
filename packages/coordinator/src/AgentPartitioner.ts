// ============================================================================
// AgentPartitioner — Agent 分片策略
// 按 ID 排序后均匀分配到各 Worker（Range Partitioning）
// ============================================================================

import type { PartitionAssignment } from './types.js';

export class AgentPartitioner {
  /**
   * 将 Agent ID 列表均匀分配到指定数量的 Worker。
   *
   * 算法：排序后按 round-robin 分配，保证每个 Worker 的 Agent 数相差不超过 1。
   *
   * @param agentIds - 所有待分配的 Agent ID
   * @param workerIds - Worker ID 列表
   * @returns 每个 Worker 分配到的 Agent ID 列表
   */
  partition(agentIds: string[], workerIds: string[]): PartitionAssignment[] {
    if (workerIds.length === 0) {
      return [];
    }

    if (agentIds.length === 0) {
      return workerIds.map((wid) => ({ workerId: wid, agentIds: [] }));
    }

    // 稳定排序，保证多次调用结果一致
    const sorted = [...agentIds].sort();

    // 初始化每个 Worker 的分配结果
    const assignments: Map<string, string[]> = new Map();
    for (const wid of workerIds) {
      assignments.set(wid, []);
    }

    // 均匀分配：chunk 模式（连续分段）
    const chunkSize = Math.ceil(sorted.length / workerIds.length);
    for (let i = 0; i < workerIds.length; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, sorted.length);
      const chunk = sorted.slice(start, end);
      assignments.set(workerIds[i]!, chunk);
    }

    return workerIds.map((wid) => ({
      workerId: wid,
      agentIds: assignments.get(wid) ?? [],
    }));
  }

  /**
   * 增量分片：新增的 Agent 分配给当前负载最轻的 Worker。
   *
   * @param newAgentIds - 新增的 Agent ID
   * @param currentAssignments - 当前分片方案
   * @returns 更新后的分片方案
   */
  addAgents(
    newAgentIds: string[],
    currentAssignments: PartitionAssignment[],
  ): PartitionAssignment[] {
    if (currentAssignments.length === 0 || newAgentIds.length === 0) {
      return currentAssignments;
    }

    // 深拷贝避免修改原始数据
    const updated = currentAssignments.map((a) => ({
      workerId: a.workerId,
      agentIds: [...a.agentIds],
    }));

    // 按当前 Agent 数量升序排列，新 Agent 分配给最轻的 Worker
    for (const agentId of newAgentIds) {
      // 找到负载最轻的 Worker
      updated.sort((a, b) => a.agentIds.length - b.agentIds.length);
      updated[0]!.agentIds.push(agentId);
    }

    return updated;
  }

  /**
   * 移除 Agent：从分片方案中移除指定 Agent
   */
  removeAgents(
    removeIds: Set<string>,
    currentAssignments: PartitionAssignment[],
  ): PartitionAssignment[] {
    return currentAssignments.map((a) => ({
      workerId: a.workerId,
      agentIds: a.agentIds.filter((id) => !removeIds.has(id)),
    }));
  }
}
