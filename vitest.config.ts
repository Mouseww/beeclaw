// ============================================================================
// BeeClaw — Vitest 根配置（vitest v4 projects 模式）
// 支持从根目录 `npx vitest run` 运行所有包的测试
// dashboard 使用 jsdom 环境（独立 vitest.config.ts + defineProject），其他包使用默认 node 环境
// 注意：vitest v4 要求根配置文件名为 vitest.config.ts（不再识别 vitest.workspace.ts）
// ============================================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      // dashboard 有独立的 vitest.config.ts（jsdom + React plugin + setup files）
      'packages/dashboard',

      // 其他包使用默认 node 环境，通过 glob 统一匹配
      {
        test: {
          name: 'node-packages',
          include: [
            'packages/shared/src/**/*.test.ts',
            'packages/agent-runtime/src/**/*.test.ts',
            'packages/social-graph/src/**/*.test.ts',
            'packages/event-bus/src/**/*.test.ts',
            'packages/consensus/src/**/*.test.ts',
            'packages/coordinator/src/**/*.test.ts',
            'packages/world-engine/src/**/*.test.ts',
            'packages/event-ingestion/src/**/*.test.ts',
            'packages/cli/src/**/*.test.ts',
            'packages/server/src/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
