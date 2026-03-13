// ============================================================================
// BeeClaw Dashboard — 共识面板（多空比例、趋势信号）
// ============================================================================

import { usePolling } from '../hooks/usePolling';
import { useWebSocket } from '../hooks/useWebSocket';
import { fetchConsensus } from '../api/client';
import type { ConsensusResponse, ConsensusSignal } from '../types';

function trendLabel(trend: ConsensusSignal['trend']): {
  text: string;
  color: string;
} {
  switch (trend) {
    case 'forming':
      return { text: '形成中', color: 'text-yellow-400' };
    case 'strengthening':
      return { text: '增强中', color: 'text-green-400' };
    case 'weakening':
      return { text: '减弱中', color: 'text-orange-400' };
    case 'reversing':
      return { text: '反转中', color: 'text-red-400' };
  }
}

function SentimentDonut({ signal }: { signal: ConsensusSignal }) {
  const { bullish, bearish, neutral } = signal.sentimentDistribution;
  const total = bullish + bearish + neutral;

  if (total === 0) {
    return (
      <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center">
        <span className="text-xs text-gray-500">无数据</span>
      </div>
    );
  }

  const bullPct = Math.round((bullish / total) * 100);
  const bearPct = Math.round((bearish / total) * 100);
  const neutPct = 100 - bullPct - bearPct;

  // 简单的比例条
  return (
    <div className="space-y-1.5 w-full">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
        {bullPct > 0 && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${bullPct}%` }}
          />
        )}
        {neutPct > 0 && (
          <div
            className="bg-gray-500 transition-all duration-500"
            style={{ width: `${neutPct}%` }}
          />
        )}
        {bearPct > 0 && (
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${bearPct}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-green-400">看多 {bullPct}%</span>
        <span className="text-gray-400">中立 {neutPct}%</span>
        <span className="text-red-400">看空 {bearPct}%</span>
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: ConsensusSignal }) {
  const trend = trendLabel(signal.trend);

  return (
    <div className="card space-y-4">
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{signal.topic}</h3>
          <p className="text-xs text-gray-500 mt-0.5">Tick #{signal.tick}</p>
        </div>
        <div className="text-right">
          <span className={`text-sm font-semibold ${trend.color}`}>
            {trend.text}
          </span>
          <p className="text-xs text-gray-500">
            共识度 {Math.round(signal.consensus * 100)}%
          </p>
        </div>
      </div>

      {/* 多空比例 */}
      <SentimentDonut signal={signal} />

      {/* 情绪强度 */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>情绪强度</span>
          <span>{Math.round(signal.intensity * 100)}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-bee-500 rounded-full transition-all duration-500"
            style={{ width: `${signal.intensity * 100}%` }}
          />
        </div>
      </div>

      {/* 主要论点 */}
      {signal.topArguments.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            主要论点
          </p>
          <div className="space-y-2">
            {signal.topArguments.map((arg, i) => (
              <div
                key={i}
                className="bg-gray-800/50 rounded-lg p-2.5 text-sm"
              >
                <p className="text-gray-200">{arg.position}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{arg.supporters} 人支持</span>
                  <span>
                    平均信誉 {(arg.avgCredibility * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 预警信号 */}
      {signal.alerts.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            预警信号
          </p>
          <div className="space-y-1.5">
            {signal.alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-3 py-2"
              >
                <span className="text-yellow-400">⚠</span>
                <span className="text-yellow-200 flex-1">
                  {alert.description}
                </span>
                <span className="text-xs text-yellow-500">
                  {Math.round(alert.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConsensusPanel() {
  const { data: consensusData, loading, error } =
    usePolling<ConsensusResponse>(fetchConsensus, 5000);
  const { lastConsensus } = useWebSocket();

  // 优先使用 ws 实时推送的共识数据
  const signals: ConsensusSignal[] =
    lastConsensus.length > 0
      ? lastConsensus
      : consensusData?.latest ?? [];

  const topics = consensusData?.topics ?? [];

  if (loading && !consensusData && lastConsensus.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 animate-pulse">加载共识数据...</p>
      </div>
    );
  }

  if (error && !consensusData && lastConsensus.length === 0) {
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
        <h2 className="text-2xl font-bold text-white">共识面板</h2>
        {topics.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">话题:</span>
            {topics.map((t) => (
              <span
                key={t}
                className="badge bg-bee-900/50 text-bee-400 border border-bee-800"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 共识信号卡片 */}
      {signals.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {signals.map((signal) => (
            <SignalCard key={`${signal.topic}-${signal.tick}`} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-500">暂无共识数据</p>
          <p className="text-gray-600 text-sm mt-1">
            等待世界运行并产生足够数据后，共识信号将在此显示
          </p>
        </div>
      )}
    </div>
  );
}
