// ============================================================================
// @beeclaw/agent-runtime AgentPersona 单元测试
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  generatePersona,
  generateAgentName,
  buildSystemPrompt,
  DEFAULT_TEMPLATE,
} from './AgentPersona.js';
import type { AgentPersona, AgentTemplate } from '@beeclaw/shared';

// ── generatePersona ──

describe('generatePersona', () => {
  it('应生成包含所有必要字段的人格', () => {
    const persona = generatePersona();
    expect(persona.background).toBeDefined();
    expect(typeof persona.background).toBe('string');
    expect(persona.profession).toBeDefined();
    expect(persona.traits).toBeDefined();
    expect(persona.expertise).toBeDefined();
    expect(persona.biases).toBeDefined();
    expect(persona.communicationStyle).toBeDefined();
  });

  it('职业应来自默认模板的职业池', () => {
    for (let i = 0; i < 20; i++) {
      const persona = generatePersona();
      expect(DEFAULT_TEMPLATE.professionPool).toContain(persona.profession);
    }
  });

  it('性格特征值应在模板定义的范围内', () => {
    for (let i = 0; i < 20; i++) {
      const persona = generatePersona();
      const { traits } = persona;
      const ranges = DEFAULT_TEMPLATE.traitRanges;

      expect(traits.riskTolerance).toBeGreaterThanOrEqual(ranges.riskTolerance[0]);
      expect(traits.riskTolerance).toBeLessThanOrEqual(ranges.riskTolerance[1]);
      expect(traits.informationSensitivity).toBeGreaterThanOrEqual(ranges.informationSensitivity[0]);
      expect(traits.informationSensitivity).toBeLessThanOrEqual(ranges.informationSensitivity[1]);
      expect(traits.conformity).toBeGreaterThanOrEqual(ranges.conformity[0]);
      expect(traits.conformity).toBeLessThanOrEqual(ranges.conformity[1]);
      expect(traits.emotionality).toBeGreaterThanOrEqual(ranges.emotionality[0]);
      expect(traits.emotionality).toBeLessThanOrEqual(ranges.emotionality[1]);
      expect(traits.analyticalDepth).toBeGreaterThanOrEqual(ranges.analyticalDepth[0]);
      expect(traits.analyticalDepth).toBeLessThanOrEqual(ranges.analyticalDepth[1]);
    }
  });

  it('专长领域应来自模板的专长池', () => {
    for (let i = 0; i < 20; i++) {
      const persona = generatePersona();
      const allExpertise = DEFAULT_TEMPLATE.expertisePool.flat();
      for (const exp of persona.expertise) {
        expect(allExpertise).toContain(exp);
      }
    }
  });

  it('认知偏见应来自模板的偏见池', () => {
    for (let i = 0; i < 20; i++) {
      const persona = generatePersona();
      for (const bias of persona.biases) {
        expect(DEFAULT_TEMPLATE.biasPool).toContain(bias);
      }
    }
  });

  it('认知偏见数量应在 1-3 个之间', () => {
    for (let i = 0; i < 30; i++) {
      const persona = generatePersona();
      expect(persona.biases.length).toBeGreaterThanOrEqual(1);
      expect(persona.biases.length).toBeLessThanOrEqual(3);
    }
  });

  it('背景故事应包含职业和专长信息', () => {
    const persona = generatePersona();
    expect(persona.background).toContain(persona.profession);
    for (const exp of persona.expertise) {
      expect(persona.background).toContain(exp);
    }
  });

  it('背景故事应包含风格描述', () => {
    const persona = generatePersona();
    // 应包含风格描述词之一
    const styleKeywords = ['激进', '稳健', '保守'];
    const hasStyle = styleKeywords.some(kw => persona.background.includes(kw));
    expect(hasStyle).toBe(true);
  });

  it('应支持自定义模板', () => {
    const customTemplate: AgentTemplate = {
      professionPool: ['测试工程师'],
      traitRanges: {
        riskTolerance: [0.5, 0.5],
        informationSensitivity: [0.5, 0.5],
        conformity: [0.5, 0.5],
        emotionality: [0.5, 0.5],
        analyticalDepth: [0.5, 0.5],
      },
      expertisePool: [['单元测试', '集成测试']],
      biasPool: ['测试偏见'],
    };

    const persona = generatePersona(customTemplate);
    expect(persona.profession).toBe('测试工程师');
    expect(persona.traits.riskTolerance).toBe(0.5);
    expect(persona.traits.informationSensitivity).toBe(0.5);
    expect(persona.expertise).toEqual(['单元测试', '集成测试']);
    expect(persona.biases).toEqual(['测试偏见']);
  });

  it('每次生成的人格应有随机性', () => {
    const personas = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const persona = generatePersona();
      personas.add(JSON.stringify(persona));
    }
    // 10 次生成应该不全相同
    expect(personas.size).toBeGreaterThan(1);
  });
});

