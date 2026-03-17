// ============================================================================
// @beeclaw/world-engine TickScheduler 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TickScheduler } from './TickScheduler.js';

describe('TickScheduler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 基本状态 ──

  describe('初始状态', () => {
    it('初始 tick 应为 0', () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      expect(scheduler.getCurrentTick()).toBe(0);
    });

    it('初始不应在运行', () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      expect(scheduler.isRunning()).toBe(false);
    });

    it('getWorldTimestamp 应返回 Date 对象', () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      expect(scheduler.getWorldTimestamp()).toBeInstanceOf(Date);
    });
  });

  // ── advance ──

  describe('advance', () => {
    it('手动推进应增加 tick', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      const tick1 = await scheduler.advance();
      expect(tick1).toBe(1);
      expect(scheduler.getCurrentTick()).toBe(1);

      const tick2 = await scheduler.advance();
      expect(tick2).toBe(2);
    });

    it('推进时应调用回调', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      const callback = vi.fn().mockResolvedValue(undefined);
      scheduler.onTick(callback);

      await scheduler.advance();
      expect(callback).toHaveBeenCalledWith(1);

      await scheduler.advance();
      expect(callback).toHaveBeenCalledWith(2);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('无回调时不应抛出', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      await expect(scheduler.advance()).resolves.toBe(1);
    });
  });

  // ── setTick ──

  describe('setTick', () => {
    it('应设置当前 tick 值', () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      scheduler.setTick(42);
      expect(scheduler.getCurrentTick()).toBe(42);
    });

    it('设置后 advance 应从该值继续', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      scheduler.setTick(100);
      const tick = await scheduler.advance();
      expect(tick).toBe(101);
    });
  });

  // ── start / stop ──

  describe('start / stop', () => {
    it('start 应标记为运行', () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop();
      vi.useRealTimers();
    });

    it('stop 应标记为停止', () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      scheduler.start();
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
      vi.useRealTimers();
    });

    it('重复 start 不应有副作用', () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      scheduler.start();
      scheduler.start(); // 重复调用
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop();
      vi.useRealTimers();
    });
  });

  // ── scheduleNext (自动推进) ──

  describe('scheduleNext (自动推进)', () => {
    it('自动推进应按间隔触发 tick', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      const callback = vi.fn().mockResolvedValue(undefined);
      scheduler.onTick(callback);

      scheduler.start();

      // 推进第一个 tick
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledWith(1);

      // 推进第二个 tick
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledWith(2);

      scheduler.stop();
      vi.useRealTimers();
    });

    it('回调抛出异常时应捕获错误并继续调度', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      const error = new Error('tick callback failure');
      let callCount = 0;
      const callback = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw error;
        }
      });
      scheduler.onTick(callback);

      scheduler.start();

      // 第一个 tick — 回调抛出异常
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Tick 1 执行出错'),
        error,
      );

      // 第二个 tick — 应继续正常调度（不会因第一个 tick 的异常而中断）
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledWith(2);
      expect(callback).toHaveBeenCalledTimes(2);

      scheduler.stop();
      vi.useRealTimers();
    });

    it('stop 后不应再调度新的 tick', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      const callback = vi.fn().mockResolvedValue(undefined);
      scheduler.onTick(callback);

      scheduler.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      scheduler.stop();

      // 再推进时间，不应触发更多回调
      await vi.advanceTimersByTimeAsync(300);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  // ── getWorldTimestamp ──

  describe('getWorldTimestamp', () => {
    it('tick 推进后时间戳应增加', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 60000 });
      const t0 = scheduler.getWorldTimestamp().getTime();
      await scheduler.advance();
      const t1 = scheduler.getWorldTimestamp().getTime();
      expect(t1 - t0).toBe(60000);
    });

    it('多次推进时间戳应线性增长', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      const t0 = scheduler.getWorldTimestamp().getTime();
      await scheduler.advance();
      await scheduler.advance();
      await scheduler.advance();
      const t3 = scheduler.getWorldTimestamp().getTime();
      expect(t3 - t0).toBe(3000);
    });

    it('setTick 后时间戳应对应', () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 5000 });
      scheduler.setTick(10);
      const t0 = scheduler.getWorldTimestamp().getTime();
      scheduler.setTick(20);
      const t1 = scheduler.getWorldTimestamp().getTime();
      expect(t1 - t0).toBe(50000); // 10 * 5000
    });
  });

  // ── 补充测试：边界场景 ──

  describe('边界场景', () => {
    it('stop 未 start 时不应抛出', () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      expect(() => scheduler.stop()).not.toThrow();
    });

    it('快速连续 start/stop 不应引发问题', () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 50 });
      for (let i = 0; i < 10; i++) {
        scheduler.start();
        scheduler.stop();
      }
      expect(scheduler.isRunning()).toBe(false);
      expect(scheduler.getCurrentTick()).toBe(0);
      vi.useRealTimers();
    });

    it('start 后 stop 再 start 应继续推进', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      const callback = vi.fn().mockResolvedValue(undefined);
      scheduler.onTick(callback);

      scheduler.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledWith(1);

      scheduler.stop();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledWith(2);

      scheduler.stop();
      vi.useRealTimers();
    });

    it('advance 无论 running 状态都应工作', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      // 未 start，直接 advance
      expect(scheduler.isRunning()).toBe(false);
      const tick = await scheduler.advance();
      expect(tick).toBe(1);
    });

    it('setTick 为 0 应重置到初始状态', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 1000 });
      await scheduler.advance();
      await scheduler.advance();
      expect(scheduler.getCurrentTick()).toBe(2);
      scheduler.setTick(0);
      expect(scheduler.getCurrentTick()).toBe(0);
    });

    it('不同 tickIntervalMs 不应影响 advance 的行为', async () => {
      const fast = new TickScheduler({ tickIntervalMs: 1 });
      const slow = new TickScheduler({ tickIntervalMs: 999999 });

      // advance 是手动推进，不受间隔影响
      expect(await fast.advance()).toBe(1);
      expect(await slow.advance()).toBe(1);
    });

    it('回调中调用 stop 应阻止后续 tick', async () => {
      vi.useFakeTimers();
      const scheduler = new TickScheduler({ tickIntervalMs: 100 });
      const callback = vi.fn().mockImplementation(async (tick: number) => {
        if (tick === 2) {
          scheduler.stop();
        }
      });
      scheduler.onTick(callback);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(100); // tick 1
      await vi.advanceTimersByTimeAsync(100); // tick 2, stop called
      await vi.advanceTimersByTimeAsync(300); // 应无更多 tick

      expect(callback).toHaveBeenCalledTimes(2);
      expect(scheduler.isRunning()).toBe(false);
      vi.useRealTimers();
    });
  });
});
