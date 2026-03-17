// ============================================================================
// BeeClaw Dashboard — useTheme Hook 补充测试
// 覆盖 cycleTheme、localStorage 读写、系统偏好监听
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
let mediaListeners: Array<() => void> = [];

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  mediaListeners = [];

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, fn: () => void) => { mediaListeners.push(fn); }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('useTheme', () => {
  it('默认应使用 system 主题', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('从 localStorage 读取已保存的主题', () => {
    localStorageMock.setItem('beeclaw-theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.resolved).toBe('light');
  });

  it('setTheme 应更新主题并持久化', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolved).toBe('dark');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('beeclaw-theme', 'dark');
  });

  it('cycleTheme 应从 system → light → dark → system 切换', () => {
    const { result } = renderHook(() => useTheme());

    // system → light
    act(() => result.current.cycleTheme());
    expect(result.current.theme).toBe('light');

    // light → dark
    act(() => result.current.cycleTheme());
    expect(result.current.theme).toBe('dark');

    // dark → system
    act(() => result.current.cycleTheme());
    expect(result.current.theme).toBe('system');
  });

  it('setTheme(light) 应在 DOM 上添加 light class', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setTheme(dark) 应在 DOM 上添加 dark class', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('localStorage 中存储无效值时应回退到 system', () => {
    localStorageMock.setItem('beeclaw-theme', 'invalid-value');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('localStorage 为空时应回退到 system', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('resolved 在 system 模式下应返回系统偏好', () => {
    const { result } = renderHook(() => useTheme());
    // matchMedia mock 返回 matches: true (dark)
    expect(result.current.resolved).toBe('dark');
  });

  it('多次快速切换不应导致状态不一致', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
      result.current.setTheme('dark');
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.resolved).toBe('light');
  });
});
