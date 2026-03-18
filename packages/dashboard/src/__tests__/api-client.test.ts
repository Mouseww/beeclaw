// ============================================================================
// BeeClaw Dashboard — API Client 单元测试
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchStatus,
  fetchAgents,
  fetchAgent,
  fetchConsensus,
  fetchHistory,
  injectEvent,
  fetchIngestionStatus,
  fetchIngestionSource,
  addRssSource,
  updateRssSource,
  deleteRssSource,
  fetchTickEvents,
  fetchTickResponses,
  forecastScenario,
} from '../api/client';

const DEFAULT_TIMEOUT_MS = 30_000;

// Mock 全局 fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal);
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

    expect(mockFetch).toHaveBeenCalledWith('/api/status', {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(data);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(500, 'Internal Server Error'));

    await expect(fetchStatus()).rejects.toThrow('API Error: 500 Internal Server Error');
  });

  it('应该为请求附加默认超时', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ tick: 10, agentCount: 50, running: true }));

    await fetchStatus();

    expect(AbortSignal.timeout).toHaveBeenCalledWith(DEFAULT_TIMEOUT_MS);
    expect(mockFetch).toHaveBeenCalledWith('/api/status', {
      signal: expect.any(AbortSignal),
    });
  });

  it('请求超时时应该抛出明确异常', async () => {
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(timeoutError);

    await expect(fetchStatus()).rejects.toThrow(`API Timeout: ${DEFAULT_TIMEOUT_MS}ms`);
  });
});

// ── fetchAgents ──

describe('fetchAgents', () => {
  it('应该请求带分页参数的 URL', async () => {
    const data = { agents: [], page: 2, size: 10, total: 0, pages: 0 };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchAgents(2, 10);

    expect(mockFetch).toHaveBeenCalledWith('/api/agents?page=2&size=10', {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(data);
  });

  it('默认参数应为 page=1, size=20', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ agents: [] }));

    await fetchAgents();

    expect(mockFetch).toHaveBeenCalledWith('/api/agents?page=1&size=20', {
      signal: expect.any(AbortSignal),
    });
  });
});

// ── fetchAgent ──

describe('fetchAgent', () => {
  it('应该请求指定 ID 的 Agent', async () => {
    const data = { id: 'agent-1', name: 'TestAgent' };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchAgent('agent-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/agents/agent-1', {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(data);
  });
});

// ── fetchConsensus ──

describe('fetchConsensus', () => {
  it('无 topic 参数时不带 query string', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ topics: [], latest: [] }));

    await fetchConsensus();

    expect(mockFetch).toHaveBeenCalledWith('/api/consensus', {
      signal: expect.any(AbortSignal),
    });
  });

  it('有 topic 参数时应正确编码', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ topics: ['BTC'], latest: [] }));

    await fetchConsensus('BTC 行情');

    expect(mockFetch).toHaveBeenCalledWith('/api/consensus?topic=BTC%20%E8%A1%8C%E6%83%85', {
      signal: expect.any(AbortSignal),
    });
  });
});

// ── fetchHistory ──

describe('fetchHistory', () => {
  it('应该带 limit 参数请求', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ history: [], source: 'memory' }));

    await fetchHistory(30);

    expect(mockFetch).toHaveBeenCalledWith('/api/history?limit=30', {
      signal: expect.any(AbortSignal),
    });
  });

  it('默认 limit 应为 50', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ history: [] }));

    await fetchHistory();

    expect(mockFetch).toHaveBeenCalledWith('/api/history?limit=50', {
      signal: expect.any(AbortSignal),
    });
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
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ ok: true });
  });

  it('API 返回错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(400, 'Bad Request'));

    await expect(injectEvent({ title: 'x', content: 'y' })).rejects.toThrow('API Error: 400');
  });

  it('应该包含 tags 字段', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

    const body = {
      title: '标签事件',
      content: '含标签',
      tags: ['crypto', 'btc'],
    };

    await injectEvent(body);

    expect(mockFetch).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: expect.any(AbortSignal),
    });
  });
});

// ── fetchIngestionStatus ──

