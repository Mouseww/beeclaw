// ============================================================================
// BeeClaw Dashboard — Vitest 项目配置
// 使用 defineProject（非 defineConfig）确保 vitest v4 workspace 正确识别 jsdom 环境
// ============================================================================

import { defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'dashboard',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    css: false,
  },
});
