// ============================================================================
// AgentMemory — Agent 记忆系统（短期记忆 + 长期记忆 + 观点记忆）
// ============================================================================

import type {
  AgentMemoryState,
  CompressedMemory,
  MemoryEntry,
  MemoryType,
  Opinion,
} from '@beeclaw/shared';
import type { LLMClient } from './LLMClient.js';

const MAX_SHORT_TERM = 50;

/** 短期记忆超过此阈值时，compress() 会触发压缩 */
const COMPRESS_THRESHOLD = 30;

/** 压缩后保留的最近记忆数量（不会被压缩掉） */
const COMPRESS_KEEP_RECENT = 10;

export class AgentMemory {
  private state: AgentMemoryState;

  constructor(initialState?: AgentMemoryState) {
    this.state = initialState ?? {
      shortTerm: [],
      longTerm: [],
      opinions: {},
      predictions: [],
    };
  }

  /**
   * 添加一条短期记忆
   */
  addShortTermMemory(entry: MemoryEntry): void {
    this.state.shortTerm.push(entry);
    // FIFO: 超出上限时移除最旧的
    while (this.state.shortTerm.length > MAX_SHORT_TERM) {
      this.state.shortTerm.shift();
    }
  }

  /**
   * 快捷添加记忆条目
   */
  remember(tick: number, type: MemoryType, content: string, importance: number = 0.5, emotionalImpact: number = 0): void {
    this.addShortTermMemory({ tick, type, content, importance, emotionalImpact });
  }

  /**
   * 获取最近 N 条短期记忆
   */
  getRecentMemories(n: number = 10): MemoryEntry[] {
    return this.state.shortTerm.slice(-n);
  }

  /**
   * 获取所有短期记忆
   */
  getShortTermMemories(): MemoryEntry[] {
    return [...this.state.shortTerm];
  }

  /**
   * 更新或创建观点
   */
  updateOpinion(topic: string, stance: number, confidence: number, reasoning: string, tick: number): void {
    this.state.opinions[topic] = {
      topic,
      stance: Math.max(-1, Math.min(1, stance)),
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
      lastUpdatedTick: tick,
    };
  }

  /**
   * 获取对某话题的观点
   */
  getOpinion(topic: string): Opinion | undefined {
    return this.state.opinions[topic];
  }

  /**
   * 获取所有观点
   */
  getAllOpinions(): Record<string, Opinion> {
    return { ...this.state.opinions };
  }

  /**
   * 添加预测记录
   */
  addPrediction(tick: number, prediction: string): void {
    this.state.predictions.push({ tick, prediction });
  }

  // ── 长期记忆 ──

  /**
   * 获取所有长期记忆（压缩摘要）
   */
  getLongTermMemories(): CompressedMemory[] {
    return [...this.state.longTerm];
  }

  /**
   * 是否需要压缩（短期记忆超过阈值）
   */
  needsCompression(): boolean {
    return this.state.shortTerm.length >= COMPRESS_THRESHOLD;
  }

  /**
   * 压缩短期记忆为长期记忆
   *
   * 当短期记忆超过 COMPRESS_THRESHOLD 条时：
   * 1. 取出最旧的一批记忆（保留最近 COMPRESS_KEEP_RECENT 条不动）
   * 2. 调用 LLM 生成摘要和关键洞察
   * 3. 将摘要存入长期记忆
   * 4. 从短期记忆中移除已压缩的旧记忆
   * 5. 观点记忆始终保留，不受压缩影响
   */
  async compress(llmClient: LLMClient): Promise<CompressedMemory | null> {
    if (!this.needsCompression()) {
      return null;
    }

    const total = this.state.shortTerm.length;
    const toCompressCount = total - COMPRESS_KEEP_RECENT;

    if (toCompressCount <= 0) {
      return null;
    }

    // 取出要压缩的记忆（最旧的一批）
    const toCompress = this.state.shortTerm.slice(0, toCompressCount);
    const tickRange: [number, number] = [
      toCompress[0]!.tick,
      toCompress[toCompress.length - 1]!.tick,
    ];

    // 收集这段时间内观点的变化记录（作为额外上下文）
    const relevantOpinionChanges = this.collectOpinionChangesInRange(tickRange);

    // 构建压缩 prompt
    const prompt = this.buildCompressionPrompt(toCompress, relevantOpinionChanges);

    try {
      const rawResponse = await llmClient.chatCompletion([
        {
          role: 'system',
          content: '你是一个记忆压缩助手。你需要将一系列离散的记忆条目压缩成一段简洁的摘要，并提取关键洞察。请用中文回复，以 JSON 格式返回。',
        },
        { role: 'user', content: prompt },
      ]);

      // 解析 LLM 响应
      const compressed = this.parseCompressionResponse(rawResponse, tickRange);

      // 存入长期记忆
      this.state.longTerm.push(compressed);

      // 移除已压缩的短期记忆
      this.state.shortTerm = this.state.shortTerm.slice(toCompressCount);

      console.log(
        `[AgentMemory] 压缩了 ${toCompressCount} 条短期记忆 (Tick ${tickRange[0]}-${tickRange[1]})，当前短期 ${this.state.shortTerm.length} 条，长期 ${this.state.longTerm.length} 条`
      );

      return compressed;
    } catch (error) {
      console.error('[AgentMemory] 记忆压缩失败，使用本地摘要:', error);
      // 降级：用简单的本地摘要代替 LLM 摘要
      const fallback = this.buildFallbackCompression(toCompress, tickRange);
      this.state.longTerm.push(fallback);
      this.state.shortTerm = this.state.shortTerm.slice(toCompressCount);
      return fallback;
    }
  }

