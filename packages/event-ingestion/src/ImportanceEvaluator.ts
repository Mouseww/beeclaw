// ============================================================================
// ImportanceEvaluator — 事件重要性自动评估
// 基于关键词匹配 + 启发式规则
// ============================================================================

import type { FeedItem, ImportanceAssessment } from './types.js';

/** 默认高重要性关键词 */
const DEFAULT_HIGH_KEYWORDS = [
  '央行', '加息', '降息', '美联储', 'Fed', '利率',
  '战争', '冲突', '制裁', '危机', '崩盘', '暴跌', '暴涨',
  '破产', '倒闭', '违约', '爆雷',
  'GDP', '通胀', '通缩', 'CPI',
  '重大', '紧急', '突发', 'breaking',
  '退市', '熔断', '跌停', '涨停',
  'IPO', '收购', '合并', '上市',
];

/** 默认中重要性关键词 */
const DEFAULT_MEDIUM_KEYWORDS = [
  '政策', '监管', '法规', '改革',
  '科技', 'AI', '人工智能', '芯片', '半导体',
  '股市', '债市', '汇率', '黄金', '原油', '比特币',
  '财报', '营收', '利润', '增长', '下滑',
  '就业', '失业', '工资', '房价',
  '出口', '进口', '关税', '贸易',
  '发布', '更新', '公告', '声明',
];

export class ImportanceEvaluator {
  private highKeywords: string[];
  private mediumKeywords: string[];

  constructor(
    highKeywords?: string[],
    mediumKeywords?: string[],
  ) {
    this.highKeywords = highKeywords ?? DEFAULT_HIGH_KEYWORDS;
    this.mediumKeywords = mediumKeywords ?? DEFAULT_MEDIUM_KEYWORDS;
  }

  /**
   * 评估一个 Feed 条目的重要性
   */
  evaluate(item: FeedItem): ImportanceAssessment {
    const searchText = `${item.title} ${item.content}`.toLowerCase();
    const matchedKeywords: string[] = [];
    let score = 0;

    // 高重要性关键词匹配（每个 +0.15）
    for (const keyword of this.highKeywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        score += 0.15;
      }
    }

    // 中重要性关键词匹配（每个 +0.08）
    for (const keyword of this.mediumKeywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        score += 0.08;
      }
    }

    // 启发式调整：标题长度（通常更具描述性的标题更重要）
    if (item.title.length > 20) {
      score += 0.05;
    }

    // 启发式调整：有分类的条目可能更结构化
    if (item.categories && item.categories.length > 0) {
      score += 0.03;
    }

    // 启发式调整：内容长度（更详细的报道通常更重要）
    if (item.content.length > 500) {
      score += 0.05;
    } else if (item.content.length > 200) {
      score += 0.03;
    }

    // 基础重要性：没有任何匹配的条目仍有基础分
    const baseImportance = 0.2;
    const importance = Math.min(1, baseImportance + score);

    // 传播半径与重要性正相关，但整体偏保守
    const propagationRadius = Math.min(0.8, importance * 0.6);

    return {
      importance: Math.round(importance * 100) / 100,
      propagationRadius: Math.round(propagationRadius * 100) / 100,
      matchedKeywords,
    };
  }
}
