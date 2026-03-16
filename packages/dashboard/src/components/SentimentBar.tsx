// ============================================================================
// BeeClaw Dashboard — 情绪分布条
// ============================================================================

interface SentimentBarProps {
  bullish: number;
  bearish: number;
  neutral: number;
  showLabels?: boolean;
  height?: string;
}

/** 多空比例可视化条 */
export function SentimentBar({
  bullish,
  bearish,
  neutral,
  showLabels = true,
  height = 'h-3',
}: SentimentBarProps) {
  const total = bullish + bearish + neutral;
  if (total === 0) {
    return (
      <div className={`w-full ${height} rounded-full overflow-hidden`} style={{ backgroundColor: 'var(--bg-tertiary)' }} />
    );
  }

  const bPct = (bullish / total) * 100;
  const nPct = (neutral / total) * 100;
  const sPct = (bearish / total) * 100;

  return (
    <div>
      <div className={`w-full ${height} rounded-full overflow-hidden flex`} style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        {bPct > 0 && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${bPct}%` }}
          />
        )}
        {nPct > 0 && (
          <div
            className="bg-gray-500 transition-all duration-500"
            style={{ width: `${nPct}%` }}
          />
        )}
        {sPct > 0 && (
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${sPct}%` }}
          />
        )}
      </div>
      {showLabels && (
        <div className="flex justify-between mt-1 text-xs">
          <span className="text-green-400">看多 {bPct.toFixed(0)}%</span>
          <span style={{ color: 'var(--text-tertiary)' }}>中立 {nPct.toFixed(0)}%</span>
          <span className="text-red-400">看空 {sPct.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}
