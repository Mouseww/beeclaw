// ============================================================================
// BeeClaw Benchmark — AgentMemory 记忆系统性能
// 测试短期记忆添加/查询、观点管理、记忆压缩和序列化在大量条目下的性能
//
// 预期基线（参考值）:
//   - 1000 次 remember:       < 5ms
//   - buildMemoryContext:      < 1ms（50 条记忆 + 20 个观点）
//   - 100 次 updateOpinion:   < 1ms
//   - compress (Mock LLM):    < 5ms
//   - getState + restore:     < 2ms
// ============================================================================

import { bench, describe } from 'vitest';
import { AgentMemory } from '@beeclaw/agent-runtime';
import type { MemoryEntry } from '@beeclaw/shared';

// ── Mock LLM Client ─────────────────────────────────────────────────────────

const MOCK_COMPRESSION_RESPONSE = JSON.stringify({
  summary: '这是一段压缩后的记忆摘要，包含了近期金融市场动态和分析师观点变化。',
  keyInsights: [
    '市场整体呈现震荡态势',
    '分析师对未来走势存在分歧',
    '技术面信号偏弱',
  ],
});

const mockLLMClient = {
  chatCompletion: async () => MOCK_COMPRESSION_RESPONSE,
} as unknown as LLMClient;

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function createMemoryEntry(tick: number, idx: number): MemoryEntry {
  return {
    tick,
    type: 'event',
    content: `记忆条目 #${idx}: Tick ${tick} 金融市场出现异动，多数分析师调整了预期。`,
    importance: Math.random(),
    emotionalImpact: Math.random() * 2 - 1,
  };
}

function createPrefilledMemory(shortTermCount: number = 50, opinionCount: number = 20): AgentMemory {
  const memory = new AgentMemory();
  for (let i = 0; i < shortTermCount; i++) {
    memory.remember(i, 'event', `预填充记忆 #${i}`, Math.random(), Math.random() * 2 - 1);
  }
  for (let j = 0; j < opinionCount; j++) {
    memory.updateOpinion(
      `topic_${j}`,
      Math.random() * 2 - 1,
      Math.random(),
      `关于 topic_${j} 的推理依据`,
      j,
    );
  }
  return memory;
}

// ── 短期记忆添加性能 ────────────────────────────────────────────────────────

describe('AgentMemory — 短期记忆添加', () => {
  bench(
    '1000 次 remember (含 FIFO 淘汰)',
    () => {
      const memory = new AgentMemory();
      for (let i = 0; i < 1000; i++) {
        memory.remember(i, 'event', `记忆 #${i}: 市场波动`, 0.5, 0.1);
      }
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    'addShortTermMemory ×1000 (结构化条目)',
    () => {
      const memory = new AgentMemory();
      for (let i = 0; i < 1000; i++) {
        memory.addShortTermMemory(createMemoryEntry(i, i));
      }
    },
    { iterations: 100, warmupIterations: 10 },
  );
});

// ── 记忆查询性能 ────────────────────────────────────────────────────────────

describe('AgentMemory — 记忆查询', () => {
  const memory = createPrefilledMemory(50, 20);

  bench(
    'getRecentMemories(10)',
    () => {
      memory.getRecentMemories(10);
    },
    { iterations: 1000, warmupIterations: 50 },
  );

  bench(
    'getRecentMemories(50)',
    () => {
      memory.getRecentMemories(50);
    },
    { iterations: 1000, warmupIterations: 50 },
  );

  bench(
    'getShortTermMemories() (全量拷贝)',
    () => {
      memory.getShortTermMemories();
    },
    { iterations: 1000, warmupIterations: 50 },
  );

  bench(
    'buildMemoryContext() (50条记忆 + 20个观点)',
    () => {
      memory.buildMemoryContext();
    },
    { iterations: 500, warmupIterations: 30 },
  );
});

// ── 观点管理性能 ────────────────────────────────────────────────────────────

describe('AgentMemory — 观点管理', () => {
  bench(
    '100 次 updateOpinion (覆盖写)',
    () => {
      const memory = new AgentMemory();
      for (let i = 0; i < 100; i++) {
        memory.updateOpinion(
          `topic_${i % 20}`,
          Math.random() * 2 - 1,
          Math.random(),
          `推理依据 ${i}`,
          i,
        );
      }
    },
    { iterations: 500, warmupIterations: 30 },
  );

  bench(
    'getOpinion ×100 (从 20 个 topic 中查询)',
    () => {
      const memory = createPrefilledMemory(10, 20);
      for (let i = 0; i < 100; i++) {
        memory.getOpinion(`topic_${i % 20}`);
      }
    },
    { iterations: 1000, warmupIterations: 50 },
  );

  bench(
    'getAllOpinions() (20 个观点浅拷贝)',
    () => {
      const memory = createPrefilledMemory(10, 20);
      memory.getAllOpinions();
    },
    { iterations: 1000, warmupIterations: 50 },
  );
});

// ── 记忆压缩性能 (Mock LLM) ────────────────────────────────────────────────

describe('AgentMemory — 记忆压缩 (Mock LLM)', () => {
  bench(
    'compress() (35 条短期记忆触发压缩)',
    async () => {
      const memory = createPrefilledMemory(35, 5);
      await memory.compress(mockLLMClient);
    },
    { iterations: 100, warmupIterations: 10 },
  );

  bench(
    '连续 3 轮压缩 (每轮添加 35 条再压缩)',
    async () => {
      const memory = new AgentMemory();
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 35; i++) {
          memory.remember(round * 35 + i, 'event', `记忆 #${round * 35 + i}`, 0.5, 0);
        }
        await memory.compress(mockLLMClient);
      }
    },
    { iterations: 50, warmupIterations: 5 },
  );

  bench(
    'needsCompression() 检查 ×1000',
    () => {
      const memory = createPrefilledMemory(35, 5);
      for (let i = 0; i < 1000; i++) {
        memory.needsCompression();
      }
    },
    { iterations: 500, warmupIterations: 30 },
  );
});

// ── 序列化/反序列化性能 ─────────────────────────────────────────────────────

describe('AgentMemory — 序列化/反序列化', () => {
  const memory = createPrefilledMemory(50, 20);
  const state = memory.getState();

  bench(
    'getState() (序列化快照)',
    () => {
      memory.getState();
    },
    { iterations: 500, warmupIterations: 30 },
  );

  bench(
    'restore() (反序列化恢复)',
    () => {
      const fresh = new AgentMemory();
      fresh.restore(state);
    },
    { iterations: 500, warmupIterations: 30 },
  );

  bench(
    'getState + restore 完整往返',
    () => {
      const snapshot = memory.getState();
      const fresh = new AgentMemory();
      fresh.restore(snapshot);
    },
    { iterations: 500, warmupIterations: 30 },
  );
});
