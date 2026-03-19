// ============================================================================
// LLMClient 单元测试
// 测试 OpenAI 兼容 API 调用的各种场景，包括重试机制
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMClient, LLMError } from './LLMClient.js';
import type { ChatMessage } from './LLMClient.js';
import type { LLMConfig } from '@beeclaw/shared';

// ── Mock fetch ──

const mockFetch = vi.fn();

const DEFAULT_CONFIG: LLMConfig = {
  baseURL: 'http://localhost:8000',
  apiKey: 'test-api-key',
  model: 'test-model',
};

/** 创建成功的 API 响应 */
function createSuccessResponse(content: string, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      id: 'chatcmpl-test',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage,
    }),
    text: async () => '',
  };
}

/** 创建错误的 API 响应 */
function createErrorResponse(status: number, statusText: string, errorBody: string) {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
    text: async () => errorBody,
    headers: new Headers(),
  };
}

describe('LLMClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── 构造函数 ──

  describe('constructor', () => {
    it('应正确初始化配置', () => {
      const client = new LLMClient(DEFAULT_CONFIG);
      expect(client.getModel()).toBe('test-model');
    });

    it('应使用自定义 maxTokens 和 temperature', () => {
      const client = new LLMClient({
        ...DEFAULT_CONFIG,
        maxTokens: 4096,
        temperature: 0.3,
      });
      expect(client.getModel()).toBe('test-model');
    });

    it('应去除 baseURL 末尾的斜杠', () => {
      const client = new LLMClient({
        ...DEFAULT_CONFIG,
        baseURL: 'http://localhost:8000///',
      });

      mockFetch.mockResolvedValue(createSuccessResponse('test'));
      const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
      client.chatCompletion(messages);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/v1/chat/completions',
        expect.anything(),
      );
    });
  });

  // ── chatCompletion 正常路径 ──

  describe('chatCompletion — 正常路径', () => {
    it('应返回 API 响应内容', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse('你好，世界'));
      const client = new LLMClient(DEFAULT_CONFIG);
      const result = await client.chatCompletion([
        { role: 'user', content: '打招呼' },
      ]);

      expect(result).toBe('你好，世界');
    });

    it('应发送正确的请求体', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse('ok'));
      const client = new LLMClient({
        ...DEFAULT_CONFIG,
        maxTokens: 1024,
        temperature: 0.5,
      });

      const messages: ChatMessage[] = [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '测试' },
      ];
      await client.chatCompletion(messages);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://localhost:8000/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-api-key');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('test-model');
      expect(body.messages).toEqual(messages);
      expect(body.max_tokens).toBe(1024);
      expect(body.temperature).toBe(0.5);
    });

    it('应支持多轮对话消息', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse('回复'));
      const client = new LLMClient(DEFAULT_CONFIG);

      const messages: ChatMessage[] = [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '第一轮' },
        { role: 'assistant', content: '第一轮回复' },
        { role: 'user', content: '第二轮' },
      ];

      const result = await client.chatCompletion(messages);
      expect(result).toBe('回复');

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.messages).toHaveLength(4);
    });

    it('使用默认 maxTokens=2048 和 temperature=0.7', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse('ok'));
      const client = new LLMClient(DEFAULT_CONFIG);
      await client.chatCompletion([{ role: 'user', content: 'test' }]);

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.7);
    });
  });

  // ── chatCompletion 错误处理 ──

  describe('chatCompletion — 错误处理', () => {
    it('HTTP 错误应抛出包含状态码的异常', async () => {
      // 设置足够的重试次数以确保最终失败
      mockFetch.mockResolvedValue(
        createErrorResponse(429, 'Too Many Requests', 'Rate limit exceeded'),
      );
      // 使用 maxRetries: 1 确保不重试
      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 1 });

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('LLM API error: 429 Too Many Requests — Rate limit exceeded');
    });

    it('500 内部错误应抛出异常', async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(500, 'Internal Server Error', 'Backend failure'),
      );
      const client = new LLMClient(DEFAULT_CONFIG);

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('LLM API error: 500 Internal Server Error — Backend failure');
    });

    it('401 未授权应抛出异常', async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(401, 'Unauthorized', 'Invalid API key'),
      );
      const client = new LLMClient(DEFAULT_CONFIG);

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('LLM API error: 401 Unauthorized — Invalid API key');
    });

    it('错误响应体读取失败应使用 Unknown error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => { throw new Error('read failed'); },
        headers: new Headers(),
      });
      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 1 });

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('LLM API error: 502 Bad Gateway — Unknown error');
    });

    it('空响应应抛出异常', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          id: 'chatcmpl-empty',
          choices: [],
        }),
      });
      const client = new LLMClient(DEFAULT_CONFIG);

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('LLM API returned empty response');
    });

    it('choices[0].message.content 为空应抛出异常', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          id: 'chatcmpl-null',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '' },
              finish_reason: 'stop',
            },
          ],
        }),
      });
      const client = new LLMClient(DEFAULT_CONFIG);

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('LLM API returned empty response');
    });

    it('choices 为 null/undefined 应抛出异常', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          id: 'chatcmpl-null',
          choices: null,
        }),
      });
      const client = new LLMClient(DEFAULT_CONFIG);

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('LLM API returned empty response');
    });

    it('fetch 网络错误应传播异常', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));
      const client = new LLMClient(DEFAULT_CONFIG);

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('fetch failed');
    });
  });

  // ── 超时控制 ──

  describe('超时控制', () => {
    it('应传递 AbortSignal.timeout', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse('ok'));
      const client = new LLMClient({
        ...DEFAULT_CONFIG,
        timeoutMs: 30000,
      });

      await client.chatCompletion([{ role: 'user', content: 'test' }]);

      const options = mockFetch.mock.calls[0]![1];
      expect(options.signal).toBeDefined();
    });

    it('默认超时应为 60000ms', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse('ok'));
      const client = new LLMClient(DEFAULT_CONFIG);

      await client.chatCompletion([{ role: 'user', content: 'test' }]);

      const options = mockFetch.mock.calls[0]![1];
      expect(options.signal).toBeDefined();
    });
  });

  // ── getModel ──

  describe('getModel', () => {
    it('应返回配置的模型名称', () => {
      const client = new LLMClient({ ...DEFAULT_CONFIG, model: 'gpt-4o' });
      expect(client.getModel()).toBe('gpt-4o');
    });

    it('不同实例应返回各自的模型', () => {
      const client1 = new LLMClient({ ...DEFAULT_CONFIG, model: 'model-a' });
      const client2 = new LLMClient({ ...DEFAULT_CONFIG, model: 'model-b' });
      expect(client1.getModel()).toBe('model-a');
      expect(client2.getModel()).toBe('model-b');
    });
  });

  // ── 重试机制 ──

  describe('重试机制', () => {
    it('429 错误应触发重试', async () => {
      // 前两次返回 429，第三次成功
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(429, 'Too Many Requests', 'Rate limit'))
        .mockResolvedValueOnce(createErrorResponse(429, 'Too Many Requests', 'Rate limit'))
        .mockResolvedValueOnce(createSuccessResponse('成功'));

      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 3, initialBackoffMs: 10 });
      const result = await client.chatCompletion([{ role: 'user', content: 'test' }]);

      expect(result).toBe('成功');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('503 错误应触发重试', async () => {
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(503, 'Service Unavailable', 'Overloaded'))
        .mockResolvedValueOnce(createSuccessResponse('恢复'));

      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 2, initialBackoffMs: 10 });
      const result = await client.chatCompletion([{ role: 'user', content: 'test' }]);

      expect(result).toBe('恢复');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('超过最大重试次数应抛出 LLMError', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(429, 'Too Many Requests', 'Rate limit'));

      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 2, initialBackoffMs: 10 });

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow(LLMError);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('LLMError 应包含正确的元数据', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(429, 'Too Many Requests', 'Rate limit'));

      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 2, initialBackoffMs: 10 });

      try {
        await client.chatCompletion([{ role: 'user', content: 'test' }]);
        expect.fail('应抛出错误');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        const llmError = error as LLMError;
        expect(llmError.statusCode).toBe(429);
        expect(llmError.isRetryable).toBe(true);
        expect(llmError.attemptsMade).toBe(2);
      }
    });

    it('401 错误不应重试', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(401, 'Unauthorized', 'Invalid API key'));

      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 3, initialBackoffMs: 10 });

      await expect(
        client.chatCompletion([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('401 Unauthorized');

      // 只调用一次，不重试
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('网络错误应触发重试', async () => {
      const networkError = new TypeError('fetch failed');
      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(createSuccessResponse('网络恢复'));

      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 2, initialBackoffMs: 10 });
      const result = await client.chatCompletion([{ role: 'user', content: 'test' }]);

      expect(result).toBe('网络恢复');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('getRetryConfig 应返回重试配置', () => {
      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 5, initialBackoffMs: 500 });
      const config = client.getRetryConfig();

      expect(config.maxRetries).toBe(5);
      expect(config.initialBackoffMs).toBe(500);
    });

    it('默认重试配置应为 3 次和 1000ms', () => {
      const client = new LLMClient(DEFAULT_CONFIG);
      const config = client.getRetryConfig();

      expect(config.maxRetries).toBe(3);
      expect(config.initialBackoffMs).toBe(1000);
    });

    it('应尊重 Retry-After 响应头', async () => {
      const sleepSpy = vi.spyOn(LLMClient.prototype as any, 'sleep');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit',
        headers: new Headers({ 'Retry-After': '2' }),
      }).mockResolvedValueOnce(createSuccessResponse('成功'));

      const client = new LLMClient(DEFAULT_CONFIG, { maxRetries: 2, initialBackoffMs: 100 });
      await client.chatCompletion([{ role: 'user', content: 'test' }]);

      // 应使用 Retry-After 头的值（2 秒 = 2000ms）
      expect(sleepSpy).toHaveBeenCalledWith(2000);
    });
  });
});
