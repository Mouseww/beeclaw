// ============================================================================
// BeeClaw Server — API: /api/scenario  推演场景
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../index.js';
import { WorldEngine } from '@beeclaw/world-engine';
import type { EventCategory } from '@beeclaw/shared';
import { scenarioSchema } from './schemas.js';

interface ScenarioBody {
  seedEvent: {
    title: string;
    content: string;
    category?: EventCategory;
    importance?: number;
    tags?: string[];
  };
  agentCount?: number;
  ticks?: number;
}

export function registerScenarioRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Body: ScenarioBody }>('/api/scenario', { schema: scenarioSchema }, async (req, reply) => {
    const { seedEvent, agentCount = 10, ticks = 5 } = req.body;

    if (!seedEvent?.title || !seedEvent?.content) {
      return reply.status(400).send({ error: 'seedEvent.title and seedEvent.content required' });
    }

    if (ticks > 20) {
      return reply.status(400).send({ error: 'max 20 ticks per scenario' });
    }

    // 创建隔离的 WorldEngine 跑推演
    const engine = new WorldEngine({
      config: {
        tickIntervalMs: 100, // 推演用最小间隔
        maxAgents: Math.min(agentCount, 50),
        eventRetentionTicks: ticks + 5,
        enableNaturalSelection: false,
      },
      modelRouter: ctx.modelRouter,
      concurrency: 5,
    });

    // 复用主引擎的孵化规则
    const _mainSpawner = ctx.engine.spawner;
    // 生成 agents
    const agents = engine.spawner.spawnBatch(Math.min(agentCount, 50), 0);
    engine.addAgents(agents);

    // 注入种子事件
    engine.injectEvent({
      title: seedEvent.title,
      content: seedEvent.content,
      category: seedEvent.category ?? 'general',
      importance: seedEvent.importance ?? 0.8,
      propagationRadius: 0.6,
      tags: seedEvent.tags ?? ['scenario'],
    });

    // 推进 ticks
    const results = [];
    for (let i = 0; i < ticks; i++) {
      const result = await engine.step();
      results.push(result);
    }

    return {
      scenario: seedEvent.title,
      agentCount: agents.length,
      ticks: results,
      consensus: engine.getConsensusEngine().getLatestSignals(),
      agents: agents.map(a => ({
        name: a.name,
        profession: a.persona.profession,
        status: a.status,
      })),
    };
  });
}
