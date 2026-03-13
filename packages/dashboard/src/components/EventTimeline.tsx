// ============================================================================
// BeeClaw Dashboard — 事件时间线
// ============================================================================

import { usePolling } from '../hooks/usePolling';
import { useWebSocket } from '../hooks/useWebSocket';
import { fetchHistory } from '../api/client';
import type { HistoryResponse, TickResult } from '../types';

function categoryColor(category: string): string {
  switch (category) {
    case 'finance':
      return 'bg-green-900/50 text-green-400 border-green-800';
    case 'politics':
      return 'bg-red-900/50 text-red-400 border-red-800';
    case 'tech':
      return 'bg-blue-900/50 text-blue-400 border-blue-800';
    case 'social':
      return 'bg-purple-900/50 text-purple-400 border-purple-800';
    default:
      return 'bg-gray-700/50 text-gray-300 border-gray-600';
  }
}

function TickCard({ tick }: { tick: TickResult }) {
  return (
    <div className="relative pl-8 pb-6">
      {/* 时间线点 */}
      <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-bee-500 border-2 border-gray-950" />
      {/* 连线 */}
      <div className="absolute left-[7px] top-5 bottom-0 w-0.5 bg-gray-800" />

      <div className="card">
        {/* Tick 头 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-bee-400">
              Tick #{tick.tick}
            </span>
            <span className="text-xs text-gray-500">
              {tick.durationMs}ms
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{tick.eventsProcessed} 事件</span>
            <span>{tick.agentsActivated} Agent 激活</span>
            <span>{tick.responsesCollected} 响应</span>
          </div>
        </div>

        {/* 事件列表 */}
        {tick.events && tick.events.length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">事件</p>
            {tick.events.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={`badge border ${categoryColor(evt.category)}`}
                >
                  {evt.category}
                </span>
                <span className="text-gray-200">{evt.title}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {Math.round(evt.importance * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 响应摘要 */}
        {tick.responses && tick.responses.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Agent 响应 ({tick.responses.length})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {tick.responses.slice(0, 4).map((resp) => (
                <div
                  key={resp.agentId}
                  className="bg-gray-800/50 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-200">
                      {resp.agentName}
                    </span>
                    <span
                      className={`text-xs ${
                        resp.emotionalState > 0.3
                          ? 'text-green-400'
                          : resp.emotionalState < -0.3
                            ? 'text-red-400'
                            : 'text-gray-400'
                      }`}
                    >
                      {resp.emotionalState > 0 ? '+' : ''}
                      {resp.emotionalState.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs line-clamp-2">
                    {resp.opinion}
                  </p>
                  <p className="text-xs text-bee-500 mt-1">
                    行动: {resp.action}
                  </p>
                </div>
              ))}
            </div>
            {tick.responses.length > 4 && (
              <p className="text-xs text-gray-500 text-center">
                ...还有 {tick.responses.length - 4} 条响应
              </p>
            )}
          </div>
        )}

        {/* 时间戳 */}
        <p className="text-xs text-gray-600 mt-3">
          {new Date(tick.timestamp).toLocaleString('zh-CN')}
        </p>
      </div>
    </div>
  );
}

export function EventTimeline() {
  const { data: historyData, loading, error } =
    usePolling<HistoryResponse>(() => fetchHistory(50), 10000);
  const { tickHistory: wsTicks } = useWebSocket();

  // 合并历史数据和 ws 实时数据, 按 tick 倒序
  const historyTicks = historyData?.history ?? [];
  const seenTicks = new Set<number>();
  const allTicks: TickResult[] = [];

  // 先加 ws 推送的（最新）
  for (const t of wsTicks) {
    if (!seenTicks.has(t.tick)) {
      seenTicks.add(t.tick);
      allTicks.push(t);
    }
  }
  // 再加 API 拉取的
  for (const t of historyTicks) {
    if (!seenTicks.has(t.tick)) {
      seenTicks.add(t.tick);
      allTicks.push(t);
    }
  }

  // 按 tick 倒序
  allTicks.sort((a, b) => b.tick - a.tick);

  if (loading && !historyData && wsTicks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 animate-pulse">加载事件历史...</p>
      </div>
    );
  }

  if (error && !historyData && wsTicks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">加载失败</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">事件时间线</h2>
        <span className="text-sm text-gray-400">
          共 {allTicks.length} 个 Tick 记录
        </span>
      </div>

      {/* 时间线 */}
      {allTicks.length > 0 ? (
        <div className="relative">
          {allTicks.map((tick) => (
            <TickCard key={tick.tick} tick={tick} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-500">暂无事件记录</p>
          <p className="text-gray-600 text-sm mt-1">
            启动世界引擎并注入事件后，事件将在此显示
          </p>
        </div>
      )}
    </div>
  );
}
