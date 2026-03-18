// ============================================================================
// NATSTransportLayer 单元测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NATSTransportLayer } from './NATSTransportLayer.js';
import type { CoordinatorMessage, WorkerMessage } from './types.js';

// ── Mock nats ──────────────────────────────────────────────────────────

/** 模拟 NATS Subscription，通过 push/close 控制消息流 */
function createMockSubscription() {
  let resolve: ((value: IteratorResult<{ data: Uint8Array }>) => void) | null = null;
  const messageQueue: { data: Uint8Array }[] = [];
  let closed = false;

  const sub = {
    unsubscribe: vi.fn().mockImplementation(() => {
      closed = true;
      // 释放正在等待的迭代器
      if (resolve) {
        resolve({ value: undefined, done: true });
        resolve = null;
      }
    }),
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<{ data: Uint8Array }>> {
          if (closed) {
            return Promise.resolve({ value: undefined, done: true } as IteratorResult<{ data: Uint8Array }>);
          }
          const queued = messageQueue.shift();
          if (queued) {
            return Promise.resolve({ value: queued, done: false });
          }
          return new Promise<IteratorResult<{ data: Uint8Array }>>(r => {
            resolve = r;
          });
        },
      };
    },
    // 测试辅助：推送消息
    __push(data: Uint8Array) {
      if (closed) return;
      if (resolve) {
        resolve({ value: { data }, done: false });
        resolve = null;
      } else {
        messageQueue.push({ data });
      }
    },
  };

  return sub;
}

/** 模拟 NATS 连接 */
function createMockNatsConnection() {
  const subscriptions = new Map<string, ReturnType<typeof createMockSubscription>>();

  const nc = {
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation((subject: string) => {
      const sub = createMockSubscription();
      subscriptions.set(subject, sub);
      return sub;
    }),
    drain: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    // 辅助方法：获取特定 subject 的订阅
    __getSubscription: (subject: string) => subscriptions.get(subject),
    __subscriptions: subscriptions,
  };

  return nc;
}

// Mock nats 模块
let mockNc: ReturnType<typeof createMockNatsConnection>;

vi.mock('nats', () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return {
    connect: vi.fn().mockImplementation(async () => mockNc),
    StringCodec: () => ({
      encode: (s: string) => encoder.encode(s),
      decode: (d: Uint8Array) => decoder.decode(d),
    }),
  };
});

// ── 测试辅助 ──────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function createTestCoordinatorMessage(overrides: Partial<CoordinatorMessage> = {}): CoordinatorMessage {
  return {
    type: 'tick_begin',
    tick: 1,
    events: [],
    timestamp: Date.now(),
    ...overrides,
  } as CoordinatorMessage;
}

function createTestWorkerMessage(overrides: Partial<WorkerMessage> = {}): WorkerMessage {
  return {
    type: 'worker_ready',
    workerId: 'w1',
    ...overrides,
  } as WorkerMessage;
}

// ── 测试套件 ──────────────────────────────────────────────────────────

