// ============================================================================
// RedisTransportLayer 单元测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisTransportLayer } from './RedisTransportLayer.js';
import type { CoordinatorMessage, WorkerMessage } from './types.js';

// ── Mock ioredis ──────────────────────────────────────────────────────

/** 模拟 Redis 实例，跟踪所有调用并模拟 Pub/Sub 行为 */
function createMockRedis() {
  const eventHandlers = new Map<string, ((...args: any[]) => void)[]>();

  const instance = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    on: vi.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return instance;
    }),
    // 辅助方法：触发事件（测试用）
    __emit: (event: string, ...args: any[]) => {
      const handlers = eventHandlers.get(event) || [];
      for (const handler of handlers) {
        handler(...args);
      }
    },
  };

  return instance;
}

// 保存 mock 实例以便测试中访问
let mockPublisher: ReturnType<typeof createMockRedis>;
let mockSubscriber: ReturnType<typeof createMockRedis>;
let mockInstanceIndex: number;

vi.mock('ioredis', () => {
  // 使用 function 声明确保可被 new 调用
  function MockRedis() {
    const instance = mockInstanceIndex === 0 ? mockPublisher : mockSubscriber;
    mockInstanceIndex++;
    return instance;
  }
  return {
    Redis: MockRedis,
    default: MockRedis,
  };
});

// ── 测试辅助 ──────────────────────────────────────────────────────────

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

