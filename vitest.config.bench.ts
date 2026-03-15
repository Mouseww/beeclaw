// ============================================================================
// BeeClaw — Vitest Benchmark 配置
// 运行: npx vitest bench --config vitest.config.bench.ts
// ============================================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
    },
  },
});
