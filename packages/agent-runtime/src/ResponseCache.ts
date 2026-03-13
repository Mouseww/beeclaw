// ============================================================================
// ResponseCache — LLM 响应缓存层
// 基于 content-hash 的相似 prompt 缓存，支持 TTL 和命中率统计
// ============================================================================

import crypto from 'node:crypto';

/**
 * 缓存条目
 */
export interface CacheEntry {
  /** 缓存的 LLM 响应文本 */
  response: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 过期时间戳 */
  expiresAt: number;
  /** 被命中的次数 */
  hitCount: number;
  /** 原始 prompt hash */
  hash: string;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /** 缓存条目总数 */
  size: number;
  /** 缓存命中次数 */
  hits: number;
  /** 缓存未命中次数 */
  misses: number;
  /** 命中率 (0-1) */
  hitRate: number;
  /** 过期清除的条目数 */
  evictions: number;
}

/**
 * 缓存配置
 */
export interface ResponseCacheConfig {
  /** 缓存条目的 TTL（毫秒），默认 5 分钟 */
  ttlMs: number;
  /** 最大缓存条目数，默认 1000 */
  maxEntries: number;
  /** 是否启用缓存，默认 true */
  enabled: boolean;
}

const DEFAULT_CONFIG: ResponseCacheConfig = {
  ttlMs: 5 * 60 * 1000, // 5 分钟
  maxEntries: 1000,
  enabled: true,
};

export class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: ResponseCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(config?: Partial<ResponseCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 为消息列表生成 content hash
   * 将消息序列化后取 SHA-256 摘要
   */
  computeHash(messages: Array<{ role: string; content: string }>): string {
    const serialized = messages
      .map(m => `${m.role}:${m.content}`)
      .join('\n---\n');
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * 从缓存中获取响应
   * @returns 缓存的响应文本，未命中返回 null
   */
  get(hash: string): string | null {
    if (!this.config.enabled) {
      this.stats.misses++;
      return null;
    }

    const entry = this.cache.get(hash);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查 TTL 是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    // 命中
    entry.hitCount++;
    this.stats.hits++;
    return entry.response;
  }

  /**
   * 将响应存入缓存
   */
  set(hash: string, response: string): void {
    if (!this.config.enabled) return;

    // 如果缓存已满，先清理过期条目
    if (this.cache.size >= this.config.maxEntries) {
      this.evictExpired();
    }

    // 如果清理后仍满，移除最旧的条目
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(hash, {
      response,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
      hitCount: 0,
      hash,
    });
  }

  /**
   * 查找并返回缓存响应，或执行 fetcher 函数获取新响应并缓存
   */
  async getOrFetch(
    messages: Array<{ role: string; content: string }>,
    fetcher: () => Promise<string>,
  ): Promise<string> {
    const hash = this.computeHash(messages);
    const cached = this.get(hash);
    if (cached !== null) {
      return cached;
    }

    const response = await fetcher();
    this.set(hash, response);
    return response;
  }

  /**
   * 清理所有过期的缓存条目
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [hash, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(hash);
        evicted++;
      }
    }
    this.stats.evictions += evicted;
    return evicted;
  }

  /**
   * 移除最旧的缓存条目（LRU 近似）
   */
  private evictOldest(): void {
    let oldestHash: string | null = null;
    let oldestTime = Infinity;

    for (const [hash, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      this.cache.delete(oldestHash);
      this.stats.evictions++;
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * 清空整个缓存
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * 获取缓存条目数
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 是否启用
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 动态设置启用/禁用
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * 更新 TTL 配置
   */
  setTTL(ttlMs: number): void {
    this.config.ttlMs = ttlMs;
  }
}
