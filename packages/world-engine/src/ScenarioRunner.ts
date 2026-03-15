// ============================================================================
// ScenarioRunner — 场景模板运行器
// 根据 ScenarioTemplate 自动创建 Agent、配置事件源并启动仿真
// ============================================================================

import type {
  ScenarioTemplate,
  AgentProfile,
  EventSourceConfig,
  WorldConfig,
} from '@beeclaw/shared';
import { WorldEngine } from './WorldEngine.js';
import type { WorldEngineOptions, TickResult } from './WorldEngine.js';
import type { Agent } from '@beeclaw/agent-runtime';
import { AgentSpawner, ModelRouter } from '@beeclaw/agent-runtime';

/**
 * ScenarioRunner 配置选项
 */
export interface ScenarioRunnerOptions {
  /** 覆盖模板的模型路由器 */
  modelRouter?: ModelRouter;
  /** LLM 并发调用数 */
  concurrency?: number;
  /** 覆盖模板的运行 tick 数 */
  maxTicks?: number;
  /** 每个 tick 完成后的回调 */
  onTick?: (result: TickResult) => void;
  /** 场景完成后的回调 */
  onComplete?: (results: TickResult[]) => void;
}

/**
 * 场景运行状态
 */
export type ScenarioStatus = 'idle' | 'loading' | 'running' | 'completed' | 'stopped' | 'error';

/**
 * ScenarioRunner — 场景模板运行器
 *
 * 职责：
 * 1. 解析 ScenarioTemplate，构建 WorldEngine
 * 2. 根据 agentProfiles 创建 Agent 群
 * 3. 配置事件源
 * 4. 提供 run() 方法启动场景
 */
export class ScenarioRunner {
  private template: ScenarioTemplate | null = null;
  private engine: WorldEngine | null = null;
  private status: ScenarioStatus = 'idle';
  private options: ScenarioRunnerOptions;
  private tickResults: TickResult[] = [];
  private error: string | null = null;

  constructor(options?: ScenarioRunnerOptions) {
    this.options = options ?? {};
  }

  // ── 公共 API ──

  /**
   * 加载场景模板
   */
  loadTemplate(template: ScenarioTemplate): void {
    if (this.status === 'running') {
      throw new Error('场景正在运行中，请先停止当前场景');
    }

    this.template = template;
    this.status = 'loading';
    this.tickResults = [];
    this.error = null;

    // 1. 合并世界配置
    const worldConfig = this.buildWorldConfig(template);

    // 2. 创建 WorldEngine
    const modelRouter = this.options.modelRouter ?? new ModelRouter();
    const engineOptions: WorldEngineOptions = {
      config: worldConfig,
      modelRouter,
      concurrency: this.options.concurrency ?? 10,
    };
    this.engine = new WorldEngine(engineOptions);

    // 3. 创建 Agent
    const agents = this.createAgentsFromProfiles(template.agentProfiles);
    this.engine.addAgents(agents);

    // 4. 配置孵化规则
    if (template.spawnRules) {
      for (const rule of template.spawnRules) {
        this.engine.spawner.addRule(rule);
      }
    }

    // 5. 注入种子事件
    if (template.seedEvents) {
      for (const seed of template.seedEvents) {
        this.engine.injectEvent({
          title: seed.title,
          content: seed.content,
          category: seed.category,
          importance: seed.importance,
          tags: seed.tags,
        });
      }
    }

    this.status = 'idle';
    console.log(
      `[ScenarioRunner] 模板 "${template.name}" 加载完成 — ` +
      `${agents.length} 个 Agent, ${template.eventSources.length} 个事件源`
    );
  }

