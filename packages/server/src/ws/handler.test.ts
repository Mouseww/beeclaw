// ============================================================================
// ws/handler 单元测试
// 测试 WebSocket 连接管理、心跳检测、广播、优雅关闭
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerWs,
  stopHeartbeat,
  closeAllConnections,
  broadcast,
  broadcastSignal,
  getConnectionCount,
} from './handler.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock WebSocket 工厂 ──

function createMockSocket(overrides?: Partial<Record<string, any>>) {
  const listeners = new Map<string, ((...args: any[]) => void)[]>();
  const socket: Record<string, any> = {
    readyState: 1, // OPEN
    send: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    }),
    // 触发已注册的事件
    _emit(event: string, ...args: any[]) {
      const cbs = listeners.get(event);
      if (cbs) cbs.forEach(cb => cb(...args));
    },
    ...overrides,
  };
  return socket;
}

// ── Mock FastifyInstance ──

function createMockApp() {
  let wsHandler: ((socket: any) => void) | null = null;

  const app = {
    get: vi.fn((_path: string, _opts: any, handler: (socket: any) => void) => {
      wsHandler = handler;
    }),
    // 模拟一个客户端连接
    _simulateConnection(socket: any) {
      if (!wsHandler) throw new Error('registerWs 尚未调用');
      wsHandler(socket);
    },
  };

  return app;
}

// ── 测试套件 ──

