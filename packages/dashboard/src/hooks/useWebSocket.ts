// ============================================================================
// BeeClaw Dashboard — WebSocket Hook（指数退避重连 + 最大重连次数）
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMessage, TickResult, ConsensusSignal } from '../types';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/** 重连配置 */
const RECONNECT_BASE_MS = 1_000;   // 初始重连间隔 1s
const RECONNECT_MAX_MS = 30_000;   // 最大重连间隔 30s
const MAX_RECONNECT_ATTEMPTS = 20; // 最大重连次数

interface UseWebSocketReturn {
  state: ConnectionState;
  lastTick: TickResult | null;
  lastConsensus: ConsensusSignal[];
  tickHistory: TickResult[];
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [lastTick, setLastTick] = useState<TickResult | null>(null);
  const [lastConsensus, setLastConsensus] = useState<ConsensusSignal[]>([]);
  const [tickHistory, setTickHistory] = useState<TickResult[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // 检查最大重连次数
    if (reconnectAttempt.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[WS] 已达最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，停止重连`);
      setState('disconnected');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    setState('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState('connected');
      reconnectAttempt.current = 0; // 连接成功，重置重连计数
      console.log('[WS] Connected to BeeClaw server');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;

        switch (msg.type) {
          case 'tick': {
            const tickData = msg.data as TickResult;
            setLastTick(tickData);
            setTickHistory((prev) => {
              const next = [...prev, tickData];
              // 保留最近 100 条
              return next.length > 100 ? next.slice(-100) : next;
            });
            break;
          }
          case 'consensus': {
            const signals = msg.data as ConsensusSignal[];
            setLastConsensus(signals);
            break;
          }
          // 'connected', 'event_injected' 等其他消息可以忽略
        }
      } catch {
        console.warn('[WS] 消息解析失败，已忽略');
      }
    };

    ws.onclose = () => {
      setState('disconnected');
      reconnectAttempt.current++;

      if (reconnectAttempt.current < MAX_RECONNECT_ATTEMPTS) {
        // 指数退避: 1s, 2s, 4s, 8s, 16s... 最大 30s
        const delayMs = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current - 1),
          RECONNECT_MAX_MS,
        );
        console.log(
          `[WS] Disconnected, reconnecting in ${(delayMs / 1000).toFixed(1)}s ` +
          `(attempt ${reconnectAttempt.current}/${MAX_RECONNECT_ATTEMPTS})...`
        );
        reconnectTimer.current = setTimeout(connect, delayMs);
      } else {
        console.warn(`[WS] 已达最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，停止重连`);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, lastTick, lastConsensus, tickHistory };
}
