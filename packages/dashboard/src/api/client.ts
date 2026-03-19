// ============================================================================
// BeeClaw Dashboard — REST API 客户端
// ============================================================================

import type {
  ServerStatus,
  AgentListResponse,
  AgentDetailData,
  ConsensusResponse,
  HistoryResponse,
  IngestionStatus,
  IngestionSourceStatus,
  TickEventsResponse,
  TickResponsesResponse,
  ForecastResult,
  ForecastJobStatusResponse,
} from '../types';

const BASE_URL = '/api';
const DEFAULT_TIMEOUT_MS = 30_000;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function formatInvalidJSONError(path: string): Error {
  return new Error(`API Error: Invalid JSON response from ${path}`);
}

async function parseJSON<T>(res: Response, path: string): Promise<T> {
  try {
    return await res.json() as T;
  } catch {
    throw formatInvalidJSONError(path);
  }
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`API Timeout: ${DEFAULT_TIMEOUT_MS}ms`, { cause: error });
    }
    throw error;
  }
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return parseJSON<T>(res, path);
}

/** 获取服务器状态 */
export function fetchStatus(): Promise<ServerStatus> {
  return fetchJSON<ServerStatus>('/status');
}

/** 获取 Agent 列表（分页） */
export function fetchAgents(page = 1, size = 20): Promise<AgentListResponse> {
  return fetchJSON<AgentListResponse>(`/agents?page=${page}&size=${size}`);
}

/** 获取 Agent 详情 */
export function fetchAgent(id: string): Promise<AgentDetailData> {
  return fetchJSON<AgentDetailData>(`/agents/${id}`);
}

/** 获取共识信号 */
export function fetchConsensus(topic?: string): Promise<ConsensusResponse> {
  const qs = topic ? `?topic=${encodeURIComponent(topic)}` : '';
  return fetchJSON<ConsensusResponse>(`/consensus${qs}`);
}

/** 获取历史记录 */
export function fetchHistory(limit = 50): Promise<HistoryResponse> {
  return fetchJSON<HistoryResponse>(`/history?limit=${limit}`);
}

/** 注入事件 */
export async function injectEvent(body: {
  title: string;
  content: string;
  category?: string;
  importance?: number;
  tags?: string[];
}): Promise<{ ok: boolean }> {
  const path = '/events';
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }
  return parseJSON<{ ok: boolean }>(res, path);
}

/** 获取 Ingestion 状态 */
export function fetchIngestionStatus(): Promise<IngestionStatus> {
  return fetchJSON<IngestionStatus>('/ingestion');
}

/** 获取单个数据源详情 */
export function fetchIngestionSource(sourceId: string): Promise<IngestionSourceStatus> {
  return fetchJSON<IngestionSourceStatus>(`/ingestion/${sourceId}`);
}

/** 新增 RSS 数据源 */
export async function addRssSource(source: {
  id: string; name: string; url: string; category?: string; tags?: string[]; pollIntervalMs?: number; enabled?: boolean;
}): Promise<{ ok: boolean; id: string }> {
  const path = '/ingestion/sources';
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return parseJSON<{ ok: boolean; id: string }>(res, path);
}

/** 更新 RSS 数据源 */
export async function updateRssSource(sourceId: string, updates: {
  name?: string; url?: string; category?: string; tags?: string[]; pollIntervalMs?: number; enabled?: boolean;
}): Promise<{ ok: boolean }> {
  const path = `/ingestion/sources/${sourceId}`;
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return parseJSON<{ ok: boolean }>(res, path);
}

/** 删除 RSS 数据源 */
export async function deleteRssSource(sourceId: string): Promise<{ ok: boolean }> {
  const path = `/ingestion/sources/${sourceId}`;
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return parseJSON<{ ok: boolean }>(res, path);
}

/** 获取 Tick 的事件 */
export function fetchTickEvents(tick: number): Promise<TickEventsResponse> {
  return fetchJSON<TickEventsResponse>(`/ticks/${tick}/events`);
}

/** 获取 Tick 的响应 */
export function fetchTickResponses(tick: number): Promise<TickResponsesResponse> {
  return fetchJSON<TickResponsesResponse>(`/ticks/${tick}/responses`);
}

export async function forecastScenario(body: {
  event: string;
  scenario: 'hot-event' | 'product-launch' | 'policy-impact' | 'roundtable';
  ticks?: number;
}): Promise<ForecastResult> {
  const startRes = await fetchWithTimeout(`${BASE_URL}/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!startRes.ok) {
    const detail = await startRes.json().catch(() => null);
    const msg = (detail && typeof detail === 'object' && 'error' in detail)
      ? (detail as { error: string }).error
      : `${startRes.status} ${startRes.statusText}`;
    throw new Error(`API Error: ${msg}`);
  }

  const startData = await startRes.json() as ForecastJobStatusResponse;
  const startedAt = Date.now();
  const maxWaitMs = 180_000;

  while (Date.now() - startedAt < maxWaitMs) {
    const pollRes = await fetchWithTimeout(`${BASE_URL}/forecast/${startData.jobId}`);
    if (!pollRes.ok) {
      throw new Error(`API Error: ${pollRes.status} ${pollRes.statusText}`);
    }
    const pollData = await pollRes.json() as ForecastJobStatusResponse;

    if (pollData.status === 'completed' && pollData.result) {
      return pollData.result;
    }

    if (pollData.status === 'failed') {
      throw new Error(`API Error: ${pollData.error ?? 'forecast job failed'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`API Timeout: forecast job exceeded ${maxWaitMs}ms`);
}
