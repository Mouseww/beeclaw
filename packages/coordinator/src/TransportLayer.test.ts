// ============================================================================
// InProcessTransport 单元测试
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { InProcessTransport } from './TransportLayer.js';
import type { CoordinatorMessage, WorkerMessage } from './types.js';

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

describe('InProcessTransport', () => {
  // ── Worker 注册/注销 ──

  describe('registerWorker / unregisterWorker', () => {
    it('registerWorker 应添加 workerId 到注册列表', () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');
      expect(transport.getRegisteredWorkerIds()).toContain('w1');
    });

    it('registerWorker 重复注册应幂等', () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');
      transport.registerWorker('w1');
      expect(transport.getRegisteredWorkerIds()).toHaveLength(1);
    });

    it('unregisterWorker 应移除 workerId 及其 handler', () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');
      transport.onWorkerMessage('w1', () => {});
      transport.unregisterWorker('w1');
      expect(transport.getRegisteredWorkerIds()).not.toContain('w1');
    });

    it('unregisterWorker 对未注册的 worker 应安全无操作', () => {
      const transport = new InProcessTransport();
      expect(() => transport.unregisterWorker('nonexistent')).not.toThrow();
    });

    it('getRegisteredWorkerIds 应返回所有已注册 worker', () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');
      transport.registerWorker('w2');
      transport.registerWorker('w3');
      const ids = transport.getRegisteredWorkerIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('w1');
      expect(ids).toContain('w2');
      expect(ids).toContain('w3');
    });

    it('getRegisteredWorkerIds 无注册时返回空数组', () => {
      const transport = new InProcessTransport();
      expect(transport.getRegisteredWorkerIds()).toEqual([]);
    });
  });

  // ── sendToWorker ──

  describe('sendToWorker', () => {
    it('应将消息传递给对应 worker 的 handler', async () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');

      const handler = vi.fn();
      transport.onWorkerMessage('w1', handler);

      const msg = createTestCoordinatorMessage({ tick: 42 });
      await transport.sendToWorker('w1', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('向未注册 handler 的 worker 发送消息应抛出错误', async () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');

      const msg = createTestCoordinatorMessage();
      await expect(transport.sendToWorker('w1', msg))
        .rejects.toThrow('Worker w1 has no message handler registered');
    });

    it('向不存在的 worker 发送消息应抛出错误', async () => {
      const transport = new InProcessTransport();
      const msg = createTestCoordinatorMessage();
      await expect(transport.sendToWorker('nonexistent', msg))
        .rejects.toThrow('Worker nonexistent has no message handler registered');
    });
  });

  // ── broadcastToWorkers ──

  describe('broadcastToWorkers', () => {
    it('应将消息广播到所有已注册 worker 的 handler', async () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');
      transport.registerWorker('w2');
      transport.registerWorker('w3');

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w2', handler2);
      transport.onWorkerMessage('w3', handler3);

      const msg = createTestCoordinatorMessage({ tick: 10 });
      await transport.broadcastToWorkers(msg);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith(msg);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith(msg);
      expect(handler3).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledWith(msg);
    });

    it('无注册 worker 时 broadcast 应安全完成', async () => {
      const transport = new InProcessTransport();
      const msg = createTestCoordinatorMessage();
      await expect(transport.broadcastToWorkers(msg)).resolves.toBeUndefined();
    });

    it('部分 worker 无 handler 时 broadcast 应抛出', async () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');
      transport.registerWorker('w2');

      // 只给 w1 注册 handler
      transport.onWorkerMessage('w1', vi.fn());

      const msg = createTestCoordinatorMessage();
      await expect(transport.broadcastToWorkers(msg)).rejects.toThrow();
    });
  });

  // ── sendToLeader ──

  describe('sendToLeader', () => {
    it('应将消息传递给 leader handler', async () => {
      const transport = new InProcessTransport();

      const handler = vi.fn();
      transport.onLeaderMessage(handler);

      const msg = createTestWorkerMessage({ workerId: 'w1' });
      await transport.sendToLeader(msg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('未注册 leader handler 时发送消息应抛出错误', async () => {
      const transport = new InProcessTransport();
      const msg = createTestWorkerMessage();
      await expect(transport.sendToLeader(msg))
        .rejects.toThrow('No leader message handler registered');
    });
  });

  // ── onWorkerMessage ──

  describe('onWorkerMessage', () => {
    it('应注册 worker 消息处理器', async () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');

      const handler = vi.fn();
      transport.onWorkerMessage('w1', handler);

      const msg = createTestCoordinatorMessage();
      await transport.sendToWorker('w1', msg);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('重复注册应替换旧 handler', async () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onWorkerMessage('w1', handler1);
      transport.onWorkerMessage('w1', handler2);

      const msg = createTestCoordinatorMessage();
      await transport.sendToWorker('w1', msg);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // ── onLeaderMessage ──

  describe('onLeaderMessage', () => {
    it('应注册 leader 消息处理器', async () => {
      const transport = new InProcessTransport();

      const handler = vi.fn();
      transport.onLeaderMessage(handler);

      const msg = createTestWorkerMessage();
      await transport.sendToLeader(msg);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('重复注册应替换旧 handler', async () => {
      const transport = new InProcessTransport();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onLeaderMessage(handler1);
      transport.onLeaderMessage(handler2);

      const msg = createTestWorkerMessage();
      await transport.sendToLeader(msg);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // ── 综合场景 ──

  describe('综合场景', () => {
    it('完整通信流程: 注册 → 发送 → handler 接收', async () => {
      const transport = new InProcessTransport();

      // 注册 worker
      transport.registerWorker('w1');
      transport.registerWorker('w2');

      // 注册 handler
      const workerHandler1 = vi.fn();
      const workerHandler2 = vi.fn();
      const leaderHandler = vi.fn();
      transport.onWorkerMessage('w1', workerHandler1);
      transport.onWorkerMessage('w2', workerHandler2);
      transport.onLeaderMessage(leaderHandler);

      // Coordinator → Worker
      const coordMsg = createTestCoordinatorMessage({ tick: 5 });
      await transport.sendToWorker('w1', coordMsg);
      expect(workerHandler1).toHaveBeenCalledWith(coordMsg);
      expect(workerHandler2).not.toHaveBeenCalled();

      // Worker → Leader
      const workerMsg = createTestWorkerMessage({ workerId: 'w1' });
      await transport.sendToLeader(workerMsg);
      expect(leaderHandler).toHaveBeenCalledWith(workerMsg);

      // Broadcast
      const broadcastMsg = createTestCoordinatorMessage({ tick: 6 });
      await transport.broadcastToWorkers(broadcastMsg);
      expect(workerHandler1).toHaveBeenCalledWith(broadcastMsg);
      expect(workerHandler2).toHaveBeenCalledWith(broadcastMsg);
    });

    it('注销 worker 后其 handler 不应再接收消息', async () => {
      const transport = new InProcessTransport();
      transport.registerWorker('w1');

      const handler = vi.fn();
      transport.onWorkerMessage('w1', handler);

      transport.unregisterWorker('w1');

      const msg = createTestCoordinatorMessage();
      await expect(transport.sendToWorker('w1', msg)).rejects.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });

    it('多次注册和注销组合操作应保持一致性', () => {
      const transport = new InProcessTransport();

      transport.registerWorker('w1');
      transport.registerWorker('w2');
      expect(transport.getRegisteredWorkerIds()).toHaveLength(2);

      transport.unregisterWorker('w1');
      expect(transport.getRegisteredWorkerIds()).toHaveLength(1);
      expect(transport.getRegisteredWorkerIds()).toContain('w2');

      transport.registerWorker('w3');
      expect(transport.getRegisteredWorkerIds()).toHaveLength(2);
      expect(transport.getRegisteredWorkerIds()).toContain('w2');
      expect(transport.getRegisteredWorkerIds()).toContain('w3');
    });
  });
});
