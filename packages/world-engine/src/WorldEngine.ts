// ============================================================================
// WorldEngine — 世界引擎主循环
// BeeClaw 核心：驱动整个仿真世界的 Tick 循环
// ============================================================================

import type {
  WorldConfig,
  WorldEvent,
  AgentResponse,
  EventCategory,
} from '@beeclaw/shared';
import { createLogger } from '@beeclaw/shared';
import { EventBus } from '@beeclaw/event-bus';
import {
  Agent,
  AgentSpawner,
  ModelRouter,
  ResponseCache,
  BatchInference,
} from '@beeclaw/agent-runtime';
import type {
  ResponseCacheConfig,
  BatchInferenceConfig,
  InferenceRequest,
} from '@beeclaw/agent-runtime';
import { SocialGraph, calculatePropagation } from '@beeclaw/social-graph';
import { ConsensusEngine } from '@beeclaw/consensus';
import type { AgentResponseRecord } from '@beeclaw/consensus';
import { TickScheduler } from './TickScheduler.js';
import { WorldStateManager } from './WorldState.js';
import { NaturalSelection } from './NaturalSelection.js';
import type { NaturalSelectionConfig } from './NaturalSelection.js';
import { AgentActivationPool } from './AgentActivationPool.js';
import type { ActivationPoolConfig } from './AgentActivationPool.js';

/**
 * WorldEngine 配置选项
 */
export interface WorldEngineOptions {
  config: WorldConfig;
  modelRouter?: ModelRouter;
  concurrency?: number; // LLM 并发调用数，默认 10
  naturalSelectionConfig?: Partial<NaturalSelectionConfig>; // 自然选择配置
  /** 响应缓存配置 */
  cacheConfig?: Partial<ResponseCacheConfig>;
  /** 批量推理配置 */
  batchInferenceConfig?: Partial<BatchInferenceConfig>;
  /** Agent 激活池配置 */
  activationPoolConfig?: Partial<ActivationPoolConfig>;
}

/**
 * 单个 tick 的执行结果
 */
export interface TickResult {
  tick: number;
  eventsProcessed: number;
  agentsActivated: number;
  responsesCollected: number;
  newAgentsSpawned: number;
  signals: number;
  durationMs: number;
  /** 自然选择淘汰的 Agent 数量（dormant + dead） */
  agentsEliminated?: number;
  /** 缓存命中次数 */
  cacheHits?: number;
  /** 缓存未命中次数 */
  cacheMisses?: number;
  /** 被激活池过滤的 Agent 数量 */
  agentsFiltered?: number;
}

export class WorldEngine {
  readonly config: WorldConfig;
  readonly eventBus: EventBus;
  readonly socialGraph: SocialGraph;
  readonly consensusEngine: ConsensusEngine;
  readonly spawner: AgentSpawner;
  readonly scheduler: TickScheduler;
  readonly worldState: WorldStateManager;
  readonly naturalSelection: NaturalSelection;
  readonly responseCache: ResponseCache;
  readonly batchInference: BatchInference;
  readonly activationPool: AgentActivationPool;

  private agents: Map<string, Agent> = new Map();
  private modelRouter: ModelRouter;
  private concurrency: number;
  private tickHistory: TickResult[] = [];
  private running = false;
  private readonly log = createLogger('WorldEngine');
  /** 累计 LLM 调用计数（含跨 tick） */
  private totalLLMCalls = 0;

  constructor(options: WorldEngineOptions) {
    this.config = options.config;
    this.modelRouter = options.modelRouter ?? new ModelRouter();
    this.concurrency = options.concurrency ?? 10;

    this.eventBus = new EventBus(options.config.eventRetentionTicks);
    this.socialGraph = new SocialGraph();
    this.consensusEngine = new ConsensusEngine();
    this.spawner = new AgentSpawner();
    this.worldState = new WorldStateManager();

    this.naturalSelection = new NaturalSelection(options.naturalSelectionConfig);

    // Phase 3: 性能优化组件
    this.responseCache = new ResponseCache(options.cacheConfig);
    this.batchInference = new BatchInference({
      maxConcurrency: this.concurrency,
      ...options.batchInferenceConfig,
    });
    this.activationPool = new AgentActivationPool(options.activationPoolConfig);

    this.scheduler = new TickScheduler({
      tickIntervalMs: options.config.tickIntervalMs,
    });

    // 注册 tick 回调
    this.scheduler.onTick(async (tick) => {
      await this.processTick(tick);
    });
  }

