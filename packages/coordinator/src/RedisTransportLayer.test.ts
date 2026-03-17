// ============================================================================
// RedisTransportLayer 单元测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisTransportLayer } from './RedisTransportLayer.js';
import type { CoordinatorMessage, WorkerMessage } from './types.js';

// ── Mock ioredis ──────────────────────────────────────────────────────

/** 模拟 Redis 实例，跟踪所有调用并模拟 Pub/Sub 行为 */
function createMockRedis() {
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

  const instance = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return instance;
    }),
    // 辅助方法：触发事件（测试用）
    __emit: (event: string, ...args: unknown[]) => {
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

  // ── 补充覆盖：未连接分支 & 幂等性 & 错误路径 ──

  describe('unregisterWorker 未连接时的分支', () => {
    it('未连接时调用 unregisterWorker 应安全跳过 srem', () => {
      // transport 尚未 connect，直接调用 unregisterWorker 不应抛错
      transport.unregisterWorker('w1');

      // srem 不应被调用，因为 connected === false
      expect(mockPublisher.srem).not.toHaveBeenCalled();
    });

    it('disconnect 后调用 unregisterWorker 应安全跳过 srem', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});
      await transport.disconnect();

      // disconnect 之后再 unregister
      transport.unregisterWorker('w1');

      // disconnect 期间的 srem 可能被调用，但 disconnect 后再次调用不应触发额外 srem
      // publisher 已为 null，所以 srem 不应再被调用
    });
  });

  describe('subscribeChannel 幂等性', () => {
    it('已订阅的 channel 再次订阅应直接返回，不重复调用 subscribe', async () => {
      await transport.connect();

      // 第一次注册 worker —— 会订阅 worker channel + broadcast channel
      transport.onWorkerMessage('w1', () => {});
      const callCountAfterFirst = mockSubscriber.subscribe.mock.calls.length;

      // 第二次注册另一个 worker —— broadcast channel 已订阅，应幂等跳过
      transport.onWorkerMessage('w2', () => {});

      // broadcast channel 不应被重复订阅，只多了 w2 专属 channel
      const callCountAfterSecond = mockSubscriber.subscribe.mock.calls.length;
      expect(callCountAfterSecond).toBe(callCountAfterFirst + 1);

      // 验证 broadcast 只被调用了一次
      const broadcastCalls = mockSubscriber.subscribe.mock.calls.filter(
        (args: unknown[]) => args[0] === 'beeclaw:broadcast',
      );
      expect(broadcastCalls).toHaveLength(1);
    });
  });

  describe('subscribeChannel 未连接时的分支', () => {
    it('未连接时注册 onWorkerMessage 不应调用 subscriber.subscribe', () => {
      // transport 尚未 connect，注册 handler 不应触发 subscribe
      transport.onWorkerMessage('w1', () => {});

      expect(mockSubscriber.subscribe).not.toHaveBeenCalled();
    });

    it('未连接时注册 onLeaderMessage 不应调用 subscriber.subscribe', () => {
      transport.onLeaderMessage(() => {});

      expect(mockSubscriber.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribeChannel 未订阅的 channel', () => {
    it('unregisterWorker 对未订阅的 worker 应安全返回', async () => {
      await transport.connect();

      // 没有先调用 onWorkerMessage，直接 unregister 不应抛错
      transport.unregisterWorker('w-nonexistent');

      // unsubscribe 不应被调用，因为 channel 未在 subscribedChannels 中
      expect(mockSubscriber.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('registerWorker 未连接时应抛出错误', () => {
    it('未连接时调用 registerWorker 应抛出 Not connected', () => {
      expect(() => transport.registerWorker('w1')).toThrow('[RedisTransport] Not connected');
    });
  });

  describe('getRegisteredWorkerIdsAsync 未连接时应抛出错误', () => {
    it('未连接时调用 getRegisteredWorkerIdsAsync 应抛出 Not connected', async () => {
      await expect(transport.getRegisteredWorkerIdsAsync())
        .rejects.toThrow('[RedisTransport] Not connected');
    });
  });

  describe('subscribeChannel subscribe 失败时应从集合中移除', () => {
    it('subscribe 返回 rejected promise 时应从 subscribedChannels 中移除该 channel', async () => {
      await transport.connect();

      // 让 subscribe 拒绝
      mockSubscriber.subscribe.mockRejectedValueOnce(new Error('subscribe failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      transport.onLeaderMessage(() => {});

      // 等待 rejected promise 被处理
      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to subscribe'),
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();

      // 再次尝试订阅相同 channel 应该可以重新触发 subscribe（因为之前已从集合中移除）
      mockSubscriber.subscribe.mockResolvedValueOnce(undefined);
      transport.onLeaderMessage(() => {});

      // 如果 channel 仍在 subscribedChannels 中，第二次订阅会被幂等跳过，
      // subscribe 不会被再次调用；如果已移除，则会再次调用
      const leaderChannelCalls = mockSubscriber.subscribe.mock.calls.filter(
        (args: unknown[]) => args[0] === 'beeclaw:leader',
      );
      expect(leaderChannelCalls.length).toBe(2);
    });
  });

  describe('disconnect 无订阅时的分支', () => {
    it('连接但没有订阅任何 channel 就 disconnect 不应调用 unsubscribe', async () => {
      await transport.connect();

      // 直接 disconnect，没有注册任何 handler / 订阅任何 channel
      await transport.disconnect();

      // unsubscribe 不应被调用，因为 subscribedChannels 为空
      expect(mockSubscriber.unsubscribe).not.toHaveBeenCalled();
      // 但 quit 应正常调用
      expect(mockPublisher.quit).toHaveBeenCalledTimes(1);
      expect(mockSubscriber.quit).toHaveBeenCalledTimes(1);
    });
  });

  describe('自定义配置（完整参数）', () => {
    it('应支持自定义 password 和 db 参数', () => {
      // 验证构造函数能接受完整配置，不抛错
      const customTransport = new RedisTransportLayer({
        host: '10.0.0.1',
        port: 6380,
        password: 'my-secret',
        db: 3,
        prefix: 'custom-app',
      });

      // 实例应成功创建
      expect(customTransport).toBeInstanceOf(RedisTransportLayer);
    });

    it('完整自定义配置下发送消息应使用自定义前缀', async () => {
      mockInstanceIndex = 0;
      const customTransport = new RedisTransportLayer({
        host: '10.0.0.1',
        port: 6380,
        password: 'my-secret',
        db: 3,
        prefix: 'custom-app',
      });
      await customTransport.connect();

      const msg = createTestWorkerMessage();
      await customTransport.sendToLeader(msg);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'custom-app:leader',
        JSON.stringify(msg),
      );

      await customTransport.disconnect();
    });
  });

  describe('broadcastToWorkers 未连接时应抛出错误', () => {
    it('未连接时调用 broadcastToWorkers 应抛出 Not connected', async () => {
      await expect(transport.broadcastToWorkers(createTestCoordinatorMessage()))
        .rejects.toThrow('[RedisTransport] Not connected');
    });
  });

  describe('sendToLeader 未连接时应抛出错误', () => {
    it('未连接时调用 sendToLeader 应抛出 Not connected', async () => {
      await expect(transport.sendToLeader(createTestWorkerMessage()))
        .rejects.toThrow('[RedisTransport] Not connected');
    });
  });

  // ── 补充覆盖：错误处理路径、断后恢复、边界条件 ──

  describe('registerWorker sadd 失败时的错误处理', () => {
    it('sadd 返回 rejected promise 时应 console.error 但不抛出', async () => {
      await transport.connect();
      mockPublisher.sadd.mockRejectedValueOnce(new Error('Redis SADD failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // registerWorker 是同步调用，内部 sadd 是 fire-and-forget
      transport.registerWorker('w-fail');

      // 等待异步错误被处理
      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to register worker w-fail'),
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('unregisterWorker srem 失败时的错误处理', () => {
    it('srem 返回 rejected promise 时应 console.error 但不抛出', async () => {
      await transport.connect();
      transport.onWorkerMessage('w-fail', () => {});
      mockPublisher.srem.mockRejectedValueOnce(new Error('Redis SREM failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      transport.unregisterWorker('w-fail');

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to unregister worker w-fail'),
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('unsubscribeChannel 失败时的错误处理', () => {
    it('unsubscribe 返回 rejected promise 时应 console.error 但不抛出', async () => {
      await transport.connect();
      transport.onWorkerMessage('w1', () => {});

      mockSubscriber.unsubscribe.mockRejectedValueOnce(new Error('Redis UNSUB failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      transport.unregisterWorker('w1');

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to unsubscribe from'),
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('handleIncomingMessage 对不匹配任何路由的 channel', () => {
    it('收到未知 channel 消息时应静默忽略', async () => {
      await transport.connect();

      // 发到一个完全不匹配任何路由的 channel
      expect(() => {
        mockSubscriber.__emit(
          'message',
          'some:unknown:channel',
          JSON.stringify(createTestCoordinatorMessage()),
        );
      }).not.toThrow();
    });
  });

  describe('多个 Worker handler 的独立消息分发', () => {
    it('worker 专属 channel 消息只发给对应 handler，不发给其他 worker handler', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w2', handler2);

      const msg = createTestCoordinatorMessage();
      mockSubscriber.__emit('message', 'beeclaw:worker:w1', JSON.stringify(msg));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('disconnect 后 reconnect 应正常工作', () => {
    it('disconnect 后再次 connect 应成功', async () => {
      await transport.connect();
      await transport.disconnect();

      // 重置 mock 索引，让新的 connect 能创建新实例
      mockPublisher = createMockRedis();
      mockSubscriber = createMockRedis();
      mockInstanceIndex = 0;

      const newTransport = new RedisTransportLayer({ host: '127.0.0.1', port: 6379 });
      await newTransport.connect();

      expect(mockPublisher.connect).toHaveBeenCalledTimes(1);
      expect(mockSubscriber.connect).toHaveBeenCalledTimes(1);

      await newTransport.disconnect();
    });
  });

  describe('默认配置', () => {
    it('不传任何配置时应使用默认值', async () => {
      mockInstanceIndex = 0;
      const defaultTransport = new RedisTransportLayer();
      await defaultTransport.connect();

      const msg = createTestCoordinatorMessage();
      await defaultTransport.sendToWorker('w1', msg);

      // 使用默认前缀 'beeclaw'
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'beeclaw:worker:w1',
        JSON.stringify(msg),
      );

      await defaultTransport.disconnect();
    });
  });

  describe('getRegisteredWorkerIds 在无 handler 时', () => {
    it('未注册任何 handler 时返回空数组', () => {
      expect(transport.getRegisteredWorkerIds()).toEqual([]);
    });
  });

  describe('disconnect 清理后状态一致性', () => {
    it('disconnect 后 connected 标志应为 false', async () => {
      await transport.connect();
      await transport.disconnect();

      // 尝试任何需要连接的操作都应抛错
      await expect(transport.sendToWorker('w1', createTestCoordinatorMessage()))
        .rejects.toThrow('[RedisTransport] Not connected');
    });
  });

  describe('onWorkerMessage 替换已有 handler', () => {
    it('对同一 workerId 重复注册 handler 应替换旧 handler', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w1', handler2);

      const msg = createTestCoordinatorMessage();
      mockSubscriber.__emit('message', 'beeclaw:worker:w1', JSON.stringify(msg));

      // 只有新 handler 应被调用
      expect(handler2).toHaveBeenCalledTimes(1);
      // 旧 handler 不应被调用（已被替换）
      expect(handler1).not.toHaveBeenCalled();
    });
  });

  describe('onLeaderMessage 替换已有 handler', () => {
    it('重复注册 leader handler 应替换旧 handler', async () => {
      await transport.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onLeaderMessage(handler1);
      transport.onLeaderMessage(handler2);

      const msg = createTestWorkerMessage();
      mockSubscriber.__emit('message', 'beeclaw:leader', JSON.stringify(msg));

      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler1).not.toHaveBeenCalled();
    });
  });

  describe('broadcast 消息在无 worker handler 时', () => {
    it('无 worker handler 注册时 broadcast 消息应静默忽略', async () => {
      await transport.connect();

      // 没有注册任何 worker handler，发送 broadcast 不应抛错
      expect(() => {
        mockSubscriber.__emit(
          'message',
          'beeclaw:broadcast',
          JSON.stringify(createTestCoordinatorMessage()),
        );
      }).not.toThrow();
    });
  });
});
