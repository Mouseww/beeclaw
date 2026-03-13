// ============================================================================
// 场景模板系统 — 单元测试
// 测试内置模板的结构完整性和 ScenarioRegistry
// ============================================================================

import { describe, it, expect } from 'vitest';
import { financeMarketTemplate } from './finance-market.js';
import { productLaunchTemplate } from './product-launch.js';
import { policyImpactTemplate } from './policy-impact.js';
import { ScenarioRegistry, BUILTIN_TEMPLATES } from './index.js';
import type { ScenarioTemplate, AgentProfile, EventSourceConfig } from '../types.js';

// ── 辅助校验函数 ──

function validateAgentProfile(profile: AgentProfile, ctx: string): void {
  expect(profile.role, `${ctx}: role 应为非空字符串`).toBeTruthy();
  expect(profile.count, `${ctx}: count 应大于 0`).toBeGreaterThan(0);
  expect(['local', 'cheap', 'strong'], `${ctx}: modelTier 应为有效层级`).toContain(profile.modelTier);

  const t = profile.template;
  expect(t.professionPool.length, `${ctx}: professionPool 应非空`).toBeGreaterThan(0);
  expect(t.expertisePool.length, `${ctx}: expertisePool 应非空`).toBeGreaterThan(0);
  expect(t.biasPool.length, `${ctx}: biasPool 应非空`).toBeGreaterThan(0);

  // traitRanges 校验
  const ranges = t.traitRanges;
  for (const key of ['riskTolerance', 'informationSensitivity', 'conformity', 'emotionality', 'analyticalDepth'] as const) {
    const range = ranges[key];
    expect(range, `${ctx}: traitRanges.${key} 应存在`).toBeDefined();
    expect(range[0], `${ctx}: ${key} min 应 >= 0`).toBeGreaterThanOrEqual(0);
    expect(range[1], `${ctx}: ${key} max 应 <= 1`).toBeLessThanOrEqual(1);
    expect(range[0], `${ctx}: ${key} min 应 <= max`).toBeLessThanOrEqual(range[1]);
  }
}

function validateEventSource(source: EventSourceConfig, ctx: string): void {
  expect(source.name, `${ctx}: name 应为非空字符串`).toBeTruthy();
  expect(['finance', 'rss', 'manual'], `${ctx}: type 应为有效类型`).toContain(source.type);
  expect(source.config, `${ctx}: config 应存在`).toBeDefined();
}

function validateTemplate(template: ScenarioTemplate): void {
  const ctx = `模板 "${template.name}"`;

  // 基础字段
  expect(template.name, `${ctx}: name 应非空`).toBeTruthy();
  expect(template.description, `${ctx}: description 应非空`).toBeTruthy();

  // agentProfiles
  expect(template.agentProfiles.length, `${ctx}: 应至少有 1 个角色`).toBeGreaterThan(0);
  for (const profile of template.agentProfiles) {
    validateAgentProfile(profile, `${ctx} 角色 "${profile.role}"`);
  }

  // eventSources
  expect(template.eventSources.length, `${ctx}: 应至少有 1 个事件源`).toBeGreaterThan(0);
  for (const source of template.eventSources) {
    validateEventSource(source, `${ctx} 事件源 "${source.name}"`);
  }

  // worldConfig
  expect(template.worldConfig, `${ctx}: worldConfig 应存在`).toBeDefined();

  // consensusConfig
  expect(template.consensusConfig, `${ctx}: consensusConfig 应存在`).toBeDefined();
}

// ── 测试 ──

