// ============================================================================
// Agent — Agent 核心类，完整 LLM Agent 实现
// ============================================================================

import type {
  BeeAgent,
  AgentPersona,
  AgentResponse,
  WorldEvent,
  ModelTier,
  AgentStatus,
} from '@beeclaw/shared';
import { generateId, extractJson, clamp } from '@beeclaw/shared';
import { AgentMemory } from './AgentMemory.js';
import { buildSystemPrompt, generateAgentName, generatePersona } from './AgentPersona.js';
import type { ModelRouter } from './ModelRouter.js';
import type { ChatMessage } from './LLMClient.js';

export class Agent {
  readonly id: string;
  readonly name: string;
  readonly persona: AgentPersona;
  readonly memory: AgentMemory;
  readonly modelTier: ModelTier;

  private _status: AgentStatus;
  private _influence: number;
  private _credibility: number;
  private _spawnedAtTick: number;
  private _lastActiveTick: number;
  private _followersSet: Set<string>;
  private _followingSet: Set<string>;
  private _systemPrompt: string;

  constructor(
    options: {
      id?: string;
      name?: string;
      persona?: AgentPersona;
      modelTier?: ModelTier;
      spawnedAtTick?: number;
    } = {}
  ) {
    this.id = options.id ?? generateId('agent');
    this.name = options.name ?? generateAgentName();
    this.persona = options.persona ?? generatePersona();
    this.modelTier = options.modelTier ?? 'cheap';
    this.memory = new AgentMemory();

    this._status = 'active';
    this._influence = Math.floor(Math.random() * 30) + 10;
    this._credibility = 0.5;
    this._spawnedAtTick = options.spawnedAtTick ?? 0;
    this._lastActiveTick = this._spawnedAtTick;
    this._followersSet = new Set<string>();
    this._followingSet = new Set<string>();
    this._systemPrompt = buildSystemPrompt(this.persona, this.name);
  }

  // ── Getters ──

  get status(): AgentStatus { return this._status; }
  get influence(): number { return this._influence; }
  get credibility(): number { return this._credibility; }
  get spawnedAtTick(): number { return this._spawnedAtTick; }
  get lastActiveTick(): number { return this._lastActiveTick; }
  get followers(): string[] { return [...this._followersSet]; }
  get following(): string[] { return [...this._followingSet]; }
  get followerCount(): number { return this._followersSet.size; }
  get followingCount(): number { return this._followingSet.size; }

  // ── 状态管理 ──

  setStatus(status: AgentStatus): void {
    this._status = status;
  }

  /**
   * 添加追随者（O(1) 复杂度）
   */
  addFollower(agentId: string): void {
    this._followersSet.add(agentId);
  }

  /**
   * 移除追随者（O(1) 复杂度）
   */
  removeFollower(agentId: string): void {
    this._followersSet.delete(agentId);
  }

  /**
   * 检查是否有追随者
   */
  hasFollower(agentId: string): boolean {
    return this._followersSet.has(agentId);
  }

  /**
   * 关注某 Agent（O(1) 复杂度）
   */
  follow(agentId: string): void {
    this._followingSet.add(agentId);
  }

  /**
   * 取消关注某 Agent（O(1) 复杂度）
   */
  unfollow(agentId: string): void {
    this._followingSet.delete(agentId);
  }

  /**
   * 检查是否关注某 Agent
   */
  isFollowing(agentId: string): boolean {
    return this._followingSet.has(agentId);
  }

  updateInfluence(delta: number): void {
    this._influence = clamp(this._influence + delta, 0, 100);
  }

  updateCredibility(delta: number): void {
    this._credibility = clamp(this._credibility + delta, 0, 1);
  }

  // ── 核心方法：对事件做出反应 ──

