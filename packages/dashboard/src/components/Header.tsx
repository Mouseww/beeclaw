// ============================================================================
// BeeClaw Dashboard — 顶部导航栏
// ============================================================================

import { Link } from 'react-router-dom';
import type { ConnectionState } from './StatusBadge';
import { ConnectionBadge } from './StatusBadge';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '../hooks/useTheme';

interface HeaderProps {
  wsState: ConnectionState;
  tick: number;
  theme: Theme;
  onThemeCycle: () => void;
  onToggleSidebar: () => void;
}

export function Header({ wsState, tick, theme, onThemeCycle, onToggleSidebar }: HeaderProps) {
  return (
    <header className="h-14 border-b theme-border theme-bg-secondary backdrop-blur-sm flex items-center justify-between px-3 sm:px-4 lg:px-6 sticky top-0 z-50" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex lg:hidden items-center justify-center rounded-lg px-2 py-1.5 theme-text-secondary"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
          aria-label="打开导航菜单"
        >
          ☰
        </button>
        <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-xl sm:text-2xl shrink-0">🐝</span>
          <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
            <span className="text-bee-400">Bee</span>
            <span className="theme-text-primary">Claw</span>
          </h1>
        </Link>
        <span className="text-xs theme-text-muted hidden md:inline">群体智能仿真引擎</span>
      </div>

      {/* 状态指示器 */}
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-sm theme-text-muted">
          <span className="font-mono text-bee-400">Tick #{tick}</span>
        </div>
        <ConnectionBadge state={wsState} />
        <ThemeToggle theme={theme} onCycle={onThemeCycle} />
      </div>
    </header>
  );
}
