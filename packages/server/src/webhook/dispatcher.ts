// ============================================================================
// BeeClaw Server — Webhook 分发器
// 异步发送、HMAC-SHA256 签名、指数退避重试（含 jitter）、并发控制
// ============================================================================

import { createHmac } from 'node:crypto';
import type { WebhookSubscription, WebhookEventType, WebhookPayload, WebhookDeliveryStatus } from '@beeclaw/shared';
import type { Store } from '../persistence/store.js';

/** 单次投递记录 */
export interface DeliveryRecord {
  subscriptionId: string;
  event: WebhookEventType;
  status: WebhookDeliveryStatus;
  statusCode?: number;
  attempt: number;
  timestamp: number;
  error?: string;
  /** 本次退避等待毫秒（首次为 0） */
  backoffMs?: number;
}

/** WebhookDispatcher 配置 */
export interface WebhookDispatcherConfig {
  /** 最大重试次数（默认 3） */
  maxRetries: number;
  /** 请求超时毫秒（默认 10000） */
  timeoutMs: number;
  /** 最大并发请求数（默认 10） */
  maxConcurrency: number;
  /** 退避基数毫秒（默认 1000，退避公式 = base * 2^(attempt-2) + jitter） */
  retryBaseMs: number;
  /** 是否启用 jitter 随机偏移（默认 true，防止雷群效应） */
  retryJitter: boolean;
}

const DEFAULT_CONFIG: WebhookDispatcherConfig = {
  maxRetries: 3,
  timeoutMs: 10_000,
  maxConcurrency: 10,
  retryBaseMs: 1000,
  retryJitter: true,
};

/**
 * 计算 HMAC-SHA256 签名
 */
export function computeSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * 计算指数退避延迟（含可选 jitter）
 *
 * 公式: baseMs * 2^(attempt-2) + jitter
 * - attempt=2 → baseMs * 1 + jitter (第一次重试)
 * - attempt=3 → baseMs * 2 + jitter (第二次重试)
 * - attempt=4 → baseMs * 4 + jitter (第三次重试)
 *
 * jitter 范围: [0, baseMs * 0.5)
 */
export function calculateBackoff(attempt: number, baseMs: number, jitter: boolean): number {
  const exponential = baseMs * Math.pow(2, attempt - 2);
  const jitterMs = jitter ? Math.random() * baseMs * 0.5 : 0;
  return Math.round(exponential + jitterMs);
}

export class WebhookDispatcher {
  private readonly config: WebhookDispatcherConfig;
  private readonly store: Store;
  private activeRequests = 0;
  private readonly deliveryLog: DeliveryRecord[] = [];
  /** 允许外部注入 fetch 函数，便于测试 */
  private fetchFn: typeof fetch;
  /** 允许外部注入 sleep 函数，便于测试 */
  private sleepFn: (ms: number) => Promise<void>;

  constructor(
    store: Store,
    config?: Partial<WebhookDispatcherConfig>,
    fetchImpl?: typeof fetch,
    sleepImpl?: (ms: number) => Promise<void>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
    this.fetchFn = fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleepFn = sleepImpl ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  }

  /**
   * 异步分发事件到所有匹配的 webhook 订阅者（不阻塞调用方）
   */
  dispatch(eventType: WebhookEventType, data: unknown): void {
    // 使用 void 启动异步任务，不阻塞主循环
    void this.dispatchAsync(eventType, data);
  }

  /**
   * 分发事件到所有匹配的 webhook 订阅者（可等待）
   */
  async dispatchAsync(eventType: WebhookEventType, data: unknown): Promise<DeliveryRecord[]> {
    const subscriptions = this.store.getActiveWebhooksForEvent(eventType);
    if (subscriptions.length === 0) return [];

    const records: DeliveryRecord[] = [];

    // 并发控制：分批发送
    const batches = this.chunkByConcurrency(subscriptions);
    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(sub => this.sendWithRetry(sub, eventType, data))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          records.push(result.value);
        }
      }
    }

    return records;
  }

  /**
   * 发送测试 payload 到指定订阅
   */
  async sendTest(subscription: WebhookSubscription): Promise<DeliveryRecord> {
    const testData = {
      test: true,
      message: 'BeeClaw webhook test payload',
      subscriptionId: subscription.id,
    };
    return this.sendWithRetry(subscription, 'tick.completed', testData);
  }

  /**
   * 获取投递日志
   */
  getDeliveryLog(): DeliveryRecord[] {
    return [...this.deliveryLog];
  }

  /**
   * 获取当前活跃请求数
   */
  getActiveRequests(): number {
    return this.activeRequests;
  }

  /**
   * 获取当前配置（只读副本）
   */
  getConfig(): Readonly<WebhookDispatcherConfig> {
    return { ...this.config };
  }

  // ── 内部方法 ──

  /**
   * 按并发限制分批
   */
  private chunkByConcurrency(subs: WebhookSubscription[]): WebhookSubscription[][] {
    const chunks: WebhookSubscription[][] = [];
    for (let i = 0; i < subs.length; i += this.config.maxConcurrency) {
      chunks.push(subs.slice(i, i + this.config.maxConcurrency));
    }
    return chunks;
  }

  /**
   * 带重试的发送（指数退避 + jitter）
   */
  private async sendWithRetry(
    sub: WebhookSubscription,
    eventType: WebhookEventType,
    data: unknown,
  ): Promise<DeliveryRecord> {
    let lastRecord: DeliveryRecord | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      let backoffMs = 0;
      const isRetrying = attempt > 1;
      if (isRetrying) {
        backoffMs = calculateBackoff(attempt, this.config.retryBaseMs, this.config.retryJitter);
        await this.sleepFn(backoffMs);
      }

      const record = await this.send(sub, eventType, data, attempt);
      record.backoffMs = backoffMs;
      lastRecord = record;

      this.deliveryLog.push(record);
      // 保留最近 500 条日志
      if (this.deliveryLog.length > 500) {
        this.deliveryLog.splice(0, this.deliveryLog.length - 500);
      }

      if (record.status === 'success') {
        return record;
      }

      // 标记为 retrying（除了最后一次）
      if (attempt < this.config.maxRetries) {
        record.status = 'retrying';
      }
    }

    return lastRecord!;
  }

  /**
   * 执行单次 HTTP 发送
   */
  private async send(
    sub: WebhookSubscription,
    eventType: WebhookEventType,
    data: unknown,
    attempt: number,
  ): Promise<DeliveryRecord> {
    const timestamp = Date.now();
    const payloadBody = JSON.stringify({
      event: eventType,
      data,
      timestamp,
    });

    const signature = computeSignature(payloadBody, sub.secret);

    const payload: WebhookPayload = {
      event: eventType,
      data,
      timestamp,
      signature,
    };

    this.activeRequests++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await this.fetchFn(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BeeClaw-Signature': signature,
          'X-BeeClaw-Event': eventType,
          'X-BeeClaw-Timestamp': String(payload.timestamp),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const isSuccess = response.status >= 200 && response.status < 300;
      return {
        subscriptionId: sub.id,
        event: eventType,
        status: isSuccess ? 'success' : 'failed',
        statusCode: response.status,
        attempt,
        timestamp,
      };
    } catch (err) {
      return {
        subscriptionId: sub.id,
        event: eventType,
        status: 'failed',
        attempt,
        timestamp,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.activeRequests--;
    }
  }
}
