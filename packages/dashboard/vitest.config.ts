// ============================================================================
// BeeClaw Dashboard — Vitest 配置
// 独立的 vitest.config.ts 确保 vitest workspace（v4）能正确识别 jsdom 环境
// ============================================================================

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    css: false,
  },
});