describe('fetchIngestionStatus', () => {
  it('应该请求 /api/ingestion 并返回数据', async () => {
    const data = { running: true, sourceCount: 3, sources: [] };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchIngestionStatus();

    expect(mockFetch).toHaveBeenCalledWith('/api/ingestion', {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(data);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(503, 'Service Unavailable'));

    await expect(fetchIngestionStatus()).rejects.toThrow('API Error: 503 Service Unavailable');
  });
});

// ── fetchIngestionSource ──

describe('fetchIngestionSource', () => {
  it('应该请求指定 sourceId 的数据源', async () => {
    const data = { id: 'rss-1', name: 'Test RSS', enabled: true };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchIngestionSource('rss-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/ingestion/rss-1', {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(data);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(404, 'Not Found'));

    await expect(fetchIngestionSource('nonexistent')).rejects.toThrow('API Error: 404 Not Found');
  });
});

// ── addRssSource ──

describe('addRssSource', () => {
  it('应该发送 POST 请求新增 RSS 数据源', async () => {
    const responseData = { ok: true, id: 'rss-new' };
    mockFetch.mockResolvedValueOnce(mockOkResponse(responseData));

    const source = {
      id: 'rss-new',
      name: '新闻源',
      url: 'https://example.com/rss',
      category: 'news',
      tags: ['tech'],
      pollIntervalMs: 60000,
      enabled: true,
    };

    const result = await addRssSource(source);

    expect(mockFetch).toHaveBeenCalledWith('/api/ingestion/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source),
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(responseData);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(409, 'Conflict'));

    await expect(addRssSource({ id: 'dup', name: 'Dup', url: 'http://x.com' })).rejects.toThrow('API Error: 409');
  });

  it('最小字段也应正常工作', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true, id: 'min' }));

    const source = { id: 'min', name: '最小源', url: 'http://min.com/rss' };
    const result = await addRssSource(source);

    expect(result).toEqual({ ok: true, id: 'min' });
  });
});

// ── updateRssSource ──

describe('updateRssSource', () => {
  it('应该发送 PUT 请求更新 RSS 数据源', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

    const updates = { name: '更新名称', enabled: false };
    const result = await updateRssSource('rss-1', updates);

    expect(mockFetch).toHaveBeenCalledWith('/api/ingestion/sources/rss-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ ok: true });
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(404, 'Not Found'));

    await expect(updateRssSource('nonexistent', { name: 'x' })).rejects.toThrow('API Error: 404');
  });

  it('部分字段更新应正常工作', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

    const updates = { pollIntervalMs: 120000 };
    await updateRssSource('rss-1', updates);

    expect(mockFetch).toHaveBeenCalledWith('/api/ingestion/sources/rss-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      signal: expect.any(AbortSignal),
    });
  });
});

// ── deleteRssSource ──

describe('deleteRssSource', () => {
  it('应该发送 DELETE 请求删除 RSS 数据源', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

    const result = await deleteRssSource('rss-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/ingestion/sources/rss-1', {
      method: 'DELETE',
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ ok: true });
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(404, 'Not Found'));

    await expect(deleteRssSource('nonexistent')).rejects.toThrow('API Error: 404');
  });
});

// ── fetchTickEvents ──

describe('fetchTickEvents', () => {
  it('应该请求指定 tick 的事件', async () => {
    const data = { events: [{ id: 'e1', title: '事件1' }], total: 1 };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchTickEvents(42);

    expect(mockFetch).toHaveBeenCalledWith('/api/ticks/42/events', {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(data);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(404, 'Not Found'));

    await expect(fetchTickEvents(999)).rejects.toThrow('API Error: 404 Not Found');
  });
});

// ── fetchTickResponses ──

describe('fetchTickResponses', () => {
  it('应该请求指定 tick 的响应', async () => {
    const data = { responses: [{ agentId: 'a1', opinion: '看多' }], total: 1 };
    mockFetch.mockResolvedValueOnce(mockOkResponse(data));

    const result = await fetchTickResponses(42);

    expect(mockFetch).toHaveBeenCalledWith('/api/ticks/42/responses', {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(data);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(500, 'Internal Server Error'));

    await expect(fetchTickResponses(0)).rejects.toThrow('API Error: 500 Internal Server Error');
  });
});

// ── forecastScenario ──

describe('forecastScenario', () => {
  it('应该发送 POST 请求到 /api/forecast 并返回结果', async () => {
    const responseData = {
      scenario: 'hot-event',
      scenarioLabel: '热点事件预测',
      event: '央行加息',
      summary: '多数 Agent 认为利空...',
      factions: [],
      keyReactions: [],
      risks: [],
      recommendations: [],
      metrics: { agentCount: 50, ticks: 4, responsesCollected: 120, averageActivatedAgents: 30, consensusSignals: 3, finalTick: 4 },
    };
    mockFetch.mockResolvedValueOnce(mockOkResponse(responseData));

    const body = { event: '央行加息', scenario: 'hot-event' as const, ticks: 4 };
    const result = await forecastScenario(body);

    expect(mockFetch).toHaveBeenCalledWith('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(responseData);
  });

  it('API 错误时应该抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(422, 'Unprocessable Entity'));

    await expect(
      forecastScenario({ event: '', scenario: 'hot-event', ticks: 4 }),
    ).rejects.toThrow('API Error: 422');
  });

  it('应该支持不同场景类型', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ scenario: 'roundtable' }));

    const body = { event: 'AI 监管政策', scenario: 'roundtable' as const };
    await forecastScenario(body);

    expect(mockFetch).toHaveBeenCalledWith('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: expect.any(AbortSignal),
    });
  });
});
