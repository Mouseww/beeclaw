// ============================================================================
// BeeClaw Dashboard — 顶部导航栏
// ============================================================================

import type { ConnectionState } from './StatusBadge';
import { ConnectionBadge } from './StatusBadge';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '../hooks/useTheme';

interface HeaderProps {
  wsState: ConnectionState;
  tick: number;
  theme: Theme;
  onThemeCycle: () => void;
}

export function Header({ wsState, tick, theme, onThemeCycle }: HeaderProps) {
  return (
    <header className="h-14 border-b theme-border theme-bg-secondary backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🐝</span>
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-bee-400">Bee</span>
          <span className="theme-text-primary">Claw</span>
        </h1>
        <span className="text-xs theme-text-muted hidden sm:inline">群体智能仿真引擎</span>
      </div>

      {/* 状态指示器 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm theme-text-muted">
          <span className="font-mono text-bee-400">Tick #{tick}</span>
        </div>
        <ConnectionBadge state={wsState} />
        <ThemeToggle theme={theme} onCycle={onThemeCycle} />
      </div>
    </header>
  );
}
