// ============================================================================
// ConsensusEngine — 共识提取引擎
// ============================================================================

import type {
  ConsensusSignal,
  AlertSignal,
  TrendDirection,
  TopArgument,
  WorldEvent,
} from '@beeclaw/shared';
import {
  aggregateSentiment,
  type AgentResponseRecord,
  type AggregatedSentiment,
} from './SentimentAggregator.js';

export class ConsensusEngine {
  /** 历史共识信号，按 topic 分组 */
  private signalHistory: Map<string, ConsensusSignal[]> = new Map();

  /**
   * 分析一个 tick 的 Agent 响应，提取共识信号
   */
  analyze(
    tick: number,
    event: WorldEvent,
    responses: AgentResponseRecord[]
  ): ConsensusSignal {
    const topic = event.title;

    // 聚合情绪
    const sentiment = aggregateSentiment(responses);

    // 提取主要论点
    const topArguments = this.extractTopArguments(responses);

    // 检测趋势
    const trend = this.detectTrend(topic, sentiment);

    // 检测预警信号
    const alerts = this.detectAlerts(topic, sentiment, responses);

    const signal: ConsensusSignal = {
      topic,
      tick,
      sentimentDistribution: sentiment.distribution,
      intensity: sentiment.intensity,
      consensus: sentiment.consensus,
      trend,
      topArguments,
      alerts,
    };

    // 保存到历史
    if (!this.signalHistory.has(topic)) {
      this.signalHistory.set(topic, []);
    }
    this.signalHistory.get(topic)!.push(signal);

    // 保留最近 50 个信号
    const history = this.signalHistory.get(topic)!;
    if (history.length > 50) {
      this.signalHistory.set(topic, history.slice(-50));
    }

    return signal;
  }

  /**
   * 提取主要论点
   */
  private extractTopArguments(responses: AgentResponseRecord[]): TopArgument[] {
    // 按行为分组统计
    const speakResponses = responses.filter(r => r.response.action === 'speak' || r.response.action === 'predict');

    if (speakResponses.length === 0) return [];

    // 简单方法：按情绪正负分组，提取代表性论点
    const bullish = speakResponses.filter(r => r.response.emotionalState > 0.15);
    const bearish = speakResponses.filter(r => r.response.emotionalState < -0.15);
    const neutral = speakResponses.filter(r =>
      r.response.emotionalState >= -0.15 && r.response.emotionalState <= 0.15
    );

    const args: TopArgument[] = [];

    if (bullish.length > 0) {
      const avgCred = bullish.reduce((s, r) => s + r.credibility, 0) / bullish.length;
      const representative = bullish[0]!;
      args.push({
        position: `看多: ${representative.response.opinion}`,
        supporters: bullish.length,
        avgCredibility: avgCred,
      });
    }

    if (bearish.length > 0) {
      const avgCred = bearish.reduce((s, r) => s + r.credibility, 0) / bearish.length;
      const representative = bearish[0]!;
      args.push({
        position: `看空: ${representative.response.opinion}`,
        supporters: bearish.length,
        avgCredibility: avgCred,
      });
    }

    if (neutral.length > 0) {
      const avgCred = neutral.reduce((s, r) => s + r.credibility, 0) / neutral.length;
      args.push({
        position: '中立观望',
        supporters: neutral.length,
        avgCredibility: avgCred,
      });
    }

    return args.sort((a, b) => b.supporters - a.supporters);
  }

  /**
   * 检测趋势方向
   */
  private detectTrend(topic: string, current: AggregatedSentiment): TrendDirection {
    const history = this.signalHistory.get(topic);
    if (!history || history.length < 2) return 'forming';

    const prev = history[history.length - 1]!;
    const prevEmotion = prev.sentimentDistribution.bullish - prev.sentimentDistribution.bearish;
    const currentEmotion = current.distribution.bullish - current.distribution.bearish;

    const delta = currentEmotion - prevEmotion;

    if (Math.abs(delta) < 0.05) {
      return current.consensus > 0.6 ? 'strengthening' : 'forming';
    }

    // 方向反转
    if ((prevEmotion > 0 && currentEmotion < 0) || (prevEmotion < 0 && currentEmotion > 0)) {
      return 'reversing';
    }

    // 同向增强或减弱
    if (Math.abs(currentEmotion) > Math.abs(prevEmotion)) {
      return 'strengthening';
    }
    return 'weakening';
  }

  /**
   * 检测预警信号
   */
  private detectAlerts(
    topic: string,
    sentiment: AggregatedSentiment,
    responses: AgentResponseRecord[]
  ): AlertSignal[] {
    const alerts: AlertSignal[] = [];

    // 情绪激烈变化
    if (sentiment.intensity > 0.7) {
      alerts.push({
        type: 'sentiment_shift',
        description: `话题"${topic}"情绪激烈度达到 ${(sentiment.intensity * 100).toFixed(0)}%`,
        confidence: sentiment.intensity,
        triggeredBy: responses.filter(r => Math.abs(r.response.emotionalState) > 0.7).map(r => r.agentId),
      });
    }

    // 共识崩塌
    if (sentiment.consensus < 0.3 && responses.length >= 5) {
      alerts.push({
        type: 'consensus_break',
        description: `话题"${topic}"共识度极低(${(sentiment.consensus * 100).toFixed(0)}%)，观点严重分化`,
        confidence: 1 - sentiment.consensus,
        triggeredBy: responses.map(r => r.agentId),
      });
    }

    // 逆向者涌现
    const contrarians = responses.filter(r => {
      if (sentiment.averageEmotion > 0.2) return r.response.emotionalState < -0.3;
      if (sentiment.averageEmotion < -0.2) return r.response.emotionalState > 0.3;
      return false;
    });

    if (contrarians.length >= 3 && contrarians.length / responses.length > 0.2) {
      alerts.push({
        type: 'contrarian_surge',
        description: `${contrarians.length}个Agent持逆向立场（${(contrarians.length / responses.length * 100).toFixed(0)}%）`,
        confidence: contrarians.length / responses.length,
        triggeredBy: contrarians.map(r => r.agentId),
      });
    }

    return alerts;
  }

  /**
   * 获取某话题的历史信号
   */
  getSignalHistory(topic: string): ConsensusSignal[] {
    return this.signalHistory.get(topic) ?? [];
  }

  /**
   * 获取所有话题
   */
  getAllTopics(): string[] {
    return [...this.signalHistory.keys()];
  }

  /**
   * 获取最新的所有信号
   */
  getLatestSignals(): ConsensusSignal[] {
    const latest: ConsensusSignal[] = [];
    for (const [, signals] of this.signalHistory) {
      if (signals.length > 0) {
        latest.push(signals[signals.length - 1]!);
      }
    }
    return latest;
  }
}
