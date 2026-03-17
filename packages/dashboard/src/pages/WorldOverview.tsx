// ============================================================================
// BeeClaw Dashboard — 世界总览页面
// ============================================================================

import { usePolling } from '../hooks/usePolling';
import { fetchStatus, fetchHistory } from '../api/client';
import { StatCard, Card, CardSkeleton, ErrorState } from '../components';
import { SentimentBar } from '../components/SentimentBar';
import type { TickResult } from '../types';

export function WorldOverview() {
  const { data: status, error, loading, refresh } = usePolling(fetchStatus, 3000);
  const { data: historyData } = usePolling(() => fetchHistory(20), 5000);

  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold theme-text-heading" style={{ color: 'var(--text-heading)' }}>世界总览</h2>
        <p className="text-sm theme-text-muted mt-1" style={{ color: 'var(--text-muted)' }}>BeeClaw 仿真世界实时状态</p>
      </div>

      {/* 统计卡片 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton count={4} />
        </div>
      ) : status ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="当前 Tick"
            value={status.tick}
            icon="🔄"
            subtitle={status.running ? '运行中' : '已暂停'}
            trend={status.running ? 'up' : 'neutral'}
          />
          <StatCard
            title="Agent 总数"
            value={status.agentCount}
            icon="🤖"
            subtitle={`${status.activeAgents} 个活跃`}
            trend="neutral"
          />
          <StatCard
            title="活跃事件"
            value={status.activeEvents}
            icon="⚡"
          />
          <StatCard
            title="WebSocket 连接"
            value={status.wsConnections}
            icon="🔗"
            subtitle={`运行 ${formatUptime(status.uptime)}`}
          />
        </div>
      ) : null}

      {/* 情绪概览 + 最近 Tick */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 全局情绪 */}
        <Card title="全局情绪分布">
          {status?.sentiment && (status.sentiment.bullish > 0 || status.sentiment.bearish > 0 || status.sentiment.neutral > 0) ? (
            <div className="space-y-4">
              <SentimentBar
                bullish={status.sentiment.bullish}
                bearish={status.sentiment.bearish}
                neutral={status.sentiment.neutral}
                height="h-5"
              />
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-400">
                    {status.sentiment.bullish}%
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>看多</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-tertiary)' }}>
                    {status.sentiment.neutral}%
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>中立</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">
                    {status.sentiment.bearish}%
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>看空</p>
                </div>
              </div>

              {/* 按话题分布 */}
              {status.sentiment.topicBreakdown.length > 0 && (
                <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>各话题情绪</p>
                  <div className="space-y-3">
                    {status.sentiment.topicBreakdown.slice(0, 8).map((item) => {
                      const total = item.bullish + item.bearish + item.neutral;
                      const bPct = total > 0 ? Math.round((item.bullish / total) * 100) : 0;
                      const sPct = total > 0 ? Math.round((item.bearish / total) * 100) : 0;
                      return (
                        <div key={item.topic}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm truncate mr-2" style={{ color: 'var(--text-secondary)' }}>{item.topic}</span>
                            <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                              <span className="text-green-400">{bPct}%</span>
                              {' / '}
                              <span className="text-red-400">{sPct}%</span>
                            </span>
                          </div>
                          <SentimentBar
                            bullish={item.bullish}
                            bearish={item.bearish}
                            neutral={item.neutral}
                            showLabels={false}
                            height="h-2"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>暂无情绪数据</p>
          )}
        </Card>

        {/* 最近 Tick 结果 */}
        <Card title="最新 Tick 结果">
          {status?.lastTick ? (
            <TickResultView tick={status.lastTick} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>等待第一个 Tick...</p>
          )}
        </Card>
      </div>

      {/* Tick 历史 */}
      <Card title="Tick 历史记录">
        {historyData?.history && historyData.history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase border-b theme-border" style={{ color: 'var(--text-muted)' }}>
                  <th className="text-left py-2 pr-4">Tick</th>
                  <th className="text-left py-2 pr-4">时间</th>
                  <th className="text-right py-2 pr-4">事件</th>
                  <th className="text-right py-2 pr-4">响应</th>
                  <th className="text-right py-2 pr-4">激活 Agent</th>
                  <th className="text-right py-2">耗时</th>
                </tr>
              </thead>
              <tbody>
                {historyData.history.slice(-10).reverse().map((t) => (
                  <tr key={t.tick} className="border-b theme-border hover:opacity-80" style={{ borderColor: 'var(--border-primary)' }}>
                    <td className="py-2 pr-4 font-mono text-bee-400">#{t.tick}</td>
                    <td className="py-2 pr-4" style={{ color: 'var(--text-tertiary)' }}>
                      {t.timestamp ? new Date(t.timestamp).toLocaleTimeString('zh-CN') : `Tick ${t.tick}`}
                    </td>
                    <td className="py-2 pr-4 text-right">{t.eventsProcessed}</td>
                    <td className="py-2 pr-4 text-right">{t.responsesCollected}</td>
                    <td className="py-2 pr-4 text-right">{t.agentsActivated}</td>
                    <td className="py-2 text-right" style={{ color: 'var(--text-tertiary)' }}>{t.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>暂无历史记录</p>
        )}
      </Card>
    </div>
  );
}

/** Tick 结果详情 */
function TickResultView({ tick }: { tick: TickResult }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>回合</p>
          <p className="text-lg font-mono text-bee-400">#{tick.tick}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>耗时</p>
          <p className="text-lg font-mono" style={{ color: 'var(--text-secondary)' }}>{tick.durationMs}ms</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>处理事件</p>
          <p className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>{tick.eventsProcessed}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Agent 响应</p>
          <p className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>{tick.responsesCollected}</p>
        </div>
      </div>
      {tick.events && tick.events.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: 'var(--border-primary)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>事件列表</p>
          <div className="space-y-1">
            {tick.events.slice(0, 5).map((evt) => (
              <div key={evt.id} className="flex items-center gap-2 text-sm">
                <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
                  {evt.category}
                </span>
                <span style={{ color: 'var(--text-secondary)' }} className="truncate">{evt.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
