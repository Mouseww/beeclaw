// ============================================================================
// BeeClaw Dashboard — 主题管理 Hook
// 支持亮色/暗色模式切换，跟随系统偏好，持久化到 localStorage
// ============================================================================

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'beeclaw-theme';

/** 获取系统偏好的主题 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 从 localStorage 读取主题设置 */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

/** 解析最终生效的主题 */
function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

/**
 * 主题管理 Hook
 * - 默认跟随系统偏好 (prefers-color-scheme)
 * - 持久化用户选择到 localStorage
 * - 在 <html> 上切换 class="dark" / class="light"
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  // 应用主题到 DOM
  const applyTheme = useCallback((resolvedTheme: ResolvedTheme) => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    setResolved(resolvedTheme);
  }, []);

  // 切换主题
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      localStorage.setItem(STORAGE_KEY, newTheme);
      applyTheme(resolveTheme(newTheme));
    },
    [applyTheme],
  );

  // 在三种模式间循环: system → light → dark → system
  const cycleTheme = useCallback(() => {
    const next: Record<Theme, Theme> = {
      system: 'light',
      light: 'dark',
      dark: 'system',
    };
    setTheme(next[theme]);
  }, [theme, setTheme]);

  // 初始化 + 监听系统偏好变化
  useEffect(() => {
    applyTheme(resolveTheme(theme));

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme(getSystemTheme());
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  return { theme, resolved, setTheme, cycleTheme };
}
