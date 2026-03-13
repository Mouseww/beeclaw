// ============================================================================
// BeeClaw Dashboard — usePolling Hook 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePolling } from '../hooks/usePolling';

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该在初始化时调用 fetcher 并设置 loading', async () => {
    const mockData = { value: 42 };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => usePolling(fetcher, 5000));

    // 初始状态应为 loading
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('应该在指定间隔后重复调用 fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });

    renderHook(() => usePolling(fetcher, 3000));

    // 初始调用
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    // 推进 3 秒 — 应触发第二次调用
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it('fetcher 失败时应该设置 error', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network failed'));

    const { result } = renderHook(() => usePolling(fetcher, 5000));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network failed');
    expect(result.current.data).toBeNull();
  });

  it('非 Error 对象的异常应该设置 "Unknown error"', async () => {
    const fetcher = vi.fn().mockRejectedValue('string error');

    const { result } = renderHook(() => usePolling(fetcher, 5000));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Unknown error');
  });

  it('成功请求后 error 应该被清除', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('fail'));
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePolling(fetcher, 3000));

    // 第一次调用失败
    await waitFor(() => {
      expect(result.current.error).toBe('fail');
    });

    // 推进 3 秒触发第二次调用
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual({ ok: true });
    });
  });

  it('refresh 函数应该立即触发一次数据获取', async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 });

    const { result } = renderHook(() => usePolling(fetcher, 10000));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    // 手动 refresh
    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it('组件卸载后应该清除定时器', async () => {
    const fetcher = vi.fn().mockResolvedValue({});

    const { unmount } = renderHook(() => usePolling(fetcher, 3000));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    unmount();

    // 推进时间后不应再触发
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
