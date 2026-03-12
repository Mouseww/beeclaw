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

  // ── getWorldTimestamp ──

  describe('getWorldTimestamp', () => {
    it('tick 推进后时间戳应增加', async () => {
      const scheduler = new TickScheduler({ tickIntervalMs: 60000 });
      const t0 = scheduler.getWorldTimestamp().getTime();
      await scheduler.advance();
      const t1 = scheduler.getWorldTimestamp().getTime();
      expect(t1 - t0).toBe(60000);
    });
  });
});
