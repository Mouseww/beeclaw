// ============================================================================
// BatchInference 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchInference } from './BatchInference.js';
import type { InferenceRequest } from './BatchInference.js';

describe('BatchInference', () => {
  let batch: BatchInference;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── 构造 ──

  describe('构造函数', () => {
    it('应使用默认配置', () => {
      batch = new BatchInference();
      const config = batch.getConfig();
      expect(config.maxConcurrency).toBe(10);
      expect(config.maxRetries).toBe(3);
      expect(config.initialRetryDelayMs).toBe(1000);
      expect(config.backoffMultiplier).toBe(2);
    });

    it('应接受自定义配置', () => {
      batch = new BatchInference({ maxConcurrency: 5, maxRetries: 1 });
      const config = batch.getConfig();
      expect(config.maxConcurrency).toBe(5);
      expect(config.maxRetries).toBe(1);
    });
  });

  // ── executeBatch 基本功能 ──

  describe('executeBatch', () => {
    it('空请求列表应返回空结果', async () => {
      batch = new BatchInference();
      const results = await batch.executeBatch([]);
      expect(results).toHaveLength(0);
    });

    it('单个请求应正确执行', async () => {
      batch = new BatchInference();
      const requests: InferenceRequest<string>[] = [
        { id: 'r1', execute: async () => '结果1' },
      ];

      const results = await batch.executeBatch(requests);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('r1');
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.result).toBe('结果1');
      expect(results[0]!.retries).toBe(0);
      expect(results[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('多个请求应全部执行', async () => {
      batch = new BatchInference();
      const requests: InferenceRequest<number>[] = Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        execute: async () => i * 10,
      }));

      const results = await batch.executeBatch(requests);
      expect(results).toHaveLength(5);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });

    it('失败请求应返回 success=false 和 error', async () => {
      batch = new BatchInference({ maxRetries: 0, initialRetryDelayMs: 1 });
      const requests: InferenceRequest<string>[] = [
        { id: 'fail1', execute: async () => { throw new Error('API 失败'); } },
      ];

      const results = await batch.executeBatch(requests);
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeDefined();
      expect(results[0]!.error!.message).toBe('API 失败');
    });

    it('混合成功和失败请求应正确处理', async () => {
      batch = new BatchInference({ maxRetries: 0, initialRetryDelayMs: 1 });
      const requests: InferenceRequest<string>[] = [
        { id: 'ok1', execute: async () => 'good' },
        { id: 'fail1', execute: async () => { throw new Error('bad'); } },
        { id: 'ok2', execute: async () => 'also good' },
      ];

      const results = await batch.executeBatch(requests);
      expect(results).toHaveLength(3);

      const ok1 = results.find(r => r.id === 'ok1');
      const fail1 = results.find(r => r.id === 'fail1');
      const ok2 = results.find(r => r.id === 'ok2');

      expect(ok1?.success).toBe(true);
      expect(fail1?.success).toBe(false);
      expect(ok2?.success).toBe(true);
    });
  });

  // ── 并发控制 ──

  describe('并发控制', () => {
    it('应限制并发请求数', async () => {
      const maxConcurrency = 2;
      batch = new BatchInference({ maxConcurrency });

      let currentConcurrency = 0;
      let maxObservedConcurrency = 0;

      const requests: InferenceRequest<void>[] = Array.from({ length: 6 }, (_, i) => ({
        id: `r${i}`,
        execute: async () => {
          currentConcurrency++;
          maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
          await new Promise(resolve => setTimeout(resolve, 20));
          currentConcurrency--;
        },
      }));

      await batch.executeBatch(requests);
      expect(maxObservedConcurrency).toBeLessThanOrEqual(maxConcurrency);
    });
  });

  // ── 重试机制 ──

  describe('重试机制', () => {
    it('失败后应按配置重试', async () => {
      let callCount = 0;
      batch = new BatchInference({
        maxRetries: 2,
        initialRetryDelayMs: 10,
        maxRetryDelayMs: 50,
        backoffMultiplier: 2,
      });

      const requests: InferenceRequest<string>[] = [
        {
          id: 'retry-test',
          execute: async () => {
            callCount++;
            if (callCount < 3) throw new Error(`尝试 ${callCount} 失败`);
            return '终于成功';
          },
        },
      ];

      const results = await batch.executeBatch(requests);
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.result).toBe('终于成功');
      expect(results[0]!.retries).toBe(2);
      expect(callCount).toBe(3);
    });

    it('超过最大重试次数应失败', async () => {
      batch = new BatchInference({
        maxRetries: 1,
        initialRetryDelayMs: 10,
        maxRetryDelayMs: 20,
      });

      let callCount = 0;
      const requests: InferenceRequest<string>[] = [
        {
          id: 'max-retry',
          execute: async () => {
            callCount++;
            throw new Error('永远失败');
          },
        },
      ];

      const results = await batch.executeBatch(requests);
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(callCount).toBe(2); // 1 次初始 + 1 次重试
      expect(results[0]!.retries).toBe(1);
    });

    it('第一次就成功不应有重试', async () => {
      batch = new BatchInference({ maxRetries: 3 });
      const requests: InferenceRequest<string>[] = [
        { id: 'no-retry', execute: async () => '直接成功' },
      ];

      const results = await batch.executeBatch(requests);
      expect(results[0]!.retries).toBe(0);
    });
  });

  // ── 统计 ──

  describe('统计', () => {
    it('初始统计应全部为零', () => {
      batch = new BatchInference();
      const stats = batch.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.totalRetries).toBe(0);
    });

    it('应正确累计统计', async () => {
      batch = new BatchInference({ maxRetries: 0, initialRetryDelayMs: 1 });

      await batch.executeBatch([
        { id: 'ok', execute: async () => 'good' },
        { id: 'fail', execute: async () => { throw new Error('bad'); } },
      ]);

      const stats = batch.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.succeeded).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('多次 executeBatch 应累计统计', async () => {
      batch = new BatchInference({ maxRetries: 0 });

      await batch.executeBatch([
        { id: 'ok1', execute: async () => 'a' },
      ]);
      await batch.executeBatch([
        { id: 'ok2', execute: async () => 'b' },
      ]);

      const stats = batch.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.succeeded).toBe(2);
    });

    it('resetStats 应重置统计', async () => {
      batch = new BatchInference({ maxRetries: 0 });

      await batch.executeBatch([
        { id: 'ok', execute: async () => 'good' },
      ]);
      batch.resetStats();

      const stats = batch.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.succeeded).toBe(0);
    });

    it('应统计重试次数', async () => {
      let callCount = 0;
      batch = new BatchInference({
        maxRetries: 2,
        initialRetryDelayMs: 10,
        maxRetryDelayMs: 20,
      });

      await batch.executeBatch([
        {
          id: 'retry-stats',
          execute: async () => {
            callCount++;
            if (callCount < 2) throw new Error('重试');
            return 'ok';
          },
        },
      ]);

      const stats = batch.getStats();
      expect(stats.totalRetries).toBe(1);
    });

    it('应记录耗时', async () => {
      batch = new BatchInference();
      await batch.executeBatch([
        {
          id: 'duration-test',
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'done';
          },
        },
      ]);

      const stats = batch.getStats();
      expect(stats.totalDurationMs).toBeGreaterThan(0);
      expect(stats.avgDurationMs).toBeGreaterThan(0);
    });
  });

  // ── 配置更新 ──

  describe('配置更新', () => {
    it('setMaxConcurrency 应更新并发数', () => {
      batch = new BatchInference();
      batch.setMaxConcurrency(20);
      expect(batch.getConfig().maxConcurrency).toBe(20);
    });

    it('getActiveRequests 初始应为 0', () => {
      batch = new BatchInference();
      expect(batch.getActiveRequests()).toBe(0);
    });
  });

  // ── 背压控制 ──

  describe('背压控制', () => {
    it('requestIntervalMs > 0 时应间隔发送请求', async () => {
      batch = new BatchInference({
        maxConcurrency: 1,
        requestIntervalMs: 30,
      });

      const timestamps: number[] = [];
      const requests: InferenceRequest<void>[] = Array.from({ length: 3 }, (_, i) => ({
        id: `bp${i}`,
        execute: async () => {
          timestamps.push(Date.now());
        },
      }));

      await batch.executeBatch(requests);

      // 至少应有一定间隔（考虑系统时钟精度放宽检查）
      expect(timestamps.length).toBe(3);
      if (timestamps.length >= 2) {
        // 至少后面的请求比第一个晚一些时间
        const totalSpan = timestamps[timestamps.length - 1]! - timestamps[0]!;
        expect(totalSpan).toBeGreaterThanOrEqual(30); // 至少有 1 个间隔
      }
    });
  });
});
