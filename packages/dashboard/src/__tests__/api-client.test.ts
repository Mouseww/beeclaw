// ============================================================================
// BeeClaw Dashboard — API Client 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchStatus, fetchAgents, fetchAgent, fetchConsensus, fetchHistory, injectEvent } from '../api/client';

// Mock 全局 fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockOkResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  };
}

function mockErrorResponse(status: number, statusText: string) {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error('should not be called')),
  };
}

// ── fetchStatus ──

describe('fetchStatus', () => {
  it('应该请求 /api/status 并返回数据', async () => {
    const data = { tick: 10, agentCount: 50, running: true };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchStatus();

    expect(mockFetch).toHaveBeenCalledWith('/api/status');
    expect(result).toEqual(data);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(500, 'Internal Server Error'));

    await expect(fetchStatus()).rejects.toThrow('API Error: 500 Internal Server Error');
  });
});

// ── fetchAgents ──

describe('fetchAgents', () => {
  it('应该请求带分页参数的 URL', async () => {
    const data = { agents: [], page: 2, size: 10, total: 0, pages: 0 };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchAgents(2, 10);

    expect(mockFetch).toHaveBeenCalledWith('/api/agents?page=2&size=10');
    expect(result).toEqual(data);
  });

  it('默认参数应为 page=1, size=20', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ agents: [] }));

    await fetchAgents();

    expect(mockFetch).toHaveBeenCalledWith('/api/agents?page=1&size=20');
  });
});

// ── fetchAgent ──

describe('fetchAgent', () => {
  it('应该请求指定 ID 的 Agent', async () => {
    const data = { id: 'agent-1', name: 'TestAgent' };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchAgent('agent-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/agents/agent-1');
    expect(result).toEqual(data);
  });
});

// ── fetchConsensus ──

describe('fetchConsensus', () => {
  it('无 topic 参数时不带 query string', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ topics: [], latest: [] }));

    await fetchConsensus();

    expect(mockFetch).toHaveBeenCalledWith('/api/consensus');
  });

  it('有 topic 参数时应正确编码', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ topics: ['BTC'], latest: [] }));

    await fetchConsensus('BTC 行情');

    expect(mockFetch).toHaveBeenCalledWith('/api/consensus?topic=BTC%20%E8%A1%8C%E6%83%85');
  });
});

// ── fetchHistory ──

describe('fetchHistory', () => {
  it('应该带 limit 参数请求', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ history: [], source: 'memory' }));

    await fetchHistory(30);

    expect(mockFetch).toHaveBeenCalledWith('/api/history?limit=30');
  });

  it('默认 limit 应为 50', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ history: [] }));

    await fetchHistory();

    expect(mockFetch).toHaveBeenCalledWith('/api/history?limit=50');
  });
});

// ── injectEvent ──

describe('injectEvent', () => {
  it('应该发送 POST 请求并返回结果', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

    const body = {
      title: '测试事件',
      content: '这是测试',
      category: 'tech',
      importance: 0.8,
    };

    const result = await injectEvent(body);

    expect(mockFetch).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ ok: true });
  });

  it('API 返回错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(400, 'Bad Request'));

    await expect(injectEvent({ title: 'x', content: 'y' })).rejects.toThrow('API Error: 400');
  });
});
