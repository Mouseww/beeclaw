// ============================================================================
// SentimentAggregator — 情绪聚合器
// ============================================================================

import type { AgentResponse, SentimentDistribution } from '@beeclaw/shared';

export interface AgentResponseRecord {
  agentId: string;
  agentName: string;
  credibility: number;
  response: AgentResponse;
}

export interface AggregatedSentiment {
  distribution: SentimentDistribution;
  intensity: number;       // 0-1 群体情绪激烈程度
  averageEmotion: number;  // -1 ~ +1 平均情绪
  consensus: number;       // 0-1 观点一致性
}

/**
 * 聚合一组 Agent 的情绪数据
 */
export function aggregateSentiment(responses: AgentResponseRecord[]): AggregatedSentiment {
  if (responses.length === 0) {
    return {
      distribution: { bullish: 0, bearish: 0, neutral: 1 },
      intensity: 0,
      averageEmotion: 0,
      consensus: 0,
    };
  }

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let totalEmotion = 0;
  let totalWeight = 0;
  const emotions: number[] = [];

  for (const record of responses) {
    const emotion = record.response.emotionalState;
    const weight = 0.5 + record.credibility * 0.5; // 信誉越高权重越大

    emotions.push(emotion);
    totalEmotion += emotion * weight;
    totalWeight += weight;

    if (emotion > 0.15) {
      bullishCount++;
    } else if (emotion < -0.15) {
      bearishCount++;
    } else {
      neutralCount++;
    }
  }

  const total = responses.length;
  const distribution: SentimentDistribution = {
    bullish: bullishCount / total,
    bearish: bearishCount / total,
    neutral: neutralCount / total,
  };

  // 加权平均情绪
  const averageEmotion = totalWeight > 0 ? totalEmotion / totalWeight : 0;

  // 情绪激烈程度 = 情绪的绝对值均值
  const intensity = emotions.reduce((sum, e) => sum + Math.abs(e), 0) / total;

  // 共识度 = 1 - 标准差（情绪越集中，共识越高）
  const variance = emotions.reduce((sum, e) => sum + (e - averageEmotion) ** 2, 0) / total;
  const stdDev = Math.sqrt(variance);
  const consensus = Math.max(0, 1 - stdDev);

  return { distribution, intensity, averageEmotion, consensus };
}
