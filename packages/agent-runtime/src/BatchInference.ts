// ============================================================================
// BatchInference — 批量 LLM 推理引擎
// 支持并发控制、背压、指数退避重试
// ============================================================================

import { delay } from '@beeclaw/shared';

/**
 * 单个推理请求
 */
export interface InferenceRequest<T = unknown> {
  /** 请求唯一标识 */
  id: string;
  /** 执行推理的异步函数 */
  execute: () => Promise<T>;
}

/**
 * 推理结果
 */
export interface InferenceResult<T = unknown> {
  /** 请求 ID */
  id: string;
  /** 是否成功 */
  success: boolean;
  /** 成功时的结果 */
  result?: T;
  /** 失败时的错误 */
  error?: Error;
  /** 重试次数 */
  retries: number;
  /** 耗时（毫秒） */
  durationMs: number;
}

/**
 * 批量推理统计
 */
export interface BatchStats {
  /** 总请求数 */
  totalRequests: number;
  /** 成功数 */
  succeeded: number;
  /** 失败数 */
  failed: number;
  /** 总重试次数 */
  totalRetries: number;
  /** 总耗时 */
  totalDurationMs: number;
  /** 平均耗时 */
  avgDurationMs: number;
}

/**
 * 批量推理配置
 */
export interface BatchInferenceConfig {
  /** 最大并发请求数，默认 10 */
  maxConcurrency: number;
  /** 最大重试次数，默认 3 */
  maxRetries: number;
  /** 初始重试延迟（毫秒），默认 1000 */
  initialRetryDelayMs: number;
  /** 最大重试延迟（毫秒），默认 30000 */
  maxRetryDelayMs: number;
  /** 退避倍数，默认 2 */
  backoffMultiplier: number;
  /** 请求间的最小间隔（毫秒，背压控制），默认 0 */
  requestIntervalMs: number;
}

const DEFAULT_CONFIG: BatchInferenceConfig = {
  maxConcurrency: 10,
  maxRetries: 3,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  backoffMultiplier: 2,
  requestIntervalMs: 0,
};

export class BatchInference {
  private config: BatchInferenceConfig;
  private activeRequests = 0;
  private totalStats: BatchStats = {
    totalRequests: 0,
    succeeded: 0,
    failed: 0,
    totalRetries: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
  };

  constructor(config?: Partial<BatchInferenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 批量执行推理请求
   * 使用信号量控制并发，带指数退避重试
   */
  async executeBatch<T>(requests: InferenceRequest<T>[]): Promise<InferenceResult<T>[]> {
    if (requests.length === 0) return [];

    const results: InferenceResult<T>[] = [];
    const semaphore = new Semaphore(this.config.maxConcurrency);
    let lastRequestTime = 0;

    const tasks = requests.map(async (request) => {
      await semaphore.acquire();

      try {
        // 背压控制：确保请求间隔
        if (this.config.requestIntervalMs > 0) {
          const now = Date.now();
          const elapsed = now - lastRequestTime;
          if (elapsed < this.config.requestIntervalMs) {
            await delay(this.config.requestIntervalMs - elapsed);
          }
          lastRequestTime = Date.now();
        }

        const result = await this.executeWithRetry(request);
        results.push(result);

        // 更新统计
        this.totalStats.totalRequests++;
        this.totalStats.totalRetries += result.retries;
        this.totalStats.totalDurationMs += result.durationMs;
        if (result.success) {
          this.totalStats.succeeded++;
        } else {
          this.totalStats.failed++;
        }
      } finally {
        semaphore.release();
      }
    });

    await Promise.allSettled(tasks);

    // 更新平均耗时
    if (this.totalStats.totalRequests > 0) {
      this.totalStats.avgDurationMs = this.totalStats.totalDurationMs / this.totalStats.totalRequests;
    }

    return results;
  }

  /**
   * 带指数退避重试的单次请求执行
   */
  private async executeWithRetry<T>(request: InferenceRequest<T>): Promise<InferenceResult<T>> {
    let retries = 0;
    let lastError: Error | undefined;
    const startTime = Date.now();

    while (retries <= this.config.maxRetries) {
      try {
        this.activeRequests++;
        const result = await request.execute();
        this.activeRequests--;

        return {
          id: request.id,
          success: true,
          result,
          retries,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        this.activeRequests--;
        lastError = err instanceof Error ? err : new Error(String(err));

        if (retries < this.config.maxRetries) {
          // 计算指数退避延迟
          const delayMs = Math.min(
            this.config.initialRetryDelayMs * Math.pow(this.config.backoffMultiplier, retries),
            this.config.maxRetryDelayMs,
          );

          // 添加 jitter（±20%）
          const jitter = delayMs * 0.2 * (Math.random() * 2 - 1);
          await delay(Math.max(0, delayMs + jitter));

          retries++;
          console.warn(
            `[BatchInference] 请求 ${request.id} 第 ${retries} 次重试 (延迟 ${Math.round(delayMs)}ms): ${lastError.message}`,
          );
        } else {
          retries++;
          break;
        }
      }
    }

    return {
      id: request.id,
      success: false,
      error: lastError,
      retries: retries - 1,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 获取当前活跃请求数
   */
  getActiveRequests(): number {
    return this.activeRequests;
  }

  /**
   * 获取累计统计信息
   */
  getStats(): BatchStats {
    return { ...this.totalStats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.totalStats = {
      totalRequests: 0,
      succeeded: 0,
      failed: 0,
      totalRetries: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): BatchInferenceConfig {
    return { ...this.config };
  }

  /**
   * 动态更新并发数
   */
  setMaxConcurrency(maxConcurrency: number): void {
    this.config.maxConcurrency = maxConcurrency;
  }
}

// ============================================================================
// Semaphore — 信号量实现（用于并发控制）
// ============================================================================

class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}
