// ============================================================================
// LLMClient — 手写 OpenAI 兼容 API 调用（fetch 实现）
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

export class LLMClient {
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: LLMConfig) {
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 2048;
    this.temperature = config.temperature ?? 0.7;
  }

  /**
   * 发送 chat completion 请求
   */
  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    const url = `${this.baseURL}/v1/chat/completions`;
    const body = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `LLM API error: ${response.status} ${response.statusText} — ${errorText}`
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM API returned empty response');
    }

    return content;
  }

  /**
   * 获取当前模型 ID
   */
  getModel(): string {
    return this.model;
  }
}
