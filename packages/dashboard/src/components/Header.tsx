// ============================================================================
// BeeClaw Dashboard — 顶部导航栏
// ============================================================================

import type { ConnectionState } from './StatusBadge';
import { ConnectionBadge } from './StatusBadge';

interface HeaderProps {
  wsState: ConnectionState;
  tick: number;
}

export function Header({ wsState, tick }: HeaderProps) {
  return (
    <header className="h-14 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🐝</span>
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-bee-400">Bee</span>
          <span className="text-gray-100">Claw</span>
        </h1>
        <span className="text-xs text-gray-500 hidden sm:inline">群体智能仿真引擎</span>
      </div>

      {/* 状态指示器 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="font-mono text-bee-400">Tick #{tick}</span>
        </div>
        <ConnectionBadge state={wsState} />
      </div>
    </header>
  );
}
