// ============================================================================
// LLMClient — 手写 OpenAI 兼容 API 调用（fetch 实现）
// 支持指数退避重试（可重试错误：429、503、网络超时）
// ============================================================================

import type { LLMConfig } from '@beeclaw/shared';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 60_000;

/** 默认重试次数 */
const DEFAULT_MAX_RETRIES = 3;

/** 默认初始退避时间（毫秒） */
const DEFAULT_INITIAL_BACKOFF_MS = 1000;

/** 可重试的 HTTP 状态码 */
const RETRYABLE_STATUS_CODES = new Set([429, 503, 502, 504]);

/** LLM 调用错误，包含重试信息 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false,
    public readonly attemptsMade: number = 1,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export interface LLMClientOptions {
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
  /** 初始退避时间毫秒（默认 1000，指数增长） */
  initialBackoffMs?: number;
}

export class LLMClient {
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private timeoutMs: number;
  private maxRetries: number;
  private initialBackoffMs: number;

  constructor(config: LLMConfig, options: LLMClientOptions = {}) {
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 2048;
    this.temperature = config.temperature ?? 0.7;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  }

  /**
   * 发送 chat completion 请求
   * 带超时控制（默认 60s）和指数退避重试
   */
  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    const url = `${this.baseURL}/v1/chat/completions`;
    const body = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < this.maxRetries) {
      attempt++;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          const isRetryable = RETRYABLE_STATUS_CODES.has(response.status);

          if (isRetryable && attempt < this.maxRetries) {
            // 429 可能包含 Retry-After 头
            const retryAfter = response.headers.get('Retry-After');
            const backoffMs = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : this.initialBackoffMs * Math.pow(2, attempt - 1);

            await this.sleep(backoffMs);
            continue;
          }

          throw new LLMError(
            `LLM API error: ${response.status} ${response.statusText} — ${errorText}`,
            response.status,
            isRetryable,
            attempt,
          );
        }

        const data = (await response.json()) as ChatCompletionResponse;

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new LLMError('LLM API returned empty response', undefined, false, attempt);
        }

        return content;
      } catch (error) {
        lastError = error as Error;

        // 超时或网络错误可重试
        const isTimeoutOrNetwork =
          error instanceof Error &&
          (error.name === 'TimeoutError' ||
            error.name === 'AbortError' ||
            error.message.includes('fetch failed') ||
            error.message.includes('network'));

        if (isTimeoutOrNetwork && attempt < this.maxRetries) {
          const backoffMs = this.initialBackoffMs * Math.pow(2, attempt - 1);
          await this.sleep(backoffMs);
          continue;
        }

        // 不可重试错误或已达最大重试次数
        if (error instanceof LLMError) {
          throw error;
        }

        throw new LLMError(
          error instanceof Error ? error.message : String(error),
          undefined,
          isTimeoutOrNetwork,
          attempt,
        );
      }
    }

    // 不应到达这里，但作为安全网
    throw lastError ?? new LLMError('Unknown error after retries', undefined, false, attempt);
  }

  /**
   * 获取当前模型 ID
   */
  getModel(): string {
    return this.model;
  }

  /**
   * 获取重试配置
   */
  getRetryConfig(): { maxRetries: number; initialBackoffMs: number } {
    return {
      maxRetries: this.maxRetries,
      initialBackoffMs: this.initialBackoffMs,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