  /**
   * 运行场景（有限 tick 数模式）
   */
  async run(maxTicks?: number): Promise<TickResult[]> {
    if (!this.engine || !this.template) {
      throw new Error('请先使用 loadTemplate() 加载场景模板');
    }
    if (this.status === 'running') {
      throw new Error('场景已在运行中');
    }

    const ticks = maxTicks ?? this.options.maxTicks ?? this.template.duration ?? 10;

    this.status = 'running';
    this.tickResults = [];

    console.log(
      `[ScenarioRunner] 开始运行场景 "${this.template.name}" — ${ticks} 个 tick`
    );

    try {
      for (let i = 0; i < ticks; i++) {
        if (this.status !== 'running') break;

        const result = await this.engine.step();
        this.tickResults.push(result);

        if (this.options.onTick) {
          this.options.onTick(result);
        }
      }

      if (this.status === 'running') {
        this.status = 'completed';
      }

      if (this.options.onComplete) {
        this.options.onComplete(this.tickResults);
      }

      console.log(
        `[ScenarioRunner] 场景 "${this.template.name}" 完成 — ` +
        `${this.tickResults.length} 个 tick, ` +
        `总事件:${this.tickResults.reduce((s, r) => s + r.eventsProcessed, 0)}, ` +
        `总响应:${this.tickResults.reduce((s, r) => s + r.responsesCollected, 0)}`
      );

      return this.tickResults;
    } catch (err) {
      this.status = 'error';
      this.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * 停止运行中的场景
   */
  stop(): void {
    if (this.status !== 'running') return;
    this.status = 'stopped';
    if (this.engine) {
      this.engine.stop();
    }
    console.log(`[ScenarioRunner] 场景已停止`);
  }

  /**
   * 获取当前运行状态
   */
  getStatus(): ScenarioStatus {
    return this.status;
  }

  /**
   * 获取错误信息
   */
  getError(): string | null {
    return this.error;
  }

  /**
   * 获取已加载的模板
   */
  getTemplate(): ScenarioTemplate | null {
    return this.template;
  }

  /**
   * 获取底层 WorldEngine（加载模板后可用）
   */
  getEngine(): WorldEngine | null {
    return this.engine;
  }

  /**
   * 获取 tick 历史结果
   */
  getTickResults(): TickResult[] {
    return [...this.tickResults];
  }

  /**
   * 获取场景摘要信息
   */
  getSummary(): ScenarioSummary | null {
    if (!this.template || !this.engine) return null;

    const totalAgents = this.template.agentProfiles.reduce((s, p) => s + p.count, 0);
    return {
      name: this.template.name,
      description: this.template.description,
      status: this.status,
      totalAgentsCreated: totalAgents,
      currentAgentCount: this.engine.getAgents().length,
      activeAgentCount: this.engine.getActiveAgentCount(),
      currentTick: this.engine.getCurrentTick(),
      ticksCompleted: this.tickResults.length,
      totalEventsProcessed: this.tickResults.reduce((s, r) => s + r.eventsProcessed, 0),
      totalResponsesCollected: this.tickResults.reduce((s, r) => s + r.responsesCollected, 0),
      totalSignals: this.tickResults.reduce((s, r) => s + r.signals, 0),
      eventSources: this.template.eventSources.map(es => es.name),
      error: this.error,
    };
  }

  // ── 内部方法 ──

  /**
   * 合并模板中的世界配置与默认配置
   */
  private buildWorldConfig(template: ScenarioTemplate): WorldConfig {
    const defaults: WorldConfig = {
      tickIntervalMs: 30_000,
      maxAgents: 200,
      eventRetentionTicks: 100,
      enableNaturalSelection: false,
    };

    return {
      ...defaults,
      ...template.worldConfig,
    };
  }

  /**
   * 根据 AgentProfile 列表创建 Agent
   */
  private createAgentsFromProfiles(profiles: AgentProfile[]): Agent[] {
    const spawner = new AgentSpawner();
    const allAgents: Agent[] = [];

    for (const profile of profiles) {
      const agents = spawner.spawnBatch(
        profile.count,
        0, // spawnedAtTick = 0
        profile.modelTier,
        profile.template,
      );
      allAgents.push(...agents);
      console.log(
        `[ScenarioRunner] 创建 "${profile.role}" x ${profile.count} ` +
        `(${profile.modelTier})`
      );
    }

    return allAgents;
  }

  /**
   * 获取事件源配置的描述文本
   */
  static describeEventSources(sources: EventSourceConfig[]): string[] {
    return sources.map(source => {
      switch (source.type) {
        case 'finance':
          return `金融数据源: ${source.name}`;
        case 'rss':
          return `RSS 新闻源: ${source.name}`;
        case 'manual':
          return `手动事件注入: ${source.name}`;
        default:
          return `未知类型: ${source.name}`;
      }
    });
  }
}

/**
 * 场景运行摘要
 */
export interface ScenarioSummary {
  name: string;
  description: string;
  status: ScenarioStatus;
  totalAgentsCreated: number;
  currentAgentCount: number;
  activeAgentCount: number;
  currentTick: number;
  ticksCompleted: number;
  totalEventsProcessed: number;
  totalResponsesCollected: number;
  totalSignals: number;
  eventSources: string[];
  error: string | null;
}