describe('ws/handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // 确保每个测试前清理遗留状态
    closeAllConnections();
    stopHeartbeat();
  });

  afterEach(() => {
    closeAllConnections();
    stopHeartbeat();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── registerWs ──

  describe('registerWs', () => {
    it('应注册 /ws 路由', () => {
      const app = createMockApp();
      registerWs(app as any);

      expect(app.get).toHaveBeenCalledWith(
        '/ws',
        { websocket: true },
        expect.any(Function),
      );
    });

    it('新连接应发送 connected 消息', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);

      expect(socket.send).toHaveBeenCalledOnce();
      const msg = JSON.parse(socket.send.mock.calls[0][0]);
      expect(msg.type).toBe('connected');
      expect(msg.message).toContain('BeeClaw');
    });

    it('新连接应增加 connectionCount', () => {
      const app = createMockApp();
      registerWs(app as any);

      const before = getConnectionCount();
      app._simulateConnection(createMockSocket());
      expect(getConnectionCount()).toBe(before + 1);
    });

    it('多个连接应正确计数', () => {
      const app = createMockApp();
      registerWs(app as any);

      const before = getConnectionCount();
      app._simulateConnection(createMockSocket());
      app._simulateConnection(createMockSocket());
      app._simulateConnection(createMockSocket());
      expect(getConnectionCount()).toBe(before + 3);
    });
  });

  // ── close 事件 ──

  describe('客户端 close 事件', () => {
    it('close 事件应移除连接', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);
      const countAfterConnect = getConnectionCount();

      socket._emit('close');
      expect(getConnectionCount()).toBe(countAfterConnect - 1);
    });
  });

  // ── error 事件 ──

  describe('客户端 error 事件', () => {
    it('error 事件应移除连接并打印警告', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);
      const countAfterConnect = getConnectionCount();

      socket._emit('error', new Error('Connection reset'));
      expect(getConnectionCount()).toBe(countAfterConnect - 1);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  // ── pong 事件 ──

  describe('心跳 pong 事件', () => {
    it('pong 事件应标记连接为存活', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);

      // 触发心跳检测：isAlive 会被置为 false，然后 ping
      vi.advanceTimersByTime(30_000);

      // 模拟收到 pong
      socket._emit('pong');

      // 再触发一次心跳检测，收到 pong 的连接不应被断开
      vi.advanceTimersByTime(30_000);
      expect(socket.terminate).not.toHaveBeenCalled();
    });
  });

  // ── 心跳检测 ──

  describe('心跳检测', () => {
    it('心跳应 ping 所有客户端', () => {
      const app = createMockApp();
      registerWs(app as any);

      const s1 = createMockSocket();
      const s2 = createMockSocket();
      app._simulateConnection(s1);
      app._simulateConnection(s2);

      vi.advanceTimersByTime(30_000);

      expect(s1.ping).toHaveBeenCalled();
      expect(s2.ping).toHaveBeenCalled();
    });

    it('未响应 pong 的客户端应被 terminate', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);

      // 第一次心跳：isAlive=true → false，ping
      vi.advanceTimersByTime(30_000);
      expect(socket.ping).toHaveBeenCalled();
      expect(socket.terminate).not.toHaveBeenCalled();

      // 无 pong 回复，第二次心跳：isAlive=false → terminate
      vi.advanceTimersByTime(30_000);
      expect(socket.terminate).toHaveBeenCalled();
    });

    it('ping 抛异常应清理连接', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket({
        ping: vi.fn(() => { throw new Error('Socket closed'); }),
      });
      app._simulateConnection(socket);
      const countBefore = getConnectionCount();

      vi.advanceTimersByTime(30_000);

      // ping 失败，应从 clients 中移除
      expect(getConnectionCount()).toBe(countBefore - 1);
    });

    it('多次调用 registerWs 不应创建多个心跳定时器', () => {
      const app1 = createMockApp();
      const app2 = createMockApp();
      registerWs(app1 as any);
      registerWs(app2 as any);

      const socket = createMockSocket();
      app1._simulateConnection(socket);

      vi.advanceTimersByTime(30_000);
      // 如果有多个定时器，ping 会被多次调用
      // 但因为 startHeartbeat 有幂等保护，只应 ping 一次
      expect(socket.ping).toHaveBeenCalledTimes(1);
    });
  });

  // ── stopHeartbeat ──

  describe('stopHeartbeat', () => {
    it('应停止心跳定时器', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);

      stopHeartbeat();

      // 心跳已停止，不应再 ping
      vi.advanceTimersByTime(60_000);
      expect(socket.ping).not.toHaveBeenCalled();
    });

    it('重复调用 stopHeartbeat 不应报错', () => {
      stopHeartbeat();
      stopHeartbeat();
      // 无异常即通过
    });
  });

  // ── closeAllConnections ──

  describe('closeAllConnections', () => {
    it('应关闭所有连接', () => {
      const app = createMockApp();
      registerWs(app as any);

      const s1 = createMockSocket();
      const s2 = createMockSocket();
      app._simulateConnection(s1);
      app._simulateConnection(s2);

      closeAllConnections();

      expect(s1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(s2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(getConnectionCount()).toBe(0);
    });

    it('close 抛异常不应影响其他连接的关闭', () => {
      const app = createMockApp();
      registerWs(app as any);

      const badSocket = createMockSocket({
        close: vi.fn(() => { throw new Error('Already closed'); }),
      });
      const goodSocket = createMockSocket();
      app._simulateConnection(badSocket);
      app._simulateConnection(goodSocket);

      // 不应抛出
      expect(() => closeAllConnections()).not.toThrow();
      expect(goodSocket.close).toHaveBeenCalled();
      expect(getConnectionCount()).toBe(0);
    });

    it('无连接时调用不应报错', () => {
      expect(() => closeAllConnections()).not.toThrow();
      expect(getConnectionCount()).toBe(0);
    });
  });

  // ── broadcast ──

  describe('broadcast', () => {
    it('应向所有 OPEN 连接发送消息', () => {
      const app = createMockApp();
      registerWs(app as any);

      const s1 = createMockSocket({ readyState: 1 });
      const s2 = createMockSocket({ readyState: 1 });
      app._simulateConnection(s1);
      app._simulateConnection(s2);

      // 清除 connected 消息的调用记录
      s1.send.mockClear();
      s2.send.mockClear();

      broadcast('tick', { tick: 1 });

      expect(s1.send).toHaveBeenCalledOnce();
      expect(s2.send).toHaveBeenCalledOnce();

      const msg1 = JSON.parse(s1.send.mock.calls[0][0]);
      expect(msg1.type).toBe('tick');
      expect(msg1.data).toEqual({ tick: 1 });
      expect(msg1.ts).toBeTypeOf('number');
    });

    it('应跳过非 OPEN 状态的连接', () => {
      const app = createMockApp();
      registerWs(app as any);

      const openSocket = createMockSocket({ readyState: 1 });
      const closedSocket = createMockSocket({ readyState: 3 }); // CLOSED
      app._simulateConnection(openSocket);
      app._simulateConnection(closedSocket);

      openSocket.send.mockClear();
      closedSocket.send.mockClear();

      broadcast('test', {});

      expect(openSocket.send).toHaveBeenCalledOnce();
      expect(closedSocket.send).not.toHaveBeenCalled();
    });

    it('send 抛异常应移除连接并继续广播', () => {
      const app = createMockApp();
      registerWs(app as any);

      const badSocket = createMockSocket({
        readyState: 1,
        send: vi.fn().mockImplementationOnce(() => { /* connected msg */ })
          .mockImplementationOnce(() => { throw new Error('Write failed'); }),
      });
      const goodSocket = createMockSocket({ readyState: 1 });
      app._simulateConnection(badSocket);
      app._simulateConnection(goodSocket);

      goodSocket.send.mockClear();

      // 广播不应抛出
      expect(() => broadcast('update', { data: 1 })).not.toThrow();
      expect(goodSocket.send).toHaveBeenCalledOnce();
      expect(console.warn).toHaveBeenCalled();
    });

    it('无连接时不应报错', () => {
      expect(() => broadcast('empty', {})).not.toThrow();
    });

    it('payload 应包含正确的 JSON 结构', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket({ readyState: 1 });
      app._simulateConnection(socket);
      socket.send.mockClear();

      const testData = { nested: { key: 'value' }, arr: [1, 2, 3] };
      broadcast('complex', testData);

      const payload = JSON.parse(socket.send.mock.calls[0][0]);
      expect(payload).toMatchObject({
        type: 'complex',
        data: testData,
      });
      expect(payload.ts).toBeDefined();
    });
  });

  // ── getConnectionCount ──

  describe('getConnectionCount', () => {
    it('初始应为 0', () => {
      expect(getConnectionCount()).toBe(0);
    });

    it('应反映实际连接数', () => {
      const app = createMockApp();
      registerWs(app as any);

      const s1 = createMockSocket();
      const s2 = createMockSocket();
      app._simulateConnection(s1);
      expect(getConnectionCount()).toBeGreaterThanOrEqual(1);

      app._simulateConnection(s2);
      const count = getConnectionCount();

      s1._emit('close');
      expect(getConnectionCount()).toBe(count - 1);
    });
  });

  // ── message 消息处理 ──

  describe('message 消息处理', () => {
    it('subscribe 带 topic 应添加订阅并回复 subscribed', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);
      socket.send.mockClear();

      const msg = JSON.stringify({ action: 'subscribe', topic: '股市' });
      socket._emit('message', Buffer.from(msg));

      expect(socket.send).toHaveBeenCalledOnce();
      const reply = JSON.parse(socket.send.mock.calls[0][0]);
      expect(reply.type).toBe('subscribed');
      expect(reply.topic).toBe('股市');
      expect(reply.message).toContain('股市');
    });

    it('subscribe 不带 topic 应订阅全部（clear signalTopics）', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);
      socket.send.mockClear();

      // 先订阅一个 topic
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: '科技' })));
      socket.send.mockClear();

      // 然后订阅全部（不带 topic）
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe' })));

      expect(socket.send).toHaveBeenCalledOnce();
      const reply = JSON.parse(socket.send.mock.calls[0][0]);
      expect(reply.type).toBe('subscribed');
      expect(reply.topic).toBe('*');
    });

    it('unsubscribe 带 topic 应移除订阅并回复 unsubscribed', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);
      socket.send.mockClear();

      // 先订阅
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: '政治' })));
      socket.send.mockClear();

      // 取消订阅
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'unsubscribe', topic: '政治' })));

      expect(socket.send).toHaveBeenCalledOnce();
      const reply = JSON.parse(socket.send.mock.calls[0][0]);
      expect(reply.type).toBe('unsubscribed');
      expect(reply.topic).toBe('政治');
    });

    it('unsubscribe 不带 topic 应清除所有订阅', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);
      socket.send.mockClear();

      // 先订阅两个 topic
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: 'A' })));
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: 'B' })));
      socket.send.mockClear();

      // 清空订阅（不带 topic）
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'unsubscribe' })));

      const reply = JSON.parse(socket.send.mock.calls[0][0]);
      expect(reply.type).toBe('unsubscribed');
      expect(reply.topic).toBe('*');
    });

    it('无效 JSON 消息应被忽略（不崩溃）', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);
      socket.send.mockClear();

      // 触发无效 JSON
      expect(() => socket._emit('message', Buffer.from('not json at all'))).not.toThrow();
      // 不应发送任何消息
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('客户端从 map 中删除后 pong 不应报错', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket();
      app._simulateConnection(socket);

      // 手动删除客户端（模拟 close 发生后还有 pong）
      socket._emit('close');

      // pong 事件应该无副作用（meta = undefined）
      expect(() => socket._emit('pong')).not.toThrow();
    });
  });

  // ── broadcastSignal ──

  describe('broadcastSignal', () => {
    it('订阅了 topic 的客户端应收到 signal 推送', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket({ readyState: 1 });
      app._simulateConnection(socket);
      socket.send.mockClear();

      // 订阅 '股市' topic
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: '股市' })));
      socket.send.mockClear();

      broadcastSignal('股市', { price: 3000 });

      expect(socket.send).toHaveBeenCalledOnce();
      const payload = JSON.parse(socket.send.mock.calls[0][0]);
      expect(payload.type).toBe('signal');
      expect(payload.topic).toBe('股市');
      expect(payload.data).toEqual({ price: 3000 });
    });

    it('未订阅该 topic 的客户端不应收到推送', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket({ readyState: 1 });
      app._simulateConnection(socket);
      socket.send.mockClear();

      // 订阅 '科技' topic
      socket._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: '科技' })));
      socket.send.mockClear();

      // 向 '股市' 推送
      broadcastSignal('股市', { price: 3000 });

      // '科技' 订阅者不应收到 '股市' 推送
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('signalTopics 为空的客户端（订阅全部）应收到所有推送', () => {
      const app = createMockApp();
      registerWs(app as any);

      const socket = createMockSocket({ readyState: 1 });
      app._simulateConnection(socket);
      socket.send.mockClear();

      // 不订阅任何 topic（empty set = 订阅全部）
      broadcastSignal('任意主题', { data: 'x' });

      expect(socket.send).toHaveBeenCalledOnce();
      const payload = JSON.parse(socket.send.mock.calls[0][0]);
      expect(payload.type).toBe('signal');
    });

    it('非 OPEN 状态的客户端不应收到 signal 推送', () => {
      const app = createMockApp();
      registerWs(app as any);

      const closedSocket = createMockSocket({ readyState: 3 }); // CLOSED
      app._simulateConnection(closedSocket);
      closedSocket.send.mockClear();

      broadcastSignal('topic', { data: 1 });
      expect(closedSocket.send).not.toHaveBeenCalled();
    });

    it('send 抛异常应移除客户端并继续', () => {
      const app = createMockApp();
      registerWs(app as any);

      const badSocket = createMockSocket({
        readyState: 1,
        send: vi.fn().mockImplementationOnce(() => { /* connected */ })
                    .mockImplementationOnce(() => { throw new Error('Send failed'); }),
      });
      const goodSocket = createMockSocket({ readyState: 1 });
      app._simulateConnection(badSocket);
      app._simulateConnection(goodSocket);

      goodSocket.send.mockClear();

      expect(() => broadcastSignal('topic', {})).not.toThrow();
      expect(goodSocket.send).toHaveBeenCalledOnce();
      expect(console.warn).toHaveBeenCalled();
    });

    it('无连接时不应报错', () => {
      expect(() => broadcastSignal('topic', {})).not.toThrow();
    });

    it('多个客户端订阅不同 topic 应各自接收', () => {
      const app = createMockApp();
      registerWs(app as any);

      const s1 = createMockSocket({ readyState: 1 });
      const s2 = createMockSocket({ readyState: 1 });
      app._simulateConnection(s1);
      app._simulateConnection(s2);

      // s1 订阅 '股市'，s2 订阅 '科技'
      s1._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: '股市' })));
      s2._emit('message', Buffer.from(JSON.stringify({ action: 'subscribe', topic: '科技' })));
      s1.send.mockClear();
      s2.send.mockClear();

      broadcastSignal('股市', { x: 1 });

      expect(s1.send).toHaveBeenCalledOnce();
      expect(s2.send).not.toHaveBeenCalled();

      s1.send.mockClear();
      broadcastSignal('科技', { y: 2 });

      expect(s1.send).not.toHaveBeenCalled();
      expect(s2.send).toHaveBeenCalledOnce();
    });
  });
});