describe('场景模板 — 结构校验', () => {
  describe('finance-market 模板', () => {
    it('应通过完整结构校验', () => {
      validateTemplate(financeMarketTemplate);
    });

    it('名称应为 finance-market', () => {
      expect(financeMarketTemplate.name).toBe('finance-market');
    });

    it('应包含 4 种角色', () => {
      expect(financeMarketTemplate.agentProfiles).toHaveLength(4);
      const roles = financeMarketTemplate.agentProfiles.map(p => p.role);
      expect(roles).toContain('散户投资者');
      expect(roles).toContain('机构交易员');
      expect(roles).toContain('金融分析师');
      expect(roles).toContain('财经记者');
    });

    it('Agent 总数应为 25', () => {
      const total = financeMarketTemplate.agentProfiles.reduce((s, p) => s + p.count, 0);
      expect(total).toBe(25);
    });

    it('应包含金融类型的事件源', () => {
      const finSources = financeMarketTemplate.eventSources.filter(s => s.type === 'finance');
      expect(finSources.length).toBeGreaterThanOrEqual(1);
    });

    it('应有种子事件', () => {
      expect(financeMarketTemplate.seedEvents).toBeDefined();
      expect(financeMarketTemplate.seedEvents!.length).toBeGreaterThan(0);
      expect(financeMarketTemplate.seedEvents![0].category).toBe('finance');
    });

    it('应有孵化规则', () => {
      expect(financeMarketTemplate.spawnRules).toBeDefined();
      expect(financeMarketTemplate.spawnRules!.length).toBeGreaterThan(0);
    });

    it('应启用自然选择', () => {
      expect(financeMarketTemplate.worldConfig.enableNaturalSelection).toBe(true);
    });

    it('duration 应为 100', () => {
      expect(financeMarketTemplate.duration).toBe(100);
    });
  });

  describe('product-launch 模板', () => {
    it('应通过完整结构校验', () => {
      validateTemplate(productLaunchTemplate);
    });

    it('名称应为 product-launch', () => {
      expect(productLaunchTemplate.name).toBe('product-launch');
    });

    it('应包含 4 种角色', () => {
      expect(productLaunchTemplate.agentProfiles).toHaveLength(4);
      const roles = productLaunchTemplate.agentProfiles.map(p => p.role);
      expect(roles).toContain('早期用户');
      expect(roles).toContain('意见领袖');
      expect(roles).toContain('普通消费者');
      expect(roles).toContain('竞品用户');
    });

    it('Agent 总数应为 30', () => {
      const total = productLaunchTemplate.agentProfiles.reduce((s, p) => s + p.count, 0);
      expect(total).toBe(30);
    });

    it('应包含 RSS 类型的事件源', () => {
      const rssSources = productLaunchTemplate.eventSources.filter(s => s.type === 'rss');
      expect(rssSources.length).toBeGreaterThanOrEqual(1);
    });

    it('应有手动事件源', () => {
      const manualSources = productLaunchTemplate.eventSources.filter(s => s.type === 'manual');
      expect(manualSources.length).toBeGreaterThanOrEqual(1);
    });

    it('意见领袖应使用 strong 模型', () => {
      const kol = productLaunchTemplate.agentProfiles.find(p => p.role === '意见领袖');
      expect(kol).toBeDefined();
      expect(kol!.modelTier).toBe('strong');
    });

    it('duration 应为 50', () => {
      expect(productLaunchTemplate.duration).toBe(50);
    });
  });

  describe('policy-impact 模板', () => {
    it('应通过完整结构校验', () => {
      validateTemplate(policyImpactTemplate);
    });

    it('名称应为 policy-impact', () => {
      expect(policyImpactTemplate.name).toBe('policy-impact');
    });

    it('应包含 4 种角色', () => {
      expect(policyImpactTemplate.agentProfiles).toHaveLength(4);
      const roles = policyImpactTemplate.agentProfiles.map(p => p.role);
      expect(roles).toContain('企业主');
      expect(roles).toContain('打工人');
      expect(roles).toContain('政策制定者');
      expect(roles).toContain('媒体人');
    });

    it('Agent 总数应为 30', () => {
      const total = policyImpactTemplate.agentProfiles.reduce((s, p) => s + p.count, 0);
      expect(total).toBe(30);
    });

    it('政策制定者应使用 strong 模型', () => {
      const policy = policyImpactTemplate.agentProfiles.find(p => p.role === '政策制定者');
      expect(policy).toBeDefined();
      expect(policy!.modelTier).toBe('strong');
    });

    it('打工人应使用 local 模型（最经济）', () => {
      const worker = policyImpactTemplate.agentProfiles.find(p => p.role === '打工人');
      expect(worker).toBeDefined();
      expect(worker!.modelTier).toBe('local');
    });

    it('应有 2 个孵化规则', () => {
      expect(policyImpactTemplate.spawnRules).toBeDefined();
      expect(policyImpactTemplate.spawnRules!).toHaveLength(2);
    });

    it('duration 应为 80', () => {
      expect(policyImpactTemplate.duration).toBe(80);
    });

    it('tickInterval 应为 45 秒', () => {
      expect(policyImpactTemplate.worldConfig.tickIntervalMs).toBe(45_000);
    });
  });
});

