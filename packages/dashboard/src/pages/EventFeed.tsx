// ============================================================================
// BeeClaw Dashboard — 事件流页面
// ============================================================================

import { useWebSocket } from '../hooks/useWebSocket';
import { Card, EmptyState } from '../components';
import { EventInjectForm } from '../components/EventInjectForm';
import type { TickResult, TickResponse } from '../types';

export function EventFeed() {
  const { tickHistory, lastTick } = useWebSocket();

  // 倒序显示：最新的在前面
  const reversed = [...tickHistory].reverse();

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold text-white">事件流</h2>
        <p className="text-sm text-gray-500 mt-1">实时事件和 Agent 响应</p>
      </div>

      {/* 事件注入 */}
      <Card title="注入新事件">
        <EventInjectForm />
      </Card>

      {/* 实时事件流 */}
      <div className="space-y-3">
        {reversed.length > 0 ? (
          reversed.map((tick) => (
            <TickCard key={tick.tick} tick={tick} isLatest={tick.tick === lastTick?.tick} />
          ))
        ) : (
          <Card>
            <EmptyState icon="⚡" message="等待事件流数据...（需要 WebSocket 连接）" />
          </Card>
        )}
      </div>
    </div>
  );
}

/** 单个 Tick 的事件卡片 */
function TickCard({ tick, isLatest }: { tick: TickResult; isLatest: boolean }) {
  return (
    <div
      className={`card transition-all ${
        isLatest ? 'border-bee-500/50 shadow-bee-500/10 shadow-lg' : ''
      }`}
    >
      {/* Tick 头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-bee-400 font-bold">Tick #{tick.tick}</span>
          {isLatest && (
            <span className="badge bg-bee-500/20 text-bee-400 border border-bee-500/30">
              最新
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{tick.eventsProcessed} 事件</span>
          <span>{tick.agentsActivated} Agent 激活</span>
          <span>{tick.durationMs}ms</span>
          <span>{new Date(tick.timestamp).toLocaleTimeString('zh-CN')}</span>
        </div>
      </div>

      {/* 事件列表 */}
      {tick.events && tick.events.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">事件</p>
          <div className="space-y-1.5">
            {tick.events.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50"
              >
                <CategoryIcon category={evt.category} />
                <span className="text-sm text-gray-200 flex-1">{evt.title}</span>
                <ImportanceIndicator importance={evt.importance} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent 响应 */}
      {tick.responses && tick.responses.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
            Agent 响应 ({tick.responses.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tick.responses.slice(0, 6).map((resp) => (
              <ResponseCard key={resp.agentId} response={resp} />
            ))}
          </div>
          {tick.responses.length > 6 && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              +{tick.responses.length - 6} 更多响应
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Agent 响应卡片 */
function ResponseCard({ response }: { response: TickResponse }) {
  const emotionColor =
    response.emotionalState > 0.3
      ? 'text-green-400'
      : response.emotionalState < -0.3
        ? 'text-red-400'
        : 'text-gray-400';

  return (
    <div className="px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-800">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-200">{response.agentName}</span>
        <span className={`text-xs ${emotionColor}`}>
          {response.emotionalState > 0 ? '+' : ''}
          {response.emotionalState.toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-gray-400 line-clamp-2">{response.opinion}</p>
      <span className="text-xs text-gray-600 mt-1 inline-block">
        {response.action}
      </span>
    </div>
  );
}

/** 分类图标 */
function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, string> = {
    finance: '💰',
    politics: '🏛️',
    tech: '💻',
    social: '👥',
    general: '📋',
  };
  return (
    <span className="text-sm w-6 text-center">{icons[category] ?? '📋'}</span>
  );
}

/** 重要性指示器 */
function ImportanceIndicator({ importance }: { importance: number }) {
  const pct = Math.round(importance * 100);
  const color =
    importance >= 0.7
      ? 'bg-red-500'
      : importance >= 0.4
        ? 'bg-yellow-500'
        : 'bg-gray-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right">{pct}%</span>
    </div>
  );
}
