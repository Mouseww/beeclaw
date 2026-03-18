// ============================================================================
// BeeClaw Shared Utilities — 通用工具函数
// ============================================================================

import crypto from 'node:crypto';

/**
 * 生成唯一 ID
 */
export function generateId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * 将数值限制在指定范围内
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 在指定范围内生成随机数
 */
export function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * 从数组中随机选取一个元素
 */
export function randomPick<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('Cannot pick from empty array');
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * 从数组中随机选取 n 个不重复元素
 */
export function randomSample<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

/**
 * 延迟指定毫秒
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全的 JSON 解析，失败返回 null
 */
export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * 从文本中提取 JSON 块
 * 支持提取被 ```json ... ``` 包裹的或者裸 JSON
 */
export function extractJson<T>(text: string): T | null {
  // 尝试提取 markdown code block 中的 JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch?.[1]) {
    const parsed = safeJsonParse<T>(codeBlockMatch[1].trim());
    if (parsed !== null) return parsed;
  }

  // 尝试提取第一个 { ... } 或 [ ... ] 块
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch?.[1]) {
    const parsed = safeJsonParse<T>(jsonMatch[1].trim());
    if (parsed !== null) return parsed;
  }

  // 尝试直接解析整个文本
  return safeJsonParse<T>(text.trim());
}

/**
 * 格式化时间戳为可读字符串
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * 计算两个值的加权移动平均
 */
export function weightedAverage(oldValue: number, newValue: number, weight: number): number {
  return oldValue * (1 - weight) + newValue * weight;
}

/**
 * 截断字符串到指定长度
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  if (maxLen <= 3) return str.slice(0, Math.max(maxLen, 0));
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * 分批处理数组
 */
export async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('[BeeClaw] Batch item failed:', result.reason);
      }
    }
  }
  return results;
}
