// ============================================================================
// AgentMemory — Agent 记忆系统（短期记忆 + 观点记忆）
// ============================================================================

import type {
  AgentMemoryState,
  MemoryEntry,
  MemoryType,
  Opinion,
  PredictionRecord,
} from '@beeclaw/shared';

const MAX_SHORT_TERM = 50;

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