  // ── Agent 管理 ──

  /**
   * 注册一个 Agent 到世界中
   */
  addAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    this.socialGraph.addNode(agent.id, agent.influence);
    this.worldState.setAgentCount(this.agents.size);
  }

  /**
   * 批量注册 Agent
   */
  addAgents(agents: Agent[]): void {
    for (const agent of agents) {
      this.addAgent(agent);
    }
    // 初始化随机社交关系
    const agentIds = agents.map(a => a.id);
    this.socialGraph.initializeRandomRelations(agentIds, Math.min(5, agents.length - 1), this.scheduler.getCurrentTick());
  }

  /**
   * 获取所有 Agent
   */
  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取指定 Agent
   */
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /**
   * 获取活跃 Agent 数量
   */
  getActiveAgentCount(): number {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (agent.status === 'active') count++;
    }
    return count;
  }

  // ── 世界运行 ──

  /**
   * 启动世界（自动推进 tick）
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.log.info('🐝 BeeWorld 启动', { agentCount: this.agents.size });
    this.scheduler.start();
  }

  /**
   * 停止世界
   */
  stop(): void {
    this.running = false;
    this.scheduler.stop();
    this.log.info('BeeWorld 已停止', { tick: this.scheduler.getCurrentTick() });
  }

  /**
   * 手动推进一个 tick
   */
  async step(): Promise<TickResult> {
    const tick = await this.scheduler.advance();
    return this.tickHistory[this.tickHistory.length - 1]!;
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 注入外部事件
   */
  injectEvent(params: {
    title: string;
    content: string;
    category?: EventCategory;
    importance?: number;
    propagationRadius?: number;
    tags?: string[];
  }): WorldEvent {
    return this.eventBus.injectEvent({
      ...params,
      tick: this.scheduler.getCurrentTick(),
    });
  }

  // ── 核心 Tick 处理 ──

  /**
   * 处理单个 Tick 的所有逻辑（包含整体异常保护）
   */
  private async processTick(tick: number): Promise<void> {
    const startTime = Date.now();
    console.log(`\n[WorldEngine] ════ Tick ${tick} 开始 ════`);

    // 记录 tick 开始时的缓存状态
    const cacheStatsBefore = this.responseCache.getStats();

    // 1. 推进世界状态
    this.worldState.advanceTick(tick);

    // 2. 消费事件队列
    const events = this.eventBus.consumeEvents();
    console.log(`[WorldEngine] 本轮事件数: ${events.length}`);

    let totalActivated = 0;
    let totalResponses = 0;
    let totalFiltered = 0;
    const allResponseRecords: Array<{ event: WorldEvent; records: AgentResponseRecord[] }> = [];

    // 3. 对每个事件进行传播和 Agent 响应
    for (const event of events) {
      try {
        // 3a. 使用 AgentActivationPool 计算激活范围
        const activeAgentIds: string[] = [];
        for (const agent of this.agents.values()) {
          if (agent.status === 'active') {
            activeAgentIds.push(agent.id);
          }
        }

        const activation = this.activationPool.computeActivation(
          event,
          this.socialGraph,
          activeAgentIds,
        );

        totalFiltered += activation.filteredCount;

        console.log(
          `[WorldEngine] 事件 "${event.title}" 激活 ${activation.activatedIds.length} 个 Agent` +
          (activation.filteredCount > 0 ? `（过滤 ${activation.filteredCount}）` : ''),
        );

        // 3b. 筛选出对事件感兴趣的 Agent
        const interestedAgents: Agent[] = [];
        for (const agentId of activation.activatedIds) {
          const agent = this.agents.get(agentId);
          if (agent && agent.isInterestedIn(event)) {
            interestedAgents.push(agent);
          }
        }

        totalActivated += interestedAgents.length;

        if (interestedAgents.length === 0) continue;

        // 3c. 使用 BatchInference 批量并发调用 Agent
        const responseRecords: AgentResponseRecord[] = [];

        const inferenceRequests: InferenceRequest<{ agent: Agent; response: AgentResponse }>[] =
          interestedAgents.map((agent) => ({
            id: agent.id,
            execute: async () => {
              const response = await agent.react(event, this.modelRouter, tick);
              return { agent, response };
            },
          }));

        const inferenceResults = await this.batchInference.executeBatch(inferenceRequests);

        for (const inferResult of inferenceResults) {
          if (!inferResult.success || !inferResult.result) {
            console.error(
              `[WorldEngine] Agent ${inferResult.id} 推理失败:`,
              inferResult.error?.message,
            );
            continue;
          }

          const { agent, response } = inferResult.result;

          responseRecords.push({
            agentId: agent.id,
            agentName: agent.name,
            credibility: agent.credibility,
            response,
          });

          // 3d. Agent 发言/转发 → 产生内部事件（级联传播）
          if (response.action === 'speak' || response.action === 'forward') {
            this.eventBus.emitAgentEvent({
              agentId: agent.id,
              agentName: agent.name,
              title: `${agent.name}(${agent.persona.profession})的观点`,
              content: response.opinion,
              category: event.category,
              importance: Math.min(event.importance * 0.5, agent.influence / 100),
              propagationRadius: 0.1,
              tick,
              tags: event.tags,
            });
          }

          // 3e. 处理社交行为（follow/unfollow）
          if (response.socialActions) {
            for (const socialAction of response.socialActions) {
              if (socialAction.type === 'follow') {
                agent.follow(socialAction.targetAgentId);
                this.socialGraph.addEdge(agent.id, socialAction.targetAgentId, 'follow', 0.5, tick);
                const target = this.agents.get(socialAction.targetAgentId);
                if (target) target.addFollower(agent.id);
              } else if (socialAction.type === 'unfollow') {
                agent.unfollow(socialAction.targetAgentId);
                this.socialGraph.removeEdge(agent.id, socialAction.targetAgentId);
                const target = this.agents.get(socialAction.targetAgentId);
                if (target) target.removeFollower(agent.id);
              }
            }
          }

          totalResponses++;
        }

        allResponseRecords.push({ event, records: responseRecords });
      } catch (eventError) {
        console.error(
          `[WorldEngine] 处理事件 "${event.title}" 时出错，跳过:`,
          eventError instanceof Error ? eventError.message : eventError,
        );
      }
    }

    // 4. 共识引擎分析
    let signalCount = 0;
    for (const { event, records } of allResponseRecords) {
      if (records.length >= 2) {
        try {
          const signal = this.consensusEngine.analyze(tick, event, records);
          signalCount++;

          // 更新世界情绪地图
          const emotionValue = signal.sentimentDistribution.bullish - signal.sentimentDistribution.bearish;
          this.worldState.updateSentiment(signal.topic, emotionValue);

          console.log(
            `[Consensus] "${signal.topic}": ` +
            `📈${(signal.sentimentDistribution.bullish * 100).toFixed(0)}% ` +
            `📉${(signal.sentimentDistribution.bearish * 100).toFixed(0)}% ` +
            `➡️${(signal.sentimentDistribution.neutral * 100).toFixed(0)}% ` +
            `趋势:${signal.trend}`
          );
        } catch (consensusError) {
          console.error(`[WorldEngine] 共识分析失败:`, consensusError instanceof Error ? consensusError.message : consensusError);
        }
      }
    }

    // 5. Agent 孵化检查
    let newAgentsSpawned = 0;
    for (const event of events) {
      const newAgents = this.spawner.checkEventTriggers(event, this.agents.size, tick);
      if (newAgents.length > 0) {
        this.addAgents(newAgents);
        newAgentsSpawned += newAgents.length;
      }
    }

    // 定时孵化检查
    const scheduledAgents = this.spawner.checkScheduledTriggers(tick, this.agents.size);
    if (scheduledAgents.length > 0) {
      this.addAgents(scheduledAgents);
      newAgentsSpawned += scheduledAgents.length;
    }

    // 6. 自然选择（信誉淘汰）
    let agentsEliminated = 0;
    if (this.config.enableNaturalSelection && this.naturalSelection.shouldCheck(tick)) {
      const allAgents = this.getAgents();
      const { result, event: selectionEvent } = this.naturalSelection.evaluate(
        tick,
        allAgents,
        this.spawner,
        (newAgents) => {
          this.addAgents(newAgents);
          newAgentsSpawned += newAgents.length;
        },
      );

      agentsEliminated = result.newDormant.length + result.newDead.length;

      // 更新 Agent 数量
      this.worldState.setAgentCount(this.agents.size);

      console.log(
        `[NaturalSelection] Tick ${tick}: ` +
        `休眠 ${result.newDormant.length} / 死亡 ${result.newDead.length} / ` +
        `新生 ${result.newSpawned.length} ` +
        `活跃: ${result.activeCountBefore} → ${result.activeCountAfter}`
      );
    }

    // 7. 更新活跃事件
    this.worldState.setActiveEvents(this.eventBus.getActiveEvents(tick));

    // 8. 清理过期事件
    this.eventBus.cleanup(tick);

    // 9. 缓存统计
    const cacheStatsAfter = this.responseCache.getStats();
    const tickCacheHits = cacheStatsAfter.hits - cacheStatsBefore.hits;
    const tickCacheMisses = cacheStatsAfter.misses - cacheStatsBefore.misses;

    // 10. 记录结果
    const durationMs = Date.now() - startTime;
    const tickResult: TickResult = {
      tick,
      eventsProcessed: events.length,
      agentsActivated: totalActivated,
      responsesCollected: totalResponses,
      newAgentsSpawned,
      signals: signalCount,
      durationMs,
      agentsEliminated: agentsEliminated > 0 ? agentsEliminated : undefined,
      cacheHits: tickCacheHits > 0 ? tickCacheHits : undefined,
      cacheMisses: tickCacheMisses > 0 ? tickCacheMisses : undefined,
      agentsFiltered: totalFiltered > 0 ? totalFiltered : undefined,
    };

    this.tickHistory.push(tickResult);
    // 保留最近 200 个 tick 的历史
    if (this.tickHistory.length > 200) {
      this.tickHistory = this.tickHistory.slice(-200);
    }

    console.log(
      `[WorldEngine] ════ Tick ${tick} 完成 ════ ` +
      `事件:${events.length} 激活:${totalActivated} 响应:${totalResponses} ` +
      `信号:${signalCount} 新Agent:${newAgentsSpawned} 耗时:${durationMs}ms` +
      (tickCacheHits > 0 ? ` 缓存命中:${tickCacheHits}` : '') +
      (totalFiltered > 0 ? ` 过滤:${totalFiltered}` : '')
    );
  }

  // ── 查询方法 ──

  /**
   * 获取 Tick 历史
   */
  getTickHistory(): TickResult[] {
    return [...this.tickHistory];
  }

  /**
   * 获取最近一次 Tick 结果
   */
  getLastTickResult(): TickResult | undefined {
    return this.tickHistory[this.tickHistory.length - 1];
  }

  /**
   * 获取当前 Tick
   */
  getCurrentTick(): number {
    return this.scheduler.getCurrentTick();
  }

  /**
   * 获取世界状态
   */
  getWorldState(): WorldStateManager {
    return this.worldState;
  }

  /**
   * 获取共识引擎
   */
  getConsensusEngine(): ConsensusEngine {
    return this.consensusEngine;
  }

  /**
   * 获取社交图谱
   */
  getSocialGraph(): SocialGraph {
    return this.socialGraph;
  }

  /**
   * 获取性能统计信息
   */
  getPerformanceStats() {
    return {
      cache: this.responseCache.getStats(),
      batchInference: this.batchInference.getStats(),
      activationPool: this.activationPool.getStats(),
    };
  }
}
