// ============================================================================
// BeeClaw Dashboard — Agent 列表页面
// ============================================================================

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { fetchAgents } from '../api/client';
import { Card, EmptyState, ErrorState } from '../components';
import { AgentStatusBadge, ModelTierBadge } from '../components/StatusBadge';

const PAGE_SIZE = 20;

export function AgentList() {
  const [page, setPage] = useState(1);

  const fetcher = useCallback(() => fetchAgents(page, PAGE_SIZE), [page]);
  const { data, error, loading, refresh } = usePolling(fetcher, 5000);

  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Agent 列表</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {data ? `共 ${data.total} 个 Agent` : '加载中...'}
          </p>
        </div>
      </div>

      {/* Agent 表格 */}
      <Card>
        {loading && !data ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded" style={{ backgroundColor: 'var(--skeleton-bg)' }} />
            ))}
          </div>
        ) : data && data.agents.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-primary)' }}>
                    <th className="text-left py-3 pr-4">名称</th>
                    <th className="text-left py-3 pr-4">职业</th>
                    <th className="text-center py-3 pr-4">状态</th>
                    <th className="text-center py-3 pr-4">模型</th>
                    <th className="text-right py-3 pr-4">影响力</th>
                    <th className="text-right py-3 pr-4">信誉</th>
                    <th className="text-right py-3 pr-4">粉丝</th>
                    <th className="text-right py-3">最后活跃</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b transition-colors hover:opacity-80"
                      style={{ borderColor: 'var(--border-primary)' }}
                    >
                      <td className="py-3 pr-4">
                        <Link to={`/agents/${agent.id}`} className="flex items-center gap-2 group">
                          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-bee-500 to-bee-700 flex items-center justify-center text-xs font-bold text-white">
                            {agent.name.charAt(0)}
                          </span>
                          <div>
                            <p className="font-medium group-hover:text-bee-400 transition-colors" style={{ color: 'var(--text-primary)' }}>{agent.name}</p>
                            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{agent.id.slice(0, 8)}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 pr-4" style={{ color: 'var(--text-secondary)' }}>{agent.profession}</td>
                      <td className="py-3 pr-4 text-center">
                        <AgentStatusBadge status={agent.status} />
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <ModelTierBadge tier={agent.modelTier} />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div
                              className="h-full bg-bee-500 rounded-full transition-all"
                              style={{ width: `${agent.influence}%` }}
                            />
                          </div>
                          <span className="w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{agent.influence}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className={agent.credibility >= 50 ? 'text-green-400' : 'text-red-400'}>
                          {agent.credibility}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right" style={{ color: 'var(--text-tertiary)' }}>
                        {agent.followers}
                      </td>
                      <td className="py-3 text-right font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                        Tick #{agent.lastActiveTick}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {data.pages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  第 {data.page} / {data.pages} 页
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                    disabled={page >= data.pages}
                    className="px-3 py-1 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon="🤖" message="暂无 Agent，等待世界引擎启动..." />
        )}
      </Card>
    </div>
  );
}