  /**
   * Agent 对一个世界事件做出反应
   * 调用 LLM 生成结构化响应
   */
  async react(event: WorldEvent, modelRouter: ModelRouter, currentTick: number): Promise<AgentResponse> {
    this._lastActiveTick = currentTick;

    const client = modelRouter.getClient(this.modelTier);

    // 构建消息列表
    const messages: ChatMessage[] = [
      { role: 'system', content: this._systemPrompt },
    ];

    // 注入记忆上下文
    const memoryContext = this.memory.buildMemoryContext();
    if (memoryContext) {
      messages.push({ role: 'user', content: `[记忆上下文]\n${memoryContext}` });
      messages.push({ role: 'assistant', content: '我已了解自己的记忆和观点，请告诉我最新的事件。' });
    }

    // 注入事件
    const eventPrompt = `[世界事件 - Tick ${event.tick}]
类别：${event.category}
标题：${event.title}
内容：${event.content}
来源：${event.source}
重要性：${(event.importance * 100).toFixed(0)}%
标签：${event.tags.join(', ')}

请以你的身份做出回应，用 JSON 格式返回你的观点和行为。`;

    messages.push({ role: 'user', content: eventPrompt });

    try {
      const rawResponse = await client.chatCompletion(messages);
      const parsed = extractJson<AgentResponse>(rawResponse);

      if (!parsed) {
        console.warn(`[Agent ${this.name}] 无法解析 LLM 响应为 JSON，使用默认响应`);
        return this.buildDefaultResponse(event);
      }

      // 验证并规范化响应
      const response = this.normalizeResponse(parsed);

      // 更新记忆
      this.memory.remember(
        currentTick,
        'event',
        `事件: ${event.title} — 我的看法: ${response.opinion}`,
        event.importance,
        response.emotionalState
      );

      // 更新观点
      if (response.newOpinions) {
        for (const [topic, opinion] of Object.entries(response.newOpinions)) {
          this.memory.updateOpinion(topic, opinion.stance, opinion.confidence, response.opinion, currentTick);
        }
      }

      // 如果是预测行为，记录预测
      if (response.action === 'predict' && response.reasoning) {
        this.memory.addPrediction(currentTick, response.reasoning);
      }

      return response;
    } catch (error) {
      console.error(`[Agent ${this.name}] LLM 调用失败:`, error);
      return this.buildDefaultResponse(event);
    }
  }

  /**
   * 构建默认响应（LLM 调用失败时使用）
   */
  private buildDefaultResponse(_event: WorldEvent): AgentResponse {
    return {
      opinion: `作为${this.persona.profession}，我注意到了这个事件但需要更多信息。`,
      action: 'silent',
      emotionalState: 0,
      reasoning: '无法获取 LLM 响应，保持沉默观望。',
    };
  }

  /**
   * 规范化 LLM 响应
   */
  private normalizeResponse(raw: Partial<AgentResponse>): AgentResponse {
    const validActions = ['speak', 'forward', 'silent', 'predict'] as const;
    const action = validActions.includes(raw.action as typeof validActions[number])
      ? raw.action as typeof validActions[number]
      : 'silent';

    return {
      opinion: typeof raw.opinion === 'string' ? raw.opinion : '无明确观点。',
      action,
      emotionalState: typeof raw.emotionalState === 'number'
        ? clamp(raw.emotionalState, -1, 1)
        : 0,
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : undefined,
      targets: Array.isArray(raw.targets) ? raw.targets.filter(t =>
        typeof t.name === 'string' && t.name.length > 0 &&
        typeof t.stance === 'number' &&
        typeof t.confidence === 'number'
      ).map(t => ({
        name: t.name,
        category: ['stock', 'sector', 'commodity', 'crypto', 'index', 'macro', 'other'].includes(t.category) ? t.category : 'other',
        stance: clamp(t.stance, -1, 1),
        confidence: clamp(t.confidence, 0, 1),
        reasoning: typeof t.reasoning === 'string' ? t.reasoning : undefined,
      })).slice(0, 5) : undefined,
      newOpinions: raw.newOpinions ?? undefined,
      socialActions: raw.socialActions ?? undefined,
    };
  }

  /**
   * 判断 Agent 是否对某事件感兴趣
   */
  isInterestedIn(event: WorldEvent): boolean {
    if (this._status !== 'active') return false;

    // 高重要性事件所有人都关注
    if (event.importance >= 0.8) return true;

    // 根据专长领域匹配
    const hasExpertiseMatch = this.persona.expertise.some(exp =>
      event.tags.some(tag => tag.includes(exp) || exp.includes(tag)) ||
      event.title.includes(exp) ||
      event.content.includes(exp)
    );
    if (hasExpertiseMatch) return true;

    // 根据信息敏感度随机决定
    return Math.random() < this.persona.traits.informationSensitivity * event.importance;
  }

  /**
   * 从序列化数据恢复 Agent 实例
   */
  static fromData(data: BeeAgent): Agent {
    const agent = new Agent({
      id: data.id,
      name: data.name,
      persona: data.persona,
      modelTier: data.modelTier,
      spawnedAtTick: data.spawnedAtTick,
    });

    // 恢复记忆状态
    agent.memory.restore(data.memory);

    // 恢复运行时状态
    agent._status = data.status;
    agent._influence = data.influence;
    agent._credibility = data.credibility;
    agent._lastActiveTick = data.lastActiveTick;
    agent._followersSet = new Set(data.followers);
    agent._followingSet = new Set(data.following);

    return agent;
  }

  /**
   * 导出 Agent 数据
   */
  toData(): BeeAgent {
    return {
      id: this.id,
      name: this.name,
      persona: this.persona,
      memory: this.memory.getState(),
      relationships: [],
      followers: [...this._followersSet],
      following: [...this._followingSet],
      influence: this._influence,
      status: this._status,
      credibility: this._credibility,
      spawnedAtTick: this._spawnedAtTick,
      lastActiveTick: this._lastActiveTick,
      modelTier: this.modelTier,
      modelId: `${this.modelTier}-default`,
    };
  }
}