// ── generateAgentName ──

describe('generateAgentName', () => {
  it('应生成 3 个字的中文名', () => {
    const name = generateAgentName();
    expect(name.length).toBe(3);
  });

  it('姓氏应是常见中文姓氏', () => {
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴',
      '徐', '孙', '马', '朱', '胡', '郭', '林', '何', '高', '梁'];
    for (let i = 0; i < 20; i++) {
      const name = generateAgentName();
      expect(surnames).toContain(name[0]);
    }
  });

  it('多次生成应有随机性', () => {
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(generateAgentName());
    }
    // 20 次生成应有多个不同名字
    expect(names.size).toBeGreaterThan(1);
  });
});

// ── buildSystemPrompt ──

describe('buildSystemPrompt', () => {
  const testPersona: AgentPersona = {
    background: '一位从业10年的金融分析师',
    profession: '金融分析师',
    traits: {
      riskTolerance: 0.7,
      informationSensitivity: 0.8,
      conformity: 0.3,
      emotionality: 0.2,
      analyticalDepth: 0.9,
    },
    expertise: ['宏观经济', '货币政策'],
    biases: ['确认偏见：倾向于寻找支持自己观点的信息'],
    communicationStyle: '理性分析型，喜欢用数据和逻辑说话',
  };

  it('应包含 Agent 名称', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('张明华');
  });

  it('应包含职业信息', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('金融分析师');
  });

  it('应包含背景信息', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('一位从业10年的金融分析师');
  });

  it('应包含专长领域', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('宏观经济');
    expect(prompt).toContain('货币政策');
  });

  it('应包含表达风格', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('理性分析型');
  });

  it('应包含性格特征描述和百分比', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('风险偏好');
    expect(prompt).toContain('70%');
    expect(prompt).toContain('信息敏感度');
    expect(prompt).toContain('80%');
  });

  it('应包含认知偏见', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('确认偏见');
  });

  it('应包含 JSON 响应格式说明', () => {
    const prompt = buildSystemPrompt(testPersona, '张明华');
    expect(prompt).toContain('opinion');
    expect(prompt).toContain('action');
    expect(prompt).toContain('emotionalState');
    expect(prompt).toContain('JSON');
  });

  it('性格特征等级描述应正确', () => {
    // 测试极高 (>=0.8)
    const highTraitPersona: AgentPersona = {
      ...testPersona,
      traits: { ...testPersona.traits, riskTolerance: 0.85 },
    };
    expect(buildSystemPrompt(highTraitPersona, '测试')).toContain('极高');

    // 测试较高 (>=0.6)
    const medHighPersona: AgentPersona = {
      ...testPersona,
      traits: { ...testPersona.traits, riskTolerance: 0.65 },
    };
    expect(buildSystemPrompt(medHighPersona, '测试')).toContain('较高');

    // 测试中等 (>=0.4)
    const medPersona: AgentPersona = {
      ...testPersona,
      traits: { ...testPersona.traits, riskTolerance: 0.45 },
    };
    expect(buildSystemPrompt(medPersona, '测试')).toContain('中等');

    // 测试较低 (>=0.2)
    const lowPersona: AgentPersona = {
      ...testPersona,
      traits: { ...testPersona.traits, riskTolerance: 0.25 },
    };
    expect(buildSystemPrompt(lowPersona, '测试')).toContain('较低');

    // 测试极低 (<0.2)
    const veryLowPersona: AgentPersona = {
      ...testPersona,
      traits: { ...testPersona.traits, riskTolerance: 0.1 },
    };
    expect(buildSystemPrompt(veryLowPersona, '测试')).toContain('极低');
  });
});

// ── DEFAULT_TEMPLATE ──

describe('DEFAULT_TEMPLATE', () => {
  it('职业池应非空', () => {
    expect(DEFAULT_TEMPLATE.professionPool.length).toBeGreaterThan(0);
  });

  it('专长池应非空', () => {
    expect(DEFAULT_TEMPLATE.expertisePool.length).toBeGreaterThan(0);
  });

  it('偏见池应非空', () => {
    expect(DEFAULT_TEMPLATE.biasPool.length).toBeGreaterThan(0);
  });

  it('性格范围应在 0-1 之间', () => {
    const ranges = DEFAULT_TEMPLATE.traitRanges;
    for (const [_key, [min, max]] of Object.entries(ranges)) {
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(1);
      expect(min).toBeLessThanOrEqual(max);
    }
  });
});
