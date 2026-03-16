// ============================================================================
// BeeClaw Dashboard — 主题切换按钮
// ============================================================================

import type { Theme } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme: Theme;
  onCycle: () => void;
}

const THEME_CONFIG: Record<Theme, { icon: string; label: string }> = {
  system: { icon: '🖥️', label: '跟随系统' },
  light: { icon: '☀️', label: '亮色模式' },
  dark: { icon: '🌙', label: '暗色模式' },
};

/** 主题切换按钮 — 点击循环: 系统 → 亮色 → 暗色 */
export function ThemeToggle({ theme, onCycle }: ThemeToggleProps) {
  const { icon, label } = THEME_CONFIG[theme];

  return (
    <button
      onClick={onCycle}
      title={label}
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm
                 text-gray-400 dark:text-gray-400 light:text-gray-600
                 hover:bg-gray-800 dark:hover:bg-gray-800 light:hover:bg-gray-200
                 transition-colors duration-150"
    >
      <span className="text-base">{icon}</span>
      <span className="text-xs hidden sm:inline">{label}</span>
    </button>
  );
}
