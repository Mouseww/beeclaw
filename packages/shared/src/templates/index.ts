// ============================================================================
// 场景模板注册表 — 管理所有预设场景模板
// ============================================================================

import type { ScenarioTemplate } from '../types.js';
import { financeMarketTemplate } from './finance-market.js';
import { productLaunchTemplate } from './product-launch.js';
import { policyImpactTemplate } from './policy-impact.js';

/** 所有预设场景模板 */
export const BUILTIN_TEMPLATES: ScenarioTemplate[] = [
  financeMarketTemplate,
  productLaunchTemplate,
  policyImpactTemplate,
];

/** 场景模板注册表 */
export class ScenarioRegistry {
  private templates: Map<string, ScenarioTemplate> = new Map();

  constructor() {
    // 注册内置模板
    for (const template of BUILTIN_TEMPLATES) {
      this.register(template);
    }
  }

  /**
   * 注册一个场景模板
   */
  register(template: ScenarioTemplate): void {
    if (this.templates.has(template.name)) {
      throw new Error(`场景模板 "${template.name}" 已存在`);
    }
    this.templates.set(template.name, template);
  }

  /**
   * 获取场景模板
   */
  get(name: string): ScenarioTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * 列出所有可用模板
   */
  list(): ScenarioTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 列出所有可用模板名称
   */
  listNames(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * 检查模板是否存在
   */
  has(name: string): boolean {
    return this.templates.has(name);
  }

  /**
   * 移除模板
   */
  remove(name: string): boolean {
    return this.templates.delete(name);
  }

  /**
   * 获取模板数量
   */
  get size(): number {
    return this.templates.size;
  }
}

// 导出单个模板
export { financeMarketTemplate } from './finance-market.js';
export { productLaunchTemplate } from './product-launch.js';
export { policyImpactTemplate } from './policy-impact.js';