describe('RedisTransportLayer', () => {
  let transport: RedisTransportLayer;

  beforeEach(() => {
    mockPublisher = createMockRedis();
    mockSubscriber = createMockRedis();
    mockInstanceIndex = 0;
    transport = new RedisTransportLayer({ host: '127.0.0.1', port: 6379 });
  });

  afterEach(async () => {
    // 确保断开连接
    try { await transport.disconnect(); } catch { /* ignore */ }
    vi.clearAllMocks();
  });

  // ── 连接生命周期 ──

  describe('连接管理', () => {
    it('connect() 应建立 publisher 和 subscriber 两个连接', async () => {
      await transport.connect();

      expect(mockPublisher.connect).toHaveBeenCalledTimes(1);
      expect(mockSubscriber.connect).toHaveBeenCalledTimes(1);
    });

    it('connect() 重复调用应幂等', async () => {
      await transport.connect();
      await transport.connect();

      expect(mockPublisher.connect).toHaveBeenCalledTimes(1);
    });

    it('disconnect() 应关闭两个连接', async () => {
      await transport.connect();
      await transport.disconnect();

      expect(mockPublisher.quit).toHaveBeenCalledTimes(1);
      expect(mockSubscriber.quit).toHaveBeenCalledTimes(1);
    });

    it('disconnect() 未连接时应安全无操作', async () => {
      await transport.disconnect(); // 不应抛错

      expect(mockPublisher.quit).not.toHaveBeenCalled();
    });

    it('disconnect() 后 subscriber 应取消所有订阅', async () => {
      await transport.connect();

      // 先注册 handler 触发订阅
      transport.onLeaderMessage(() => {});
      await transport.disconnect();

      expect(mockSubscriber.unsubscribe).toHaveBeenCalled();
    });
  });

  // ── 消息发送 ──

  describe('消息发送', () => {
    it('sendToWorker 应发布到 worker 专属 channel', async () => {
      await transport.connect();
      const msg = createTestCoordinatorMessage();

      await transport.sendToWorker('w1', msg);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'beeclaw:worker:w1',
        JSON.stringify(msg),
      );
    });

    it('broadcastToWorkers 应发布到广播 channel', async () => {
      await transport.connect();
      const msg = createTestCoordinatorMessage();

      await transport.broadcastToWorkers(msg);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'beeclaw:broadcast',
        JSON.stringify(msg),
      );
    });

    it('sendToLeader 应发布到 leader channel', async () => {
      await transport.connect();
      const msg = createTestWorkerMessage();

      await transport.sendToLeader(msg);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'beeclaw:leader',
        JSON.stringify(msg),
      );
    });

    it('未连接时发送应抛出错误', async () => {
      await expect(transport.sendToWorker('w1', createTestCoordinatorMessage()))
        .rejects.toThrow('[RedisTransport] Not connected');
    });
  });

  // ── 消息接收 ──

  describe('消息接收', () => {
    it('onWorkerMessage 应订阅 worker channel 和 broadcast channel', async () => {
      await transport.connect();

      transport.onWorkerMessage('w1', () => {});

      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('beeclaw:worker:w1');
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('beeclaw:broadcast');
    });

    it('onLeaderMessage 应订阅 leader channel', async () => {
      await transport.connect();

      transport.onLeaderMessage(() => {});

      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('beeclaw:leader');
    });

    it('收到 worker channel 消息时应调用对应 handler', async () => {
      await transport.connect();
      const handler = vi.fn();
      transport.onWorkerMessage('w1', handler);

      const msg = createTestCoordinatorMessage();
      mockSubscriber.__emit('message', 'beeclaw:worker:w1', JSON.stringify(msg));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('收到 leader channel 消息时应调用 leader handler', async () => {
      await transport.connect();
      const handler = vi.fn();
      transport.onLeaderMessage(handler);

      const msg = createTestWorkerMessage();
      mockSubscriber.__emit('message', 'beeclaw:leader', JSON.stringify(msg));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('收到 broadcast channel 消息时应分发到所有 worker handler', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w2', handler2);

      const msg = createTestCoordinatorMessage();
      mockSubscriber.__emit('message', 'beeclaw:broadcast', JSON.stringify(msg));

      expect(handler1).toHaveBeenCalledWith(msg);
      expect(handler2).toHaveBeenCalledWith(msg);
    });

    it('收到无效 JSON 消息时不应抛出异常', async () => {
      await transport.connect();
      const handler = vi.fn();
      transport.onLeaderMessage(handler);

      // 模拟无效 JSON 消息
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSubscriber.__emit('message', 'beeclaw:leader', 'invalid-json{{{');

      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ── Worker 注册 ──

  describe('Worker 注册/注销', () => {
    it('registerWorker 应添加到 Redis Set', async () => {
      await transport.connect();

      transport.registerWorker('w1');

      expect(mockPublisher.sadd).toHaveBeenCalledWith('beeclaw:workers', 'w1');
    });

    it('unregisterWorker 应从 Redis Set 移除', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {}); // 先注册 handler

      transport.unregisterWorker('w1');

      expect(mockPublisher.srem).toHaveBeenCalledWith('beeclaw:workers', 'w1');
    });

    it('unregisterWorker 应取消 worker channel 订阅', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});

      transport.unregisterWorker('w1');

      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('beeclaw:worker:w1');
    });

    it('getRegisteredWorkerIds 应返回本地已注册的 handler keys', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});
      transport.onWorkerMessage('w2', () => {});

      const ids = transport.getRegisteredWorkerIds();

      expect(ids).toContain('w1');
      expect(ids).toContain('w2');
      expect(ids).toHaveLength(2);
    });

    it('getRegisteredWorkerIdsAsync 应查询 Redis Set', async () => {
      await transport.connect();
      mockPublisher.smembers.mockResolvedValue(['w1', 'w2', 'w3']);

      const ids = await transport.getRegisteredWorkerIdsAsync();

      expect(mockPublisher.smembers).toHaveBeenCalledWith('beeclaw:workers');
      expect(ids).toEqual(['w1', 'w2', 'w3']);
    });
  });

  // ── 自定义前缀 ──

  describe('自定义配置', () => {
    it('应支持自定义 channel 前缀', async () => {
      const customTransport = new RedisTransportLayer({ prefix: 'myapp' });
      // 重置 mock 实例索引
      mockInstanceIndex = 0;
      await customTransport.connect();

      const msg = createTestCoordinatorMessage();
      await customTransport.sendToWorker('w1', msg);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'myapp:worker:w1',
        JSON.stringify(msg),
      );

      await customTransport.disconnect();
    });
  });

  // ── 边界情况 ──

  describe('边界情况', () => {
    it('未注册 handler 的 worker channel 消息应被忽略', async () => {
      await transport.connect();

      // 没有注册 w999 的 handler，不应抛错
      mockSubscriber.__emit('message', 'beeclaw:worker:w999', JSON.stringify(createTestCoordinatorMessage()));

      // 无异常发生即为通过
    });

    it('未注册 leader handler 时 leader 消息应被忽略', async () => {
      await transport.connect();

      // 没有注册 leader handler，不应抛错
      mockSubscriber.__emit('message', 'beeclaw:leader', JSON.stringify(createTestWorkerMessage()));

      // 无异常发生即为通过
    });

    it('disconnect 后清理所有 handler', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});
      transport.onLeaderMessage(() => {});

      await transport.disconnect();

      expect(transport.getRegisteredWorkerIds()).toEqual([]);
    });
  });
});
