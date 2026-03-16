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
} from '../types';

const BASE_URL = '/api';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
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
  const res = await fetch(`${BASE_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
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
  const res = await fetch(`${BASE_URL}/ingestion/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

/** 更新 RSS 数据源 */
export async function updateRssSource(sourceId: string, updates: {
  name?: string; url?: string; category?: string; tags?: string[]; pollIntervalMs?: number; enabled?: boolean;
}): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/ingestion/sources/${sourceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

/** 删除 RSS 数据源 */
export async function deleteRssSource(sourceId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/ingestion/sources/${sourceId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

/** 获取 Tick 的事件 */
export function fetchTickEvents(tick: number): Promise<{ events: any[]; total: number }> {
  return fetchJSON(`/ticks/${tick}/events`);
}

/** 获取 Tick 的响应 */
export function fetchTickResponses(tick: number): Promise<{ responses: any[]; total: number }> {
  return fetchJSON(`/ticks/${tick}/responses`);
}