describe('BUILTIN_TEMPLATES', () => {
  it('应包含 3 个模板', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(3);
  });

  it('所有模板名称应唯一', () => {
    const names = BUILTIN_TEMPLATES.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('所有模板应通过结构校验', () => {
    for (const template of BUILTIN_TEMPLATES) {
      validateTemplate(template);
    }
  });
});

describe('ScenarioRegistry', () => {
  it('应自动注册内置模板', () => {
    const registry = new ScenarioRegistry();
    expect(registry.size).toBe(3);
    expect(registry.has('finance-market')).toBe(true);
    expect(registry.has('product-launch')).toBe(true);
    expect(registry.has('policy-impact')).toBe(true);
  });

  it('list 应返回所有模板', () => {
    const registry = new ScenarioRegistry();
    const all = registry.list();
    expect(all).toHaveLength(3);
  });

  it('listNames 应返回所有模板名', () => {
    const registry = new ScenarioRegistry();
    const names = registry.listNames();
    expect(names).toContain('finance-market');
    expect(names).toContain('product-launch');
    expect(names).toContain('policy-impact');
  });

  it('get 应返回正确的模板', () => {
    const registry = new ScenarioRegistry();
    const template = registry.get('finance-market');
    expect(template).toBeDefined();
    expect(template!.name).toBe('finance-market');
  });

  it('get 不存在的模板应返回 undefined', () => {
    const registry = new ScenarioRegistry();
    expect(registry.get('non-existent')).toBeUndefined();
  });

  it('register 应注册自定义模板', () => {
    const registry = new ScenarioRegistry();
    const custom: ScenarioTemplate = {
      name: 'custom-template',
      description: '自定义模板',
      agentProfiles: [{
        role: '自定义角色',
        count: 5,
        modelTier: 'local',
        template: {
          professionPool: ['测试员'],
          traitRanges: {
            riskTolerance: [0.3, 0.7],
            informationSensitivity: [0.3, 0.7],
            conformity: [0.3, 0.7],
            emotionality: [0.3, 0.7],
            analyticalDepth: [0.3, 0.7],
          },
          expertisePool: [['测试']],
          biasPool: ['偏见'],
        },
      }],
      eventSources: [{ type: 'manual', name: '手动', config: {} }],
      worldConfig: {},
      consensusConfig: {},
    };

    registry.register(custom);
    expect(registry.size).toBe(4);
    expect(registry.get('custom-template')).toBe(custom);
  });

  it('注册同名模板应抛出错误', () => {
    const registry = new ScenarioRegistry();
    expect(() => registry.register(financeMarketTemplate)).toThrow('已存在');
  });

  it('remove 应移除模板', () => {
    const registry = new ScenarioRegistry();
    expect(registry.remove('finance-market')).toBe(true);
    expect(registry.size).toBe(2);
    expect(registry.has('finance-market')).toBe(false);
  });

  it('remove 不存在的模板应返回 false', () => {
    const registry = new ScenarioRegistry();
    expect(registry.remove('non-existent')).toBe(false);
    expect(registry.size).toBe(3);
  });

  it('has 应正确判断模板是否存在', () => {
    const registry = new ScenarioRegistry();
    expect(registry.has('finance-market')).toBe(true);
    expect(registry.has('non-existent')).toBe(false);
  });

  it('多个 ScenarioRegistry 实例应独立', () => {
    const registry1 = new ScenarioRegistry();
    const registry2 = new ScenarioRegistry();

    registry1.remove('finance-market');
    expect(registry1.size).toBe(2);
    expect(registry2.size).toBe(3); // 不受影响
  });
});
