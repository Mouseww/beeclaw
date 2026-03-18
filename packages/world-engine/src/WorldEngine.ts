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
  AgentSpawner,
  ModelRouter,
  ResponseCache,
  BatchInference,
} from '@beeclaw/agent-runtime';
import type {
  ResponseCacheConfig,
  BatchInferenceConfig,
  InferenceRequest,

  Agent} from '@beeclaw/agent-runtime';
import { SocialGraph } from '@beeclaw/social-graph';
import { ConsensusEngine } from '@beeclaw/consensus';
import type { AgentResponseRecord } from '@beeclaw/consensus';
import { TickScheduler } from './TickScheduler.js';
import { WorldStateManager } from './WorldState.js';
import { NaturalSelection } from './NaturalSelection.js';
import type { NaturalSelectionConfig } from './NaturalSelection.js';
import { AgentActivationPool } from './AgentActivationPool.js';
import type { ActivationPoolConfig } from './AgentActivationPool.js';
import { TickCoordinator, Worker, InProcessTransport } from '@beeclaw/coordinator';
import type { AgentExecutor } from '@beeclaw/coordinator';

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
  /** 本轮处理的事件摘要 */
  events?: TickEventSummary[];
  /** 本轮收集的 Agent 响应摘要 */
  responses?: TickResponseSummary[];
  /** 时间戳 */
  timestamp?: string;
}

/** Tick 事件摘要（用于前端展示） */
export interface TickEventSummary {
  id: string;
  title: string;
  category: string;
  importance: number;
}

/** Tick 响应摘要（用于前端展示） */
export interface TickResponseSummary {
  agentId: string;
  agentName: string;
  opinion: string;
  action: string;
  emotionalState: number;
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

  /** 分布式模式组件 */
  private coordinator?: TickCoordinator;
  private workers: Worker[] = [];
  private transport?: InProcessTransport;

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

    // 初始化分布式模式（如果启用）
    if (options.config.distributed) {
      this.initializeDistributedMode(options.config.workerCount ?? 2);
    }