describe('NATSTransportLayer', () => {
  let transport: NATSTransportLayer;

  beforeEach(() => {
    mockNc = createMockNatsConnection();
    transport = new NATSTransportLayer({ servers: 'nats://127.0.0.1:4222' });
  });

  afterEach(async () => {
    try { await transport.disconnect(); } catch { /* ignore */ }
    vi.clearAllMocks();
  });

  // ── 连接生命周期 ──

  describe('连接管理', () => {
    it('connect() 应建立 NATS 连接', async () => {
      const { connect: mockConnect } = await import('nats');
      await transport.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
        servers: 'nats://127.0.0.1:4222',
      }));
    });

    it('connect() 重复调用应幂等', async () => {
      const { connect: mockConnect } = await import('nats');
      await transport.connect();
      await transport.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('disconnect() 应排空并关闭连接', async () => {
      await transport.connect();
      await transport.disconnect();

      expect(mockNc.drain).toHaveBeenCalledTimes(1);
    });

    it('disconnect() 未连接时应安全无操作', async () => {
      await transport.disconnect(); // 不应抛错
      expect(mockNc.drain).not.toHaveBeenCalled();
    });

    it('disconnect() 后应清理所有订阅', async () => {
      await transport.connect();
      transport.onLeaderMessage(() => {});

      const leaderSub = mockNc.__getSubscription('beeclaw.leader');
      await transport.disconnect();

      expect(leaderSub!.unsubscribe).toHaveBeenCalled();
    });
  });

  // ── 消息发送 ──

  describe('消息发送', () => {
    it('sendToWorker 应发布到 worker 专属 subject', async () => {
      await transport.connect();
      const msg = createTestCoordinatorMessage();

      await transport.sendToWorker('w1', msg);

      expect(mockNc.publish).toHaveBeenCalledWith(
        'beeclaw.worker.w1',
        encoder.encode(JSON.stringify(msg)),
      );
    });

    it('broadcastToWorkers 应发布到广播 subject', async () => {
      await transport.connect();
      const msg = createTestCoordinatorMessage();

      await transport.broadcastToWorkers(msg);

      expect(mockNc.publish).toHaveBeenCalledWith(
        'beeclaw.broadcast',
        encoder.encode(JSON.stringify(msg)),
      );
    });

    it('sendToLeader 应发布到 leader subject', async () => {
      await transport.connect();
      const msg = createTestWorkerMessage();

      await transport.sendToLeader(msg);

      expect(mockNc.publish).toHaveBeenCalledWith(
        'beeclaw.leader',
        encoder.encode(JSON.stringify(msg)),
      );
    });

    it('未连接时发送应抛出错误', async () => {
      await expect(transport.sendToWorker('w1', createTestCoordinatorMessage()))
        .rejects.toThrow('[NATSTransport] Not connected');
    });

    it('未连接时 broadcastToWorkers 应抛出错误', async () => {
      await expect(transport.broadcastToWorkers(createTestCoordinatorMessage()))
        .rejects.toThrow('[NATSTransport] Not connected');
    });

    it('未连接时 sendToLeader 应抛出错误', async () => {
      await expect(transport.sendToLeader(createTestWorkerMessage()))
        .rejects.toThrow('[NATSTransport] Not connected');
    });
  });

  // ── 消息接收 ──

  describe('消息接收', () => {
    it('onWorkerMessage 应订阅 worker subject 和 broadcast subject', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});

      expect(mockNc.subscribe).toHaveBeenCalledWith('beeclaw.worker.w1');
      expect(mockNc.subscribe).toHaveBeenCalledWith('beeclaw.broadcast');
    });

    it('onLeaderMessage 应订阅 leader subject', async () => {
      await transport.connect();
      transport.onLeaderMessage(() => {});

      expect(mockNc.subscribe).toHaveBeenCalledWith('beeclaw.leader');
    });

    it('收到 worker subject 消息时应调用对应 handler', async () => {
      await transport.connect();
      const handler = vi.fn();
      transport.onWorkerMessage('w1', handler);

      const msg = createTestCoordinatorMessage();
      const sub = mockNc.__getSubscription('beeclaw.worker.w1')!;
      sub.__push(encoder.encode(JSON.stringify(msg)));

      // 等待异步迭代器处理
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('收到 leader subject 消息时应调用 leader handler', async () => {
      await transport.connect();
      const handler = vi.fn();
      transport.onLeaderMessage(handler);

      const msg = createTestWorkerMessage();
      const sub = mockNc.__getSubscription('beeclaw.leader')!;
      sub.__push(encoder.encode(JSON.stringify(msg)));

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('收到 broadcast 消息时应分发到所有 worker handler', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w2', handler2);

      const msg = createTestCoordinatorMessage();
      const sub = mockNc.__getSubscription('beeclaw.broadcast')!;
      sub.__push(encoder.encode(JSON.stringify(msg)));

      await vi.waitFor(() => {
        expect(handler1).toHaveBeenCalledWith(msg);
        expect(handler2).toHaveBeenCalledWith(msg);
      });
    });

    it('收到无效 JSON 消息时不应抛出异常', async () => {
      await transport.connect();
      const handler = vi.fn();
      transport.onLeaderMessage(handler);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const sub = mockNc.__getSubscription('beeclaw.leader')!;
      sub.__push(encoder.encode('invalid-json{{{'));

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to process leader message'),
          expect.any(Error),
        );
      });

      expect(handler).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ── Worker 注册 ──

  describe('Worker 注册/注销', () => {
    it('registerWorker 应添加到注册集合', async () => {
      await transport.connect();
      transport.registerWorker('w1');

      expect(transport.getRegisteredWorkerIds()).toContain('w1');
    });

    it('registerWorker 重复注册应幂等', async () => {
      await transport.connect();
      transport.registerWorker('w1');
      transport.registerWorker('w1');

      expect(transport.getRegisteredWorkerIds()).toHaveLength(1);
    });

    it('registerWorker 未连接时应抛出错误', () => {
      expect(() => transport.registerWorker('w1'))
        .toThrow('[NATSTransport] Not connected');
    });

    it('unregisterWorker 应从注册集合移除', async () => {
      await transport.connect();
      transport.registerWorker('w1');

      transport.unregisterWorker('w1');

      expect(transport.getRegisteredWorkerIds()).not.toContain('w1');
    });

    it('unregisterWorker 应取消 worker subject 订阅', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});

      const sub = mockNc.__getSubscription('beeclaw.worker.w1')!;
      transport.unregisterWorker('w1');

      expect(sub.unsubscribe).toHaveBeenCalled();
    });

    it('unregisterWorker 对未注册的 worker 应安全无操作', async () => {
      await transport.connect();

      expect(() => transport.unregisterWorker('nonexistent')).not.toThrow();
    });

    it('getRegisteredWorkerIds 无注册时返回空数组', () => {
      expect(transport.getRegisteredWorkerIds()).toEqual([]);
    });

    it('getRegisteredWorkerIds 应返回所有已注册 worker', async () => {
      await transport.connect();
      transport.registerWorker('w1');
      transport.registerWorker('w2');

      const ids = transport.getRegisteredWorkerIds();
      expect(ids).toContain('w1');
      expect(ids).toContain('w2');
      expect(ids).toHaveLength(2);
    });
  });

  // ── 自定义配置 ──

  describe('自定义配置', () => {
    it('应支持自定义 subject 前缀', async () => {
      const customTransport = new NATSTransportLayer({ prefix: 'myapp' });
      await customTransport.connect();

      const msg = createTestCoordinatorMessage();
      await customTransport.sendToWorker('w1', msg);

      expect(mockNc.publish).toHaveBeenCalledWith(
        'myapp.worker.w1',
        encoder.encode(JSON.stringify(msg)),
      );

      await customTransport.disconnect();
    });

    it('应支持自定义认证参数', async () => {
      const { connect: mockConnect } = await import('nats');

      const customTransport = new NATSTransportLayer({
        servers: ['nats://host1:4222', 'nats://host2:4222'],
        token: 'my-token',
      });
      await customTransport.connect();

      expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
        servers: ['nats://host1:4222', 'nats://host2:4222'],
        token: 'my-token',
      }));

      await customTransport.disconnect();
    });

    it('应支持用户名密码认证', async () => {
      const { connect: mockConnect } = await import('nats');

      const customTransport = new NATSTransportLayer({
        user: 'admin',
        pass: 'secret',
      });
      await customTransport.connect();

      expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
        user: 'admin',
        pass: 'secret',
      }));

      await customTransport.disconnect();
    });

    it('不传任何配置时应使用默认值', async () => {
      const { connect: mockConnect } = await import('nats');

      const defaultTransport = new NATSTransportLayer();
      await defaultTransport.connect();

      expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
        servers: 'nats://127.0.0.1:4222',
      }));

      const msg = createTestCoordinatorMessage();
      await defaultTransport.sendToWorker('w1', msg);

      expect(mockNc.publish).toHaveBeenCalledWith(
        'beeclaw.worker.w1',
        expect.any(Uint8Array),
      );

      await defaultTransport.disconnect();
    });
  });

  // ── 订阅幂等性 ──

  describe('订阅幂等性', () => {
    it('已订阅的 subject 再次注册不应重复订阅', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});

      const callCountAfterFirst = mockNc.subscribe.mock.calls.length;

      // 注册另一个 worker — broadcast subject 已订阅，应幂等跳过
      transport.onWorkerMessage('w2', () => {});
      const callCountAfterSecond = mockNc.subscribe.mock.calls.length;

      // 只多了 w2 的专属 subject
      expect(callCountAfterSecond).toBe(callCountAfterFirst + 1);

      // broadcast 应只被订阅一次
      const broadcastCalls = mockNc.subscribe.mock.calls.filter(
        (args: unknown[]) => args[0] === 'beeclaw.broadcast',
      );
      expect(broadcastCalls).toHaveLength(1);
    });

    it('未连接时注册 onWorkerMessage 不应创建订阅', () => {
      transport.onWorkerMessage('w1', () => {});

      expect(mockNc.subscribe).not.toHaveBeenCalled();
    });

    it('未连接时注册 onLeaderMessage 不应创建订阅', () => {
      transport.onLeaderMessage(() => {});

      expect(mockNc.subscribe).not.toHaveBeenCalled();
    });
  });

  // ── 边界情况 ──

  describe('边界情况', () => {
    it('disconnect 后 connected 标志应为 false', async () => {
      await transport.connect();
      await transport.disconnect();

      await expect(transport.sendToWorker('w1', createTestCoordinatorMessage()))
        .rejects.toThrow('[NATSTransport] Not connected');
    });

    it('disconnect 清理后 getRegisteredWorkerIds 应返回空数组', async () => {
      await transport.connect();
      transport.registerWorker('w1');
      transport.registerWorker('w2');

      await transport.disconnect();

      expect(transport.getRegisteredWorkerIds()).toEqual([]);
    });

    it('onWorkerMessage 替换已有 handler', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w1', handler2);

      const msg = createTestCoordinatorMessage();
      const sub = mockNc.__getSubscription('beeclaw.worker.w1')!;
      sub.__push(encoder.encode(JSON.stringify(msg)));

      await vi.waitFor(() => {
        expect(handler2).toHaveBeenCalledTimes(1);
      });
      // 新 handler 被调用，旧 handler 不被调用
      expect(handler1).not.toHaveBeenCalled();
    });

    it('onLeaderMessage 替换已有 handler', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onLeaderMessage(handler1);
      transport.onLeaderMessage(handler2);

      const msg = createTestWorkerMessage();
      const sub = mockNc.__getSubscription('beeclaw.leader')!;
      sub.__push(encoder.encode(JSON.stringify(msg)));

      await vi.waitFor(() => {
        expect(handler2).toHaveBeenCalledTimes(1);
      });
      expect(handler1).not.toHaveBeenCalled();
    });

    it('多个 Worker handler 的独立消息分发', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w2', handler2);

      const msg = createTestCoordinatorMessage();
      const sub = mockNc.__getSubscription('beeclaw.worker.w1')!;
      sub.__push(encoder.encode(JSON.stringify(msg)));

      await vi.waitFor(() => {
        expect(handler1).toHaveBeenCalledTimes(1);
      });
      // w2 handler 不应被 w1 的消息触发
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
