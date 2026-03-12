// ============================================================================
// AgentSpawner — Agent 孵化器，根据规则动态生成 Agent
// ============================================================================

import type {
  SpawnRule,
  SpawnTrigger,
  AgentTemplate,
  ModelTier,
  WorldEvent,
} from '@beeclaw/shared';
import { Agent } from './Agent.js';
import { generatePersona, DEFAULT_TEMPLATE } from './AgentPersona.js';

export class AgentSpawner {
  private rules: SpawnRule[] = [];
  private spawnCount = 0;

  constructor(rules?: SpawnRule[]) {
    if (rules) {
      this.rules = rules;
    }
  }

  /**
   * 添加孵化规则
   */
  addRule(rule: SpawnRule): void {
    this.rules.push(rule);
  }

  /**
   * 根据默认模板生成一批 Agent
   */
  spawnBatch(
    count: number,
    tick: number,
    modelTier: ModelTier = 'cheap',
    template?: AgentTemplate
  ): Agent[] {
    const agents: Agent[] = [];
    for (let i = 0; i < count; i++) {
      const persona = generatePersona(template ?? DEFAULT_TEMPLATE);
      const agent = new Agent({
        persona,
        modelTier,
        spawnedAtTick: tick,
      });
      agents.push(agent);
      this.spawnCount++;
    }
    console.log(`[Spawner] 孵化了 ${count} 个 Agent（Tick ${tick}）`);
    return agents;
  }

  /**
   * 检查事件是否触发孵化规则，返回需要生成的 Agent
   */
  checkEventTriggers(event: WorldEvent, currentAgentCount: number, tick: number): Agent[] {
    const newAgents: Agent[] = [];

    for (const rule of this.rules) {
      if (this.shouldTrigger(rule.trigger, event, currentAgentCount)) {
        const count = typeof rule.count === 'number' ? rule.count : rule.count;
        const spawned = this.spawnBatch(count, tick, rule.modelTier, rule.template);
        newAgents.push(...spawned);
      }
    }

    return newAgents;
  }

  /**
   * 检查是否满足定时触发条件
   */
  checkScheduledTriggers(tick: number, currentAgentCount: number): Agent[] {
    const newAgents: Agent[] = [];

    for (const rule of this.rules) {
      if (rule.trigger.type === 'scheduled') {
        if (tick % rule.trigger.intervalTicks === 0) {
          const spawned = this.spawnBatch(rule.count, tick, rule.modelTier, rule.template);
          newAgents.push(...spawned);
        }
      }
      if (rule.trigger.type === 'population_drop') {
        if (currentAgentCount < rule.trigger.threshold) {
          const spawned = this.spawnBatch(rule.count, tick, rule.modelTier, rule.template);
          newAgents.push(...spawned);
        }
      }
    }

    return newAgents;
  }

  /**
   * 判断触发条件是否满足
   */
  private shouldTrigger(trigger: SpawnTrigger, event: WorldEvent, agentCount: number): boolean {
    switch (trigger.type) {
      case 'event_keyword':
        return trigger.keywords.some(kw =>
          event.title.includes(kw) || event.content.includes(kw) || event.tags.includes(kw)
        );
      case 'population_drop':
        return agentCount < trigger.threshold;
      case 'new_topic':
        return event.importance >= trigger.minNovelty;
      case 'manual':
        return false; // 手动触发不自动执行
      case 'scheduled':
        return false; // 定时触发走 checkScheduledTriggers
      default:
        return false;
    }
  }

  /**
   * 获取历史孵化总数
   */
  getTotalSpawnCount(): number {
    return this.spawnCount;
  }
}
