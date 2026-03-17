// ============================================================================
// BeeClaw Dashboard — Agent 活跃度面积图
// 展示每 tick 的 agentsActivated / agentsFiltered / agentsEliminated 分布
// ============================================================================

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TickResult } from '../../types';

interface AgentActivityDataPoint {
  tick: number;
  /** 激活（活跃）Agent 数 */
  active: number;
  /** 被过滤（休眠）Agent 数 */
  dormant: number;
  /** 被淘汰 Agent 数 */
  dead: number;
}

interface AgentActivityChartProps {
  history: TickResult[];
}

/** 将 TickResult 列表转为面积图数据 */
function toActivityData(history: TickResult[]): AgentActivityDataPoint[] {
  return [...history]
    .sort((a, b) => a.tick - b.tick)
    .map((t) => ({
      tick: t.tick,
      active: t.agentsActivated,
      dormant: t.agentsFiltered ?? 0,
      dead: t.agentsEliminated ?? 0,
    }));
}

/** 自定义 Tooltip */
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

  const total = payload.reduce((sum, p) => sum + p.value, 0);

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        color: 'var(--text-primary)',
      }}
    >
      <p className="font-mono mb-1.5" style={{ color: 'var(--text-muted)' }}>
        Tick #{label}
      </p>
      {payload.map((entry) => {
        const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : '0';
        return (
          <p key={entry.name} style={{ color: entry.color }}>
            {entry.name}:{' '}
            <span className="font-semibold">{entry.value}</span>
            <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
              ({pct}%)
            </span>
          </p>
        );
      })}
      <p className="mt-1 pt-1" style={{ borderTop: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}>
        合计: <span className="font-semibold text-white">{total}</span>
      </p>
    </div>
  );
}

export function AgentActivityChart({ history }: AgentActivityChartProps) {
  if (!history.length) {
    return (
      <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
        暂无历史数据
      </p>
    );
  }

  const data = toActivityData(history);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-bullish)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-bullish)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradDormant" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradDead" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-bearish)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-bearish)" stopOpacity={0.05} />
          </linearGradient>
        </defs>

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

        {/* 堆叠面积：active / dormant / dead */}
        <Area
          type="monotone"
          dataKey="active"
          name="活跃"
          stackId="agents"
          stroke="var(--color-bullish)"
          strokeWidth={1.5}
          fill="url(#gradActive)"
        />
        <Area
          type="monotone"
          dataKey="dormant"
          name="休眠"
          stackId="agents"
          stroke="#f59e0b"
          strokeWidth={1.5}
          fill="url(#gradDormant)"
        />
        <Area
          type="monotone"
          dataKey="dead"
          name="淘汰"
          stackId="agents"
          stroke="var(--color-bearish)"
          strokeWidth={1.5}
          fill="url(#gradDead)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
