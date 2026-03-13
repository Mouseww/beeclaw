// ============================================================================
// BeeClaw Dashboard — 世界总览面板
// ============================================================================

import { usePolling } from '../hooks/usePolling';
import { useWebSocket } from '../hooks/useWebSocket';
import { fetchStatus } from '../api/client';
import type { ServerStatus } from '../types';

function SentimentBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-xs text-gray-400 text-right">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-xs text-gray-300">{pct}%</span>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="card">
      <div className="card-header">{title}</div>
      <div className="stat-value">{value}</div>
      {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export function WorldOverview() {
  const { data: status, loading, error } = usePolling<ServerStatus>(fetchStatus, 3000);
  const { state: wsState, lastTick } = useWebSocket();

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 animate-pulse">正在连接 BeeClaw 服务器...</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">连接失败</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // 优先使用 ws 推送的 tick，否则使用轮询的 status
  const tick = lastTick?.tick ?? status?.tick ?? 0;
  const agentCount = status?.agentCount ?? 0;
  const activeAgents = status?.activeAgents ?? 0;
  const activeEvents = status?.activeEvents ?? 0;
  const running = status?.running ?? false;
  const sentiment = status?.sentiment ?? {};

  const bullish = sentiment['bullish'] ?? 0;
  const bearish = sentiment['bearish'] ?? 0;
  const neutral = sentiment['neutral'] ?? 0;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">世界总览</h2>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              wsState === 'connected'
                ? 'bg-green-400'
                : wsState === 'connecting'
                  ? 'bg-yellow-400 animate-pulse'
                  : 'bg-red-400'
            }`}
          />
          <span className="text-xs text-gray-400">
            {wsState === 'connected'
              ? '实时连接'
              : wsState === 'connecting'
                ? '连接中...'
                : '已断开'}
          </span>
          <span
            className={`ml-2 badge ${running ? 'badge-active' : 'badge-dormant'}`}
          >
            {running ? '运行中' : '已暂停'}
          </span>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="当前 Tick" value={tick} />
        <StatCard
          title="Agent 数量"
          value={agentCount}
          sub={`${activeAgents} 个活跃`}
        />
        <StatCard title="活跃事件" value={activeEvents} />
        <StatCard
          title="上次 Tick 耗时"
          value={
            lastTick ? `${lastTick.durationMs}ms` : status?.lastTick ? `${status.lastTick.durationMs}ms` : '-'
          }
          sub={
            lastTick
              ? `处理 ${lastTick.eventsProcessed} 事件, ${lastTick.responsesCollected} 响应`
              : undefined
          }
        />
      </div>

      {/* 整体情绪 */}
      <div className="card">
        <div className="card-header">整体情绪分布</div>
        <div className="space-y-3 max-w-md">
          <SentimentBar label="看多" value={bullish} color="bg-green-500" />
          <SentimentBar label="中立" value={neutral} color="bg-gray-500" />
          <SentimentBar label="看空" value={bearish} color="bg-red-500" />
        </div>
      </div>

      {/* 最近 Tick 事件 */}
      {lastTick?.events && lastTick.events.length > 0 && (
        <div className="card">
          <div className="card-header">
            最新 Tick #{lastTick.tick} 事件
          </div>
          <div className="space-y-2">
            {lastTick.events.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="badge bg-blue-900/50 text-blue-400 border border-blue-800">
                    {evt.category}
                  </span>
                  <span className="text-sm text-gray-200">{evt.title}</span>
                </div>
                <span className="text-xs text-gray-500">
                  重要性 {Math.round(evt.importance * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
