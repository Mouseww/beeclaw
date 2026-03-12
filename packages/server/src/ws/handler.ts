// ============================================================================
// BeeClaw Server — WebSocket 处理
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

const clients = new Set<WebSocket>();

/** 注册 WebSocket 路由 */
export function registerWs(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: 'connected', message: '🐝 BeeClaw WebSocket 已连接' }));

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });
}

/** 向所有客户端广播消息 */
export function broadcast(type: string, data: unknown): void {
  const payload = JSON.stringify({ type, data, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

/** 当前连接数 */
export function getConnectionCount(): number {
  return clients.size;
}
