// ============================================================================
// BeeClaw Benchmark — BatchInference 批量推理调度性能
// 测试信号量并发控制、背压机制、重试开销和不同批量大小的吞吐量
//
// 预期基线（参考值）:
//   - 100 请求 / concurrency=10:   < 10ms (Mock 无延迟)
//   - 500 请求 / concurrency=50:   < 20ms
//   - 100 请求含 20% 失败率:       < 15ms (含重试开销)
//   - 10 请求 / concurrency=1:     < 5ms (串行)
// ============================================================================

import { bench, describe } from 'vitest';
import { BatchInference } from '@beeclaw/agent-runtime';
import type { InferenceRequest } from '@beeclaw/agent-runtime';

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function createSuccessRequests(count: number): InferenceRequest<string>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `req_${i}`,
    execute: async () => `result_${i}`,
  }));
}

function createMixedRequests(count: number, failureRate: number = 0.2): InferenceRequest<string>[] {
  const callCounts = new Map<string, number>();
  return Array.from({ length: count }, (_, i) => ({
    id: `req_${i}`,
    execute: async () => {
      const calls = (callCounts.get(`req_${i}`) ?? 0) + 1;
      callCounts.set(`req_${i}`, calls);
      if (calls === 1 && Math.random() < failureRate) {
        throw new Error(`Simulated failure for req_${i}`);
      }
      return `result_${i}`;
    },
  }));
}

// ── 并发度对比 ──────────────────────────────────────────────────────────────

describe('BatchInference — 并发度对比', () => {
  for (const concurrency of [1, 5, 10, 50]) {
    bench(
      `100 请求 / concurrency=${concurrency}`,
      async () => {
        const engine = new BatchInference({
          maxConcurrency: concurrency,
          maxRetries: 0,
          initialRetryDelayMs: 0,
          requestIntervalMs: 0,
        });
        await engine.executeBatch(createSuccessRequests(100));
      },
      { iterations: 50, warmupIterations: 5 },
    );
  }
});

// ── 批量大小对比 ────────────────────────────────────────────────────────────

describe('BatchInference — 批量大小对比', () => {
  for (const batchSize of [10, 50, 100, 500]) {
    bench(
      `${batchSize} 请求 / concurrency=10`,
      async () => {
        const engine = new BatchInference({
          maxConcurrency: 10,
          maxRetries: 0,
          initialRetryDelayMs: 0,
          requestIntervalMs: 0,
        });
        await engine.executeBatch(createSuccessRequests(batchSize));
      },
      { iterations: batchSize <= 100 ? 50 : 10, warmupIterations: 3 },
    );
  }
});

// ── 失败重试开销 ────────────────────────────────────────────────────────────

describe('BatchInference — 失败重试开销', () => {
  bench(
    '100 请求 / 20% 失败率 / maxRetries=1 (零延迟重试)',
    async () => {
      const engine = new BatchInference({
        maxConcurrency: 10,
        maxRetries: 1,
        initialRetryDelayMs: 0,
        maxRetryDelayMs: 0,
        requestIntervalMs: 0,
      });
      await engine.executeBatch(createMixedRequests(100, 0.2));
    },
    { iterations: 30, warmupIterations: 5 },
  );

  bench(
    '100 请求 / 50% 失败率 / maxRetries=2 (零延迟重试)',
    async () => {
      const engine = new BatchInference({
        maxConcurrency: 10,
        maxRetries: 2,
        initialRetryDelayMs: 0,
        maxRetryDelayMs: 0,
        requestIntervalMs: 0,
      });
      await engine.executeBatch(createMixedRequests(100, 0.5));
    },
    { iterations: 30, warmupIterations: 5 },
  );

  bench(
    '100 请求 / 0% 失败率 / maxRetries=3 (对照组)',
    async () => {
      const engine = new BatchInference({
        maxConcurrency: 10,
        maxRetries: 3,
        initialRetryDelayMs: 0,
        requestIntervalMs: 0,
      });
      await engine.executeBatch(createSuccessRequests(100));
    },
    { iterations: 50, warmupIterations: 5 },
  );
});

// ── 背压控制 ────────────────────────────────────────────────────────────────

describe('BatchInference — 背压控制', () => {
  bench(
    '50 请求 / requestIntervalMs=0 (无背压)',
    async () => {
      const engine = new BatchInference({
        maxConcurrency: 10,
        maxRetries: 0,
        initialRetryDelayMs: 0,
        requestIntervalMs: 0,
      });
      await engine.executeBatch(createSuccessRequests(50));
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    '50 请求 / requestIntervalMs=1 (最小背压)',
    async () => {
      const engine = new BatchInference({
        maxConcurrency: 10,
        maxRetries: 0,
        initialRetryDelayMs: 0,
        requestIntervalMs: 1,
      });
      await engine.executeBatch(createSuccessRequests(50));
    },
    { iterations: 10, warmupIterations: 2 },
  );
});

// ── 统计信息开销 ────────────────────────────────────────────────────────────

describe('BatchInference — 统计信息', () => {
  bench(
    'executeBatch + getStats (100 请求)',
    async () => {
      const engine = new BatchInference({
        maxConcurrency: 10,
        maxRetries: 0,
        initialRetryDelayMs: 0,
        requestIntervalMs: 0,
      });
      await engine.executeBatch(createSuccessRequests(100));
      engine.getStats();
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    'resetStats() ×1000',
    () => {
      const engine = new BatchInference({ maxConcurrency: 10 });
      for (let i = 0; i < 1000; i++) {
        engine.resetStats();
      }
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    'setMaxConcurrency() ×1000 (动态更新)',
    () => {
      const engine = new BatchInference({ maxConcurrency: 10 });
      for (let i = 0; i < 1000; i++) {
        engine.setMaxConcurrency(1 + (i % 50));
      }
    },
    { iterations: 100, warmupIterations: 10 },
  );
});
