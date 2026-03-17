// ============================================================================
// BeeClaw Dashboard — 情绪趋势折线图
// 基于 historyData 中的 TickResult，从 status.sentiment 历史推导情绪走势
// ============================================================================

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TickResult } from '../../types';

interface SentimentDataPoint {
  tick: number;
  // agentsActivated 作为情绪活跃代理数量的代理指标
  // 实际情绪数据需服务端在 TickResult 中扩展；此处演示结构化展示
  agentsActivated: number;
  responsesCollected: number;
  eventsProcessed: number;
}

interface SentimentTrendChartProps {
  history: TickResult[];
}

/** 将 TickResult 列表转换为图表数据点 */
function toChartData(history: TickResult[]): SentimentDataPoint[] {
  return [...history]
    .sort((a, b) => a.tick - b.tick)
    .map((t) => ({
      tick: t.tick,
      agentsActivated: t.agentsActivated,
      responsesCollected: t.responsesCollected,
      eventsProcessed: t.eventsProcessed,
    }));
}

/** 自定义 Tooltip 内容 */
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        color: 'var(--text-primary)',
      }}
    >
      <p className="font-mono mb-1" style={{ color: 'var(--text-muted)' }}>
        Tick #{label}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export function SentimentTrendChart({ history }: SentimentTrendChartProps) {
  if (!history.length) {
    return (
      <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
        暂无历史数据
      </p>
    );
  }

  const data = toChartData(history);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-primary)"
          vertical={false}
        />
        <XAxis
          dataKey="tick"
          tickFormatter={(v) => `#${v}`}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: 'var(--text-tertiary)' }}
          iconType="circle"
        />
        <Line
          type="monotone"
          dataKey="agentsActivated"
          name="激活 Agent"
          stroke="var(--color-bullish)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="responsesCollected"
          name="Agent 响应"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="eventsProcessed"
          name="处理事件"
          stroke="#f59e0b"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
