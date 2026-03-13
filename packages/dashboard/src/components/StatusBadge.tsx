// ============================================================================
// BeeClaw Dashboard — 状态标记组件
// ============================================================================

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/** WebSocket 连接状态指示器 */
export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const config = {
    connected: { dot: 'bg-green-400 animate-pulse', text: 'text-green-400', label: '已连接' },
    connecting: { dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-400', label: '连接中' },
    disconnected: { dot: 'bg-red-400', text: 'text-red-400', label: '已断开' },
  } as const;

  const c = config[state];

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
    </div>
  );
}

/** Agent 状态标记 */
export function AgentStatusBadge({ status }: { status: 'active' | 'dormant' | 'dead' }) {
  const cls = {
    active: 'badge-active',
    dormant: 'badge-dormant',
    dead: 'badge-dead',
  } as const;

  const labels = {
    active: '活跃',
    dormant: '休眠',
    dead: '淘汰',
  } as const;

  return <span className={`badge ${cls[status]}`}>{labels[status]}</span>;
}

/** 情绪趋势标记 */
export function TrendBadge({ trend }: { trend: string }) {
  const config: Record<string, { cls: string; label: string }> = {
    forming: { cls: 'bg-blue-900/50 text-blue-400 border border-blue-800', label: '形成中' },
    strengthening: { cls: 'bg-green-900/50 text-green-400 border border-green-800', label: '增强' },
    weakening: { cls: 'bg-yellow-900/50 text-yellow-400 border border-yellow-800', label: '减弱' },
    reversing: { cls: 'bg-red-900/50 text-red-400 border border-red-800', label: '反转' },
  };

  const c = config[trend] ?? { cls: 'bg-gray-800 text-gray-400', label: trend };

  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}

/** 模型层级标记 */
export function ModelTierBadge({ tier }: { tier: 'local' | 'cheap' | 'strong' }) {
  const config = {
    local: { cls: 'bg-gray-800 text-gray-400 border border-gray-700', label: 'Local' },
    cheap: { cls: 'bg-sky-900/50 text-sky-400 border border-sky-800', label: 'Cheap' },
    strong: { cls: 'bg-purple-900/50 text-purple-400 border border-purple-800', label: 'Strong' },
  } as const;

  const c = config[tier];

  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}
