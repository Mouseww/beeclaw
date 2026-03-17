// ============================================================================
// @beeclaw/shared index 再导出验证测试
// 确保公共 API 完整导出
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  generateId,
  clamp,
  randomInRange,
  randomPick,
  randomSample,
  delay,
  safeJsonParse,
  extractJson,
  formatTimestamp,
  weightedAverage,
  truncate,
  batchProcess,
  createLogger,
  setLogLevel,
  getLogLevel,
  setJsonMode,
  isJsonMode,
  BUILTIN_TEMPLATES,
  ScenarioRegistry,
  financeMarketTemplate,
  productLaunchTemplate,
  policyImpactTemplate,
} from './index.js';

describe('@beeclaw/shared index 导出', () => {
  it('utils 函数应正确导出', () => {
    expect(typeof generateId).toBe('function');
    expect(typeof clamp).toBe('function');
    expect(typeof randomInRange).toBe('function');
    expect(typeof randomPick).toBe('function');
    expect(typeof randomSample).toBe('function');
    expect(typeof delay).toBe('function');
    expect(typeof safeJsonParse).toBe('function');
    expect(typeof extractJson).toBe('function');
    expect(typeof formatTimestamp).toBe('function');
    expect(typeof weightedAverage).toBe('function');
    expect(typeof truncate).toBe('function');
    expect(typeof batchProcess).toBe('function');
  });

  it('logger 函数应正确导出', () => {
    expect(typeof createLogger).toBe('function');
    expect(typeof setLogLevel).toBe('function');
    expect(typeof getLogLevel).toBe('function');
    expect(typeof setJsonMode).toBe('function');
    expect(typeof isJsonMode).toBe('function');
  });

  it('templates 应正确导出', () => {
    expect(Array.isArray(BUILTIN_TEMPLATES)).toBe(true);
    expect(BUILTIN_TEMPLATES.length).toBe(3);
    expect(ScenarioRegistry).toBeDefined();
    expect(financeMarketTemplate).toBeDefined();
    expect(productLaunchTemplate).toBeDefined();
    expect(policyImpactTemplate).toBeDefined();
  });

  it('通过 index 导出的函数应能正常工作', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test_/);

    expect(clamp(5, 0, 10)).toBe(5);
    expect(truncate('hello world', 5)).toBe('he...');

    const logger = createLogger('TestModule');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });
});