    // 注册 tick 回调
    this.scheduler.onTick(async (tick) => {
      await this.processTick(tick);
    });
  }

  // ── 分布式模式初始化 ──

  /**
   * 初始化分布式模式
   */
  private initializeDistributedMode(workerCount: number): void {
    this.transport = new InProcessTransport();
    this.coordinator = new TickCoordinator(this.transport);

    // 创建 AgentExecutor 实现
    const executor: AgentExecutor = {
      executeAgent: async (agentId, event, tick) => {
        const agent = this.agents.get(agentId);
        if (!agent) return null;

        const response = await agent.react(event, this.modelRouter, tick);
        const record: AgentResponseRecord = {
          agentId: agent.id,
          agentName: agent.name,
          credibility: agent.credibility,
          response,
        };

        const newEvents: WorldEvent[] = [];
        if (response.action === 'speak' || response.action === 'forward') {
          newEvents.push({
            id: `${agent.id}-${tick}-${Date.now()}`,
            type: 'agent_action',
            category: event.category,
            title: `${agent.name}的观点`,
            content: response.opinion,
            source: agent.id,
            importance: Math.min(event.importance * 0.5, agent.influence / 100),
            propagationRadius: 0.1,
            tick,
            tags: event.tags,
          });
        }

        return { record, newEvents };
      },
      isAgentInterested: (agentId, event) => {
        const agent = this.agents.get(agentId);
        return agent ? agent.isInterestedIn(event) : false;
      },
      isAgentActive: (agentId) => {
        const agent = this.agents.get(agentId);
        return agent ? agent.status === 'active' : false;
      },
    };

    // 创建 Worker 实例
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        { id: `worker-${i}` },
        this.transport,
        executor,
      );
      this.workers.push(worker);
      this.coordinator.registerWorker(worker);
    }

    this.log.info(`分布式模式已启用，Worker 数量: ${workerCount}`);
  }

  /**
   * 获取 Coordinator 状态（用于 API 暴露）
   */
  getCoordinatorStatus() {
    if (!this.coordinator) {
      return null;
    }

    return {
      enabled: true,
      currentTick: this.coordinator.getCurrentTick(),
      workers: this.coordinator.getAllWorkers(),
      assignments: this.coordinator.getCurrentAssignments(),
    };
  }

  // ── Agent 管理 ──

  /**
   * 注册一个 Agent 到世界中
   */
  addAgent(agent: Agent): void {
    const maxAgents = this.config.maxAgents ?? 100;
    if (this.agents.size >= maxAgents) {
      this.log.warn(`Agent 上限已达 ${maxAgents}，跳过注册 ${agent.id}`);
      return;
    }

    this.agents.set(agent.id, agent);
    this.socialGraph.addNode(agent.id, agent.influence);
    this.worldState.setAgentCount(this.agents.size);

    // 如果启用分布式模式，重新分配 Agent
    if (this.coordinator && !this.running) {
      const agentIds = Array.from(this.agents.keys());
      this.coordinator.assignAgents(agentIds);
    }
  }

  /**
   * 批量注册 Agent
   */
  addAgents(agents: Agent[]): void {
    const addedAgentIds: string[] = [];

    for (const agent of agents) {
      const previousSize = this.agents.size;
      this.addAgent(agent);
      if (this.agents.size > previousSize) {
        addedAgentIds.push(agent.id);
      }
    }

    if (addedAgentIds.length <= 1) {
      return;
    }

    // 初始化随机社交关系
    this.socialGraph.initializeRandomRelations(
      addedAgentIds,
      Math.min(5, addedAgentIds.length - 1),
      this.scheduler.getCurrentTick(),
    );
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
    const _tick = await this.scheduler.advance();
    return this.tickHistory[this.tickHistory.length - 1]!;
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 外部设置运行状态（当 Server 用自己的 tick 循环时使用）
   */
  markRunning(value: boolean): void {
    this.running = value;
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

    // 2. 消费事件队列
    const events = this.eventBus.consumeEvents();
    const hasEvents = events.length > 0;

    if (hasEvents) {
      console.log(`\n[WorldEngine] ════ Tick ${tick} 开始 ════`);
    }

    // 记录 tick 开始时的缓存状态
    const cacheStatsBefore = this.responseCache.getStats();

    // 1. 推进世界状态
    this.worldState.advanceTick(tick);

    if (hasEvents) {
      console.log(`[WorldEngine] 本轮事件数: ${events.length}`);
    }

    let totalActivated = 0;
    let totalResponses = 0;
    let totalFiltered = 0;
    const allResponseRecords: Array<{ event: WorldEvent; records: AgentResponseRecord[] }> = [];

    // 如果启用分布式模式，使用 TickCoordinator 处理
    if (this.coordinator) {
      await this.processTickDistributed(tick, events, allResponseRecords);
      // 从分布式结果中提取统计信息
      for (const { records } of allResponseRecords) {
        totalResponses += records.length;
      }
    } else {
      // 单进程模式：原有逻辑
      await this.processTickLocal(tick, events, allResponseRecords, (activated, filtered) => {
        totalActivated += activated;
        totalFiltered += filtered;
        totalResponses += activated;
      });
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
    const maxAgents = this.config.maxAgents ?? 100;
    for (const event of events) {
      if (this.agents.size >= maxAgents) break;
      const newAgents = this.spawner.checkEventTriggers(event, this.agents.size, tick);
      if (newAgents.length > 0) {
        const allowed = newAgents.slice(0, maxAgents - this.agents.size);
        this.addAgents(allowed);
        newAgentsSpawned += allowed.length;
      }
    }

    // 定时孵化检查
    if (this.agents.size < maxAgents) {
      const scheduledAgents = this.spawner.checkScheduledTriggers(tick, this.agents.size);
      if (scheduledAgents.length > 0) {
        const allowed = scheduledAgents.slice(0, maxAgents - this.agents.size);
        this.addAgents(allowed);
        newAgentsSpawned += allowed.length;
      }
    }

    // 6. 自然选择（信誉淘汰）
    let agentsEliminated = 0;
    if (this.config.enableNaturalSelection && this.naturalSelection.shouldCheck(tick)) {
      const allAgents = this.getAgents();
      const { result, event: _selectionEvent } = this.naturalSelection.evaluate(
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

    // 构建事件摘要
    const eventSummaries: TickEventSummary[] = events.map(e => ({
      id: e.id,
      title: e.title,
      category: e.category,
      importance: e.importance,
    }));

    // 构建响应摘要
    const responseSummaries: TickResponseSummary[] = [];
    for (const { records } of allResponseRecords) {
      for (const rec of records) {
        responseSummaries.push({
          agentId: rec.agentId,
          agentName: rec.agentName,
          opinion: rec.response.opinion,
          action: rec.response.action,
          emotionalState: rec.response.emotionalState,
        });
      }
    }

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
      events: eventSummaries.length > 0 ? eventSummaries : undefined,
      responses: responseSummaries.length > 0 ? responseSummaries : undefined,
      timestamp: new Date().toISOString(),
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

  // ── 分布式和本地处理方法 ──

  /**
   * 分布式模式处理 tick
   */
  private async processTickDistributed(
    tick: number,
    events: WorldEvent[],
    allResponseRecords: Array<{ event: WorldEvent; records: AgentResponseRecord[] }>,
  ): Promise<void> {
    if (!this.coordinator) return;

    // 注入事件到 coordinator
    this.coordinator.injectEvents(events);

    // 执行分布式 tick
    const result = await this.coordinator.executeTick();

    console.log(
      `[WorldEngine] 分布式 Tick ${tick}: ` +
      `Worker 数: ${result.workerResults.length}, ` +
      `激活: ${result.totalAgentsActivated}, ` +
      `响应: ${result.totalResponses}, ` +
      `耗时: ${result.durationMs}ms`,
    );

    // 将 Worker 结果转换为 allResponseRecords 格式
    const eventRecordsMap = new Map<string, AgentResponseRecord[]>();

    for (const workerResult of result.workerResults) {
      for (const record of workerResult.responses) {
        // 找到对应的事件（简化处理，实际可能需要更复杂的匹配）
        for (const event of events) {
          if (!eventRecordsMap.has(event.id)) {
            eventRecordsMap.set(event.id, []);
          }
          eventRecordsMap.get(event.id)!.push(record);
        }
      }
    }

    // 转换为 allResponseRecords 格式
    for (const event of events) {
      const records = eventRecordsMap.get(event.id) || [];
      if (records.length > 0) {
        allResponseRecords.push({ event, records });
      }
    }

    // 处理新产生的事件（级联传播）
    for (const newEvent of result.collectedNewEvents) {
      this.eventBus.emitAgentEvent({
        agentId: newEvent.source,
        agentName: newEvent.source,
        title: newEvent.title,
        content: newEvent.content,
        category: newEvent.category,
        importance: newEvent.importance,
        propagationRadius: newEvent.propagationRadius,
        tick,
        tags: newEvent.tags,
      });
    }
  }

  /**
   * 本地模式处理 tick
   */
  private async processTickLocal(
    tick: number,
    events: WorldEvent[],
    allResponseRecords: Array<{ event: WorldEvent; records: AgentResponseRecord[] }>,
    onStats: (activated: number, filtered: number) => void,
  ): Promise<void> {
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

        onStats(interestedAgents.length, activation.filteredCount);

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
        }

        allResponseRecords.push({ event, records: responseRecords });
      } catch (eventError) {
        console.error(
          `[WorldEngine] 处理事件 "${event.title}" 时出错，跳过:`,
          eventError instanceof Error ? eventError.message : eventError,
        );
      }
    }
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
