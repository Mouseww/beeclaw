// ============================================================================
// BeeClaw Server — WebSocket 处理（含心跳检测 + 广播容错）
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

/** 心跳间隔（30 秒） */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** 心跳超时（连续 2 次无 pong 视为断开） */
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2 + 5_000;

interface ClientMeta {
  socket: WebSocket;
  isAlive: boolean;
  connectedAt: number;
}

const clients = new Map<WebSocket, ClientMeta>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** 注册 WebSocket 路由 */
export function registerWs(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket) => {
    const meta: ClientMeta = { socket, isAlive: true, connectedAt: Date.now() };
    clients.set(socket, meta);

    socket.send(JSON.stringify({ type: 'connected', message: '🐝 BeeClaw WebSocket 已连接' }));

    // 响应 pong 帧，标记连接存活
    socket.on('pong', () => {
      const m = clients.get(socket);
      if (m) m.isAlive = true;
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', (err) => {
      console.warn('[WS] 客户端连接异常:', err.message);
      clients.delete(socket);
    });
  });

  // 启动心跳检测
  startHeartbeat();
}

/** 启动心跳定时器：定期 ping 所有客户端，淘汰无响应的连接 */
function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const [ws, meta] of clients) {
      if (!meta.isAlive) {
        // 上一轮 ping 未收到 pong，断开连接
        console.warn('[WS] 心跳超时，断开客户端');
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      meta.isAlive = false;
      try {
        ws.ping();
      } catch {
        // ping 失败直接清理
        clients.delete(ws);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/** 停止心跳定时器（用于优雅退出） */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** 关闭所有 WebSocket 连接（用于优雅退出） */
export function closeAllConnections(): void {
  for (const [ws] of clients) {
    try {
      ws.close(1001, 'Server shutting down');
    } catch {
      // 忽略关闭错误
    }
  }
  clients.clear();
}

/** 向所有客户端广播消息 */
export function broadcast(type: string, data: unknown): void {
  const payload = JSON.stringify({ type, data, ts: Date.now() });
  for (const [ws] of clients) {
    if (ws.readyState === 1) {
      try {
        ws.send(payload);
      } catch (err) {
        console.warn('[WS] 广播发送失败，移除客户端:', err instanceof Error ? err.message : err);
        clients.delete(ws);
      }
    }
  }
}

/** 当前连接数 */
export function getConnectionCount(): number {
  return clients.size;
}