  /**
   * 收集指定 tick 范围内的观点变化
   */
  private collectOpinionChangesInRange(tickRange: [number, number]): string[] {
    const changes: string[] = [];
    for (const opinion of Object.values(this.state.opinions)) {
      if (
        opinion.lastUpdatedTick >= tickRange[0] &&
        opinion.lastUpdatedTick <= tickRange[1]
      ) {
        const stanceStr = opinion.stance > 0 ? '看多' : opinion.stance < 0 ? '看空' : '中立';
        changes.push(
          `Tick ${opinion.lastUpdatedTick}: 对"${opinion.topic}"形成了${stanceStr}(${opinion.stance.toFixed(2)})的观点 — ${opinion.reasoning}`
        );
      }
    }
    return changes;
  }

  /**
   * 构建压缩 prompt
   */
  private buildCompressionPrompt(memories: MemoryEntry[], opinionChanges: string[]): string {
    const lines: string[] = [];

    lines.push(`以下是 ${memories.length} 条按时间排序的记忆条目，请压缩成一段摘要：`);
    lines.push('');

    for (const mem of memories) {
      const impStr = (mem.importance * 100).toFixed(0);
      lines.push(`- [Tick ${mem.tick}] (${mem.type}, 重要性 ${impStr}%) ${mem.content}`);
    }

    if (opinionChanges.length > 0) {
      lines.push('');
      lines.push('## 期间的观点变化：');
      for (const change of opinionChanges) {
        lines.push(`- ${change}`);
      }
    }

    lines.push('');
    lines.push('请返回 JSON 格式：');
    lines.push('{');
    lines.push('  "summary": "简洁的综合摘要（100-200字）",');
    lines.push('  "keyInsights": ["关键洞察1", "关键洞察2", ...]');
    lines.push('}');
    lines.push('');
    lines.push('要求：');
    lines.push('1. summary 应该是连贯的叙述，保留重要信息和因果关系');
    lines.push('2. keyInsights 提取 3-5 个最重要的发现或转变');
    lines.push('3. 如果有观点变化，务必在 keyInsights 中体现');

    return lines.join('\n');
  }

  /**
   * 解析 LLM 的压缩响应
   */
  private parseCompressionResponse(raw: string, tickRange: [number, number]): CompressedMemory {
    try {
      // 尝试从响应中提取 JSON
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; keyInsights?: string[] };
        if (typeof parsed.summary === 'string' && Array.isArray(parsed.keyInsights)) {
          return {
            summary: parsed.summary,
            tickRange,
            keyInsights: parsed.keyInsights.filter((s): s is string => typeof s === 'string'),
            createdAt: Date.now(),
          };
        }
      }
    } catch {
      // JSON 解析失败，降级处理
    }

    // 如果无法解析 JSON，将整个响应作为摘要
    return {
      summary: raw.slice(0, 500),
      tickRange,
      keyInsights: ['LLM 响应格式异常，已保留原始文本'],
      createdAt: Date.now(),
    };
  }

  /**
   * 降级本地压缩（不依赖 LLM）
   */
  private buildFallbackCompression(memories: MemoryEntry[], tickRange: [number, number]): CompressedMemory {
    // 按重要性排序，取最重要的几条
    const sorted = [...memories].sort((a, b) => b.importance - a.importance);
    const topMemories = sorted.slice(0, 5);

    const summary = `Tick ${tickRange[0]}-${tickRange[1]} 期间共有 ${memories.length} 条记忆。` +
      `最重要的事件包括：${topMemories.map(m => m.content).join('；')}`;

    const keyInsights = topMemories.map(m =>
      `[Tick ${m.tick}] ${m.content}`
    );

    return {
      summary: summary.slice(0, 500),
      tickRange,
      keyInsights,
      createdAt: Date.now(),
    };
  }

  /**
   * 从已有状态恢复记忆（用于反序列化）
   */
  restore(state: AgentMemoryState): void {
    this.state = {
      shortTerm: [...state.shortTerm],
      longTerm: [...state.longTerm],
      opinions: { ...state.opinions },
      predictions: [...state.predictions],
    };
  }

  /**
   * 获取记忆状态的快照（用于序列化）
   */
  getState(): AgentMemoryState {
    return {
      shortTerm: [...this.state.shortTerm],
      longTerm: [...this.state.longTerm],
      opinions: { ...this.state.opinions },
      predictions: [...this.state.predictions],
    };
  }

  /**
   * 构建记忆上下文（注入到 LLM prompt 中）
   */
  buildMemoryContext(): string {
    const parts: string[] = [];

    // 长期记忆摘要（压缩后的历史）
    if (this.state.longTerm.length > 0) {
      parts.push('## 你的历史记忆摘要');
      for (const lt of this.state.longTerm) {
        parts.push(`- [Tick ${lt.tickRange[0]}-${lt.tickRange[1]}] ${lt.summary}`);
        if (lt.keyInsights.length > 0) {
          parts.push(`  关键洞察: ${lt.keyInsights.join('; ')}`);
        }
      }
    }

    // 最近的记忆
    const recent = this.getRecentMemories(10);
    if (recent.length > 0) {
      parts.push('## 你的最近记忆');
      for (const mem of recent) {
        parts.push(`- [Tick ${mem.tick}] (${mem.type}) ${mem.content}`);
      }
    }

    // 当前观点
    const opinions = Object.values(this.state.opinions);
    if (opinions.length > 0) {
      parts.push('\n## 你当前的观点');
      for (const op of opinions) {
        const stanceStr = op.stance > 0 ? `看多(${op.stance.toFixed(2)})` :
          op.stance < 0 ? `看空(${op.stance.toFixed(2)})` : '中立';
        parts.push(`- ${op.topic}: ${stanceStr}，置信度 ${(op.confidence * 100).toFixed(0)}% — ${op.reasoning}`);
      }
    }

    return parts.join('\n');
  }
}
