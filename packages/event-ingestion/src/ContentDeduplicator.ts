// ============================================================================
// ContentDeduplicator — 跨数据源内容去重器
// 支持标题相似度 + 内容哈希双重去重策略
// ============================================================================

import { createHash } from 'crypto';
import type { IngestedEvent } from './types.js';

/** 去重结果 */
export interface DeduplicationResult {
  /** 是否为重复内容 */
  isDuplicate: boolean;
  /** 重复原因（如有） */
  reason?: 'exact_id' | 'content_hash' | 'title_similarity';
  /** 匹配到的已有事件 ID（如有） */
  matchedId?: string;
}

/** 去重缓存条目 */
interface CacheEntry {
  /** 原始去重 ID */
  deduplicationId: string;
  /** 内容哈希 */
  contentHash: string;
  /** 标题（归一化后） */
  normalizedTitle: string;
  /** 插入时间 */
  timestamp: number;
}

export class ContentDeduplicator {
  /** 去重缓存：deduplicationId → CacheEntry */
  private cache: Map<string, CacheEntry> = new Map();
  /** 内容哈希索引：contentHash → deduplicationId */
  private hashIndex: Map<string, string> = new Map();
  /** 标题索引：normalizedTitle → deduplicationId（用于精确匹配加速） */
  private titleIndex: Map<string, string> = new Map();
  /** 最大缓存大小 */
  private maxSize: number;
  /** 标题相似度阈值 (0-1，超过此值判定为重复) */
  private titleSimilarityThreshold: number;

  constructor(options?: {
    maxSize?: number;
    titleSimilarityThreshold?: number;
  }) {
    this.maxSize = options?.maxSize ?? 10_000;
    this.titleSimilarityThreshold = options?.titleSimilarityThreshold ?? 0.85;
  }

  /**
   * 检查事件是否重复
   */
  check(event: IngestedEvent): DeduplicationResult {
    const dedupId = event.deduplicationId ?? this.generateId(event);

    // 策略 1：精确 ID 匹配
    if (this.cache.has(dedupId)) {
      return { isDuplicate: true, reason: 'exact_id', matchedId: dedupId };
    }

    // 策略 2：内容哈希匹配
    const contentHash = this.computeContentHash(event);
    const hashMatch = this.hashIndex.get(contentHash);
    if (hashMatch) {
      return { isDuplicate: true, reason: 'content_hash', matchedId: hashMatch };
    }

    // 策略 3：标题相似度匹配
    const normalizedTitle = this.normalizeTitle(event.title);
    // 先尝试精确标题匹配（O(1)）
    const exactTitleMatch = this.titleIndex.get(normalizedTitle);
    if (exactTitleMatch) {
      return { isDuplicate: true, reason: 'title_similarity', matchedId: exactTitleMatch };
    }

    // 模糊标题匹配（仅在缓存较小时执行，避免性能问题）
    if (this.cache.size <= 5000) {
      for (const entry of this.cache.values()) {
        const similarity = this.computeTitleSimilarity(normalizedTitle, entry.normalizedTitle);
        if (similarity >= this.titleSimilarityThreshold) {
          return {
            isDuplicate: true,
            reason: 'title_similarity',
            matchedId: entry.deduplicationId,
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * 将事件记录到去重缓存
   */
  record(event: IngestedEvent): void {
    const dedupId = event.deduplicationId ?? this.generateId(event);
    const contentHash = this.computeContentHash(event);
    const normalizedTitle = this.normalizeTitle(event.title);

    const entry: CacheEntry = {
      deduplicationId: dedupId,
      contentHash,
      normalizedTitle,
      timestamp: Date.now(),
    };

    this.cache.set(dedupId, entry);
    this.hashIndex.set(contentHash, dedupId);
    this.titleIndex.set(normalizedTitle, dedupId);

    this.trimCache();
  }

  /**
   * 检查并记录（原子操作）：如果不重复则记录，返回去重结果
   */
  checkAndRecord(event: IngestedEvent): DeduplicationResult {
    const result = this.check(event);
    if (!result.isDuplicate) {
      this.record(event);
    }
    return result;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.hashIndex.clear();
    this.titleIndex.clear();
  }

  // ── 内部方法 ──

  /**
   * 为没有 deduplicationId 的事件生成一个
   */
  private generateId(event: IngestedEvent): string {
    return createHash('sha256')
      .update(`${event.source}:${event.title}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * 计算内容哈希（基于标题+内容前 500 字）
   */
  computeContentHash(event: IngestedEvent): string {
    const text = `${event.title}\n${event.content.slice(0, 500)}`;
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * 标题归一化（去除空白、标点、转小写）
   */
  normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[\s\u3000]+/g, ' ')     // 统一空白符
      .replace(/[.,;:!?，。；：！？""''「」【】《》\-–—]/g, '') // 去标点
      .trim();
  }

  /**
   * 计算两个标题的相似度（Dice 系数，基于 gram）
   * 中文字符使用 unigram（单字），非中文字符使用 bigram
   * 返回 0-1，1 表示完全一致
   */
  computeTitleSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const gramsA = this.getGrams(a);
    const gramsB = this.getGrams(b);

    if (gramsA.length === 0 || gramsB.length === 0) return 0;

    let intersection = 0;
    const countB = new Map<string, number>();
    for (const g of gramsB) {
      countB.set(g, (countB.get(g) ?? 0) + 1);
    }

    for (const g of gramsA) {
      const count = countB.get(g);
      if (count && count > 0) {
        intersection++;
        countB.set(g, count - 1);
      }
    }

    return (2 * intersection) / (gramsA.length + gramsB.length);
  }

  /**
   * 生成 gram 列表：中文字符用 unigram，非中文用 bigram
   * 这样中文单字作为独立语义单元参与相似度计算，避免 bigram 在仅差数字时过度放大差异
   */
  private getGrams(str: string): string[] {
    const grams: string[] = [];
    const chars = [...str]; // 正确处理 Unicode 字符
    let i = 0;
    while (i < chars.length) {
      if (this.isCJK(chars[i]!)) {
        // 中文/CJK 字符：使用 unigram
        grams.push(chars[i]!);
        i++;
      } else {
        // 非 CJK 字符：使用 bigram
        if (i + 1 < chars.length) {
          grams.push(chars[i]! + chars[i + 1]!);
        }
        i++;
      }
    }
    return grams;
  }

  /** 判断字符是否为 CJK 统一表意文字 */
  private isCJK(char: string): boolean {
    const code = char.codePointAt(0)!;
    return (
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK 统一表意文字
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK 统一表意文字扩展 A
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK 统一表意文字扩展 B
      (code >= 0xF900 && code <= 0xFAFF)      // CJK 兼容表意文字
    );
  }

  /**
   * 维护缓存大小：淘汰最旧的条目
   */
  private trimCache(): void {
    if (this.cache.size <= this.maxSize) return;

    // 按插入时间排序，删除最旧的
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const excess = this.cache.size - this.maxSize;
    for (let i = 0; i < excess; i++) {
      const [key, entry] = entries[i]!;
      this.cache.delete(key);
      this.hashIndex.delete(entry.contentHash);
      this.titleIndex.delete(entry.normalizedTitle);
    }
  }
}
