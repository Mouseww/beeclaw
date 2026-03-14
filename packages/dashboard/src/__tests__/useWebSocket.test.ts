// ============================================================================
// BeeClaw Dashboard — useWebSocket Hook 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';

// 捕获创建的 WebSocket 实例
let lastWsInstance: {
  url: string;
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  close: ReturnType<typeof vi.fn>;
} | null = null;

// 用于追踪构造次数的 spy
const wsConstructorSpy = vi.fn();

beforeEach(() => {
  lastWsInstance = null;
  wsConstructorSpy.mockClear();
  vi.useFakeTimers();

  // 使用 class 来 mock WebSocket，确保 new 调用正常工作
  class MockWS {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    url: string;
    readyState = 0;
    onopen: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    close = vi.fn();
    send = vi.fn();

    constructor(url: string) {
      wsConstructorSpy(url);
      this.url = url;
      lastWsInstance = this;
    }
  }

  vi.stubGlobal('WebSocket', MockWS);
});

describe('useWebSocket', () => {
  it('初始状态应为 disconnected，挂载后立即尝试连接', async () => {
    const { result } = renderHook(() => useWebSocket());

    // 初始化时会调用 connect()
    expect(lastWsInstance).not.toBeNull();
    expect(result.current.state).toBe('connecting');
    expect(result.current.lastTick).toBeNull();
    expect(result.current.lastConsensus).toEqual([]);
    expect(result.current.tickHistory).toEqual([]);
  });

  it('WebSocket 打开后状态应为 connected', async () => {
    const { result } = renderHook(() => useWebSocket());

    // 模拟 WS 连接成功
    act(() => {
      lastWsInstance!.readyState = 1;
      lastWsInstance!.onopen?.(new Event('open'));
    });

    expect(result.current.state).toBe('connected');
  });

  it('收到 tick 消息应更新 lastTick 和 tickHistory', async () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      lastWsInstance!.readyState = 1;
      lastWsInstance!.onopen?.(new Event('open'));
    });

    const tickData = {
      tick: 42,
      eventsProcessed: 3,
      responsesCollected: 10,
      agentsActivated: 5,
      durationMs: 150,
      timestamp: '2026-03-13T12:00:00Z',
    };

    act(() => {
      const msg = JSON.stringify({ type: 'tick', data: tickData, ts: Date.now() });
      lastWsInstance!.onmessage?.(new MessageEvent('message', { data: msg }));
    });

    expect(result.current.lastTick).toEqual(tickData);
    expect(result.current.tickHistory).toHaveLength(1);
    expect(result.current.tickHistory[0]).toEqual(tickData);
  });

  it('收到 consensus 消息应更新 lastConsensus', async () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      lastWsInstance!.readyState = 1;
      lastWsInstance!.onopen?.(new Event('open'));
    });

    const signals = [
      {
        topic: 'BTC',
        tick: 10,
        sentimentDistribution: { bullish: 60, bearish: 20, neutral: 20 },
        intensity: 0.8,
        consensus: 0.7,
        trend: 'strengthening',
        topArguments: [],
        alerts: [],
      },
    ];

    act(() => {
      const msg = JSON.stringify({ type: 'consensus', data: signals, ts: Date.now() });
      lastWsInstance!.onmessage?.(new MessageEvent('message', { data: msg }));
    });

    expect(result.current.lastConsensus).toEqual(signals);
  });

  it('tickHistory 应限制最多 100 条', async () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      lastWsInstance!.readyState = 1;
      lastWsInstance!.onopen?.(new Event('open'));
    });

    // 推送 105 条 tick
    act(() => {
      for (let i = 0; i < 105; i++) {
        const tickData = {
          tick: i,
          eventsProcessed: 1,
          responsesCollected: 1,
          agentsActivated: 1,
          durationMs: 10,
          timestamp: `2026-03-13T12:00:${String(i % 60).padStart(2, '0')}Z`,
        };
        const msg = JSON.stringify({ type: 'tick', data: tickData, ts: Date.now() });
        lastWsInstance!.onmessage?.(new MessageEvent('message', { data: msg }));
      }
    });

    expect(result.current.tickHistory.length).toBeLessThanOrEqual(100);
    // 最新的应该是 104
    expect(result.current.lastTick?.tick).toBe(104);
  });

  it('WebSocket 关闭后应设为 disconnected 并尝试重连', async () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      lastWsInstance!.readyState = 1;
      lastWsInstance!.onopen?.(new Event('open'));
    });

    expect(result.current.state).toBe('connected');

    // 模拟断开（需要将 readyState 设为 CLOSED，否则 connect() 会因为检查到 OPEN 而跳过）
    act(() => {
      lastWsInstance!.readyState = 3; // CLOSED
      lastWsInstance!.onclose?.(new CloseEvent('close'));
    });

    expect(result.current.state).toBe('disconnected');

    // 3 秒后应该重新尝试连接
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // 应该创建了新的 WebSocket 实例
    expect(wsConstructorSpy).toHaveBeenCalledTimes(2);
  });

  it('WebSocket 出错应关闭连接', async () => {
    renderHook(() => useWebSocket());

    const ws = lastWsInstance!;

    act(() => {
      ws.onerror?.(new Event('error'));
    });

    expect(ws.close).toHaveBeenCalled();
  });

  it('组件卸载后应关闭 WebSocket', () => {
    const { unmount } = renderHook(() => useWebSocket());

    const ws = lastWsInstance!;

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it('收到非法 JSON 消息应静默忽略', async () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      lastWsInstance!.readyState = 1;
      lastWsInstance!.onopen?.(new Event('open'));
    });

    // 发送无效 JSON — 不应抛错
    act(() => {
      lastWsInstance!.onmessage?.(new MessageEvent('message', { data: 'invalid json!!!' }));
    });

    // 状态不变
    expect(result.current.lastTick).toBeNull();
    expect(result.current.state).toBe('connected');
  });
});
