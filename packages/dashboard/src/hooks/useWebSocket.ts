// ============================================================================
// BeeClaw Dashboard — WebSocket Hook
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMessage, TickResult, ConsensusSignal } from '../types';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface UseWebSocketReturn {
  state: ConnectionState;
  lastTick: TickResult | null;
  lastConsensus: ConsensusSignal[];
  tickHistory: TickResult[];
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [lastTick, setLastTick] = useState<TickResult | null>(null);
  const [lastConsensus, setLastConsensus] = useState<ConsensusSignal[]>([]);
  const [tickHistory, setTickHistory] = useState<TickResult[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    setState('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState('connected');
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
        // 忽略解析错误
      }
    };

    ws.onclose = () => {
      setState('disconnected');
      console.log('[WS] Disconnected, reconnecting in 3s...');
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, lastTick, lastConsensus, tickHistory };
}
