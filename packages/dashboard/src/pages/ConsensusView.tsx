// ============================================================================
// BeeClaw Dashboard — 共识引擎页面
// ============================================================================

import { usePolling } from '../hooks/usePolling';
import { fetchConsensus } from '../api/client';
import { Card, EmptyState, ErrorState } from '../components';
import { SentimentBar } from '../components/SentimentBar';
import { TrendBadge } from '../components/StatusBadge';
import type { ConsensusSignal } from '../types';

export function ConsensusView() {
  const { data, error, loading, refresh } = usePolling(fetchConsensus, 5000);

  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold text-white">共识引擎</h2>
        <p className="text-sm text-gray-500 mt-1">群体情绪聚合与趋势信号</p>
      </div>

      {/* 话题列表 */}
      {data?.topics && data.topics.length > 0 && (
        <Card title="活跃话题">
          <div className="flex flex-wrap gap-2">
            {data.topics.map((topic) => (
              <span
                key={topic}
                className="px-3 py-1 rounded-full bg-bee-500/10 text-bee-400 text-sm border border-bee-500/20"
              >
                {topic}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* 共识信号 */}
      {loading && !data ? (
        <div className="animate-pulse space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-900 border border-gray-800 rounded-xl" />
          ))}
        </div>
      ) : data?.latest && data.latest.length > 0 ? (
        <div className="space-y-4">
          {data.latest.map((signal, i) => (
            <SignalCard key={`${signal.topic}-${signal.tick}-${i}`} signal={signal} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon="📊" message="暂无共识信号，等待引擎运行..." />
        </Card>
      )}
    </div>
  );
}

/** 共识信号卡片 */
function SignalCard({ signal }: { signal: ConsensusSignal }) {
  return (
    <div className="card">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{signal.topic}</h3>
          <span className="text-xs text-gray-500 font-mono">Tick #{signal.tick}</span>
        </div>
        <TrendBadge trend={signal.trend} />
      </div>

      {/* 情绪分布 */}
      <div className="mb-4">
        <SentimentBar
          bullish={signal.sentimentDistribution.bullish}
          bearish={signal.sentimentDistribution.bearish}
          neutral={signal.sentimentDistribution.neutral}
          height="h-4"
        />
      </div>

      {/* 指标 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <MetricBox
          label="情绪强度"
          value={signal.intensity}
          color={signal.intensity > 0.7 ? 'text-red-400' : signal.intensity > 0.4 ? 'text-yellow-400' : 'text-green-400'}
        />
        <MetricBox
          label="共识度"
          value={signal.consensus}
          color={signal.consensus > 0.7 ? 'text-bee-400' : 'text-gray-300'}
        />
        <MetricBox
          label="看多比例"
          value={signal.sentimentDistribution.bullish}
          color="text-green-400"
          suffix="%"
          isPercent
        />
        <MetricBox
          label="看空比例"
          value={signal.sentimentDistribution.bearish}
          color="text-red-400"
          suffix="%"
          isPercent
        />
      </div>

      {/* 关键论点 */}
      {signal.topArguments.length > 0 && (
        <div className="border-t border-gray-800 pt-4 mb-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">关键论点</p>
          <div className="space-y-2">
            {signal.topArguments.map((arg, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/40"
              >
                <span className="text-sm text-gray-200 flex-1">{arg.position}</span>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{arg.supporters} 支持者</span>
                  <span>信誉 {arg.avgCredibility.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 预警信号 */}
      {signal.alerts.length > 0 && (
        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">预警信号</p>
          <div className="space-y-2">
            {signal.alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-900/10 border border-red-900/30"
              >
                <span className="text-sm mt-0.5">🚨</span>
                <div className="flex-1">
                  <p className="text-sm text-red-300">{alert.description}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="text-red-400/80">{alert.type}</span>
                    <span>置信度 {(alert.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 标的情绪 */}
      {signal.targetSentiments && signal.targetSentiments.length > 0 && (
        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">受影响标的</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {signal.targetSentiments.map((target) => {
              const total = target.bullish + target.bearish + target.neutral;
              const bPct = total > 0 ? Math.round((target.bullish / total) * 100) : 0;
              const sPct = total > 0 ? Math.round((target.bearish / total) * 100) : 0;
              const categoryIcons: Record<string, string> = {
                stock: '📈', sector: '🏭', commodity: '🛢️', crypto: '₿',
                index: '📊', macro: '🌐', other: '📋',
              };
              return (
                <div key={target.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/40">
                  <span>{categoryIcons[target.category] ?? '📋'}</span>
                  <span className="text-sm text-gray-200 flex-1">{target.name}</span>
                  <span className="text-xs font-mono text-green-400">{bPct}%</span>
                  <span className="text-xs text-gray-600">/</span>
                  <span className="text-xs font-mono text-red-400">{sPct}%</span>
                  <span className="text-xs text-gray-500">({total}人)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 指标值显示 */
function MetricBox({
  label,
  value,
  color,
  suffix = '',
  isPercent = false,
}: {
  label: string;
  value: number;
  color: string;
  suffix?: string;
  isPercent?: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${color}`}>
        {isPercent ? Math.round(value) : (typeof value === 'number' ? value.toFixed(1) : value)}
        {suffix}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
