// ============================================================================
// BeeClaw Dashboard — Agent 列表
// ============================================================================

import { useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { fetchAgents } from '../api/client';
import type { AgentListItem, AgentListResponse } from '../types';

function statusBadge(status: AgentListItem['status']) {
  switch (status) {
    case 'active':
      return <span className="badge badge-active">活跃</span>;
    case 'dormant':
      return <span className="badge badge-dormant">休眠</span>;
    case 'dead':
      return <span className="badge badge-dead">已死亡</span>;
  }
}

function tierBadge(tier: AgentListItem['modelTier']) {
  switch (tier) {
    case 'strong':
      return (
        <span className="badge bg-purple-900/50 text-purple-400 border border-purple-800">
          Strong
        </span>
      );
    case 'cheap':
      return (
        <span className="badge bg-blue-900/50 text-blue-400 border border-blue-800">
          Cheap
        </span>
      );
    case 'local':
      return (
        <span className="badge bg-gray-700/50 text-gray-300 border border-gray-600">
          Local
        </span>
      );
  }
}

export function AgentList() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetcher = useCallback(
    () => fetchAgents(page, pageSize),
    [page],
  );

  const { data, loading, error } = usePolling<AgentListResponse>(fetcher, 5000);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 animate-pulse">加载 Agent 列表...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">加载失败</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const agents = data?.agents ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Agent 列表</h2>
        <span className="text-sm text-gray-400">共 {total} 个 Agent</span>
      </div>

      {/* 表格 */}
      <div className="card overflow-hidden !p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
              <th className="px-5 py-3 text-left">名称</th>
              <th className="px-5 py-3 text-left">职业</th>
              <th className="px-5 py-3 text-center">状态</th>
              <th className="px-5 py-3 text-center">模型</th>
              <th className="px-5 py-3 text-right">影响力</th>
              <th className="px-5 py-3 text-right">信誉</th>
              <th className="px-5 py-3 text-right">粉丝</th>
              <th className="px-5 py-3 text-right">最后活跃</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr
                key={agent.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-white">
                  {agent.name}
                </td>
                <td className="px-5 py-3 text-gray-300">{agent.profession}</td>
                <td className="px-5 py-3 text-center">{statusBadge(agent.status)}</td>
                <td className="px-5 py-3 text-center">{tierBadge(agent.modelTier)}</td>
                <td className="px-5 py-3 text-right text-gray-200">
                  {agent.influence.toFixed(1)}
                </td>
                <td className="px-5 py-3 text-right text-gray-200">
                  {agent.credibility.toFixed(1)}
                </td>
                <td className="px-5 py-3 text-right text-gray-300">
                  {agent.followers}
                </td>
                <td className="px-5 py-3 text-right text-gray-500">
                  Tick #{agent.lastActiveTick}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-gray-500">
                  暂无 Agent 数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <span className="text-sm text-gray-400">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
