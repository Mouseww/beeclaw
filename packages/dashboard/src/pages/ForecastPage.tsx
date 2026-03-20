// ============================================================================
// BeeClaw Dashboard — 用户输入式推演页
// ============================================================================

import { useMemo, useState } from 'react';
import { forecastScenario } from '../api/client';
import type { ForecastResult } from '../types';
import { Card, ErrorState } from '../components';

const SCENARIOS = [
  { value: 'hot-event', label: '热点事件预测', hint: '适合预测新闻、行情、行业热点的后续发酵' },
  { value: 'product-launch', label: '产品发布预演', hint: '适合预测新品上线、定价调整、市场反馈' },
  { value: 'policy-impact', label: '政策影响评估', hint: '适合预测政策变化对群体和舆论的影响' },
  { value: 'roundtable', label: 'AI 圆桌讨论', hint: '适合模拟多角色围绕议题的冲突与共识' },
] as const;

function getResultTypeLabel(result: ForecastResult): string {
  if (result.resultType === 'ForecastValue') return '数值预测';
  if (result.resultType === 'Judgment') return '判断结果';
  if (result.resultType === 'BestMatch') return '最佳匹配';
  if (result.resultType === 'Strategy') return '策略结果';
  if (result.resultType === 'Evolution') return '演变结果';
  if (result.resultType === 'Risk') return '风险结果';
  if (result.resultType === 'Ranking') return '排名结果';
  if (result.resultType === 'Insight') return '关键洞察';
  if (result.resultType === 'Reaction') return '市场反应';

  return result.directAnswer.questionType === 'numeric-forecast'
    ? '数值预测'
    : result.directAnswer.questionType === 'judgement'
      ? '判断预测'
      : result.directAnswer.questionType === 'decision-simulation'
        ? '决策预演'
        : '传播推演';
}

function getConfidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  if (confidence === 'high') return '高';
  if (confidence === 'medium') return '中';
  return '低';
}

function extractDisplayTimepoint(result: ForecastResult): string {
  if (result.mainResult?.type === 'ForecastValue' && result.mainResult.timepoint) {
    return result.mainResult.timepoint;
  }

  const event = result.event.replace(/\s+/g, '');
  if (/2026年(?:年底|年末)/.test(event)) return '2026 年底';
  if (/2027年(?:年底|年末)/.test(event)) return '2027 年底';
  if (/2026年/.test(event)) return '2026 年';
  if (/2027年/.test(event)) return '2027 年';
  if (/明年年底|明年年末/.test(event)) return '明年年底';
  if (/后年年底|后年年末/.test(event)) return '后年年底';
  if (/明年/.test(event)) return '明年';
  if (/后年/.test(event)) return '后年';
  return '目标时间点';
}

function renderMainResult(result: ForecastResult) {
  const main = result.mainResult;
  if (!main) {
    return (
      <>
        <p className="text-base sm:text-lg leading-7 font-medium" style={{ color: 'var(--text-heading)' }}>
          {result.directAnswer.answer}
        </p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>关键假设</p>
            <ul className="space-y-2 list-disc pl-5">
              {result.directAnswer.assumptions.map((item) => (
                <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>核心驱动因素</p>
            <ul className="space-y-2 list-disc pl-5">
              {result.directAnswer.drivers.map((item) => (
                <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </>
    );
  }

  switch (main.type) {
    case 'ForecastValue':
      return (
        <div className="space-y-4">
          <p className="text-base sm:text-lg leading-7 font-medium" style={{ color: 'var(--text-heading)' }}>{main.headline}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>预测值</p>
              <p className="text-lg font-semibold text-bee-400">{main.pointEstimate}</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>预测区间</p>
              <p className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>{main.range}</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>时间点</p>
              <p className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>{extractDisplayTimepoint(result)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>置信度</p>
              <p className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>{getConfidenceLabel(main.confidence)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>关键假设</p>
              <ul className="space-y-2 list-disc pl-5">
                {main.assumptions.map((item) => (
                  <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>核心驱动因素</p>
              <ul className="space-y-2 list-disc pl-5">
                {main.drivers.map((item) => (
                  <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    case 'Judgment':
      return (
        <div className="space-y-4">
          <p className="text-base sm:text-lg leading-7 font-medium" style={{ color: 'var(--text-heading)' }}>{main.headline}</p>
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>明确判断</p>
            <p className="text-lg font-semibold text-bee-400">{main.verdict}</p>
          </div>
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>判断依据</p>
            <ul className="space-y-2 list-disc pl-5">
              {main.reasoning.map((item) => (
                <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    case 'BestMatch':
      return (
        <div className="space-y-4">
          <p className="text-base sm:text-lg leading-7 font-medium" style={{ color: 'var(--text-heading)' }}>{main.headline}</p>
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>最匹配对象</p>
            <p className="text-lg font-semibold text-bee-400">{main.match}</p>
          </div>
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>为什么是它</p>
            <ul className="space-y-2 list-disc pl-5">
              {main.rationale.map((item) => (
                <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    case 'Reaction':
      return (
        <div className="space-y-4">
          <p className="text-base sm:text-lg leading-7 font-medium" style={{ color: 'var(--text-heading)' }}>{main.headline}</p>
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>反应顺序</p>
            <div className="space-y-3">
              {main.sequence.map((item) => (
                <div key={`${item.actor}-${item.timing}`} className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{item.actor}</span>
                    <span className="text-xs text-bee-400">{item.timing}</span>
                  </div>
                  <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.reaction}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-heading)' }}>主要分歧</p>
            <ul className="space-y-2 list-disc pl-5">
              {main.divergence.map((item) => (
                <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    default:
      return (
        <p className="text-base sm:text-lg leading-7 font-medium" style={{ color: 'var(--text-heading)' }}>
          {main.headline}
        </p>
      );
  }
}

export function ForecastPage() {
  const [event, setEvent] = useState('');
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['value']>('hot-event');
  const [ticks, setTicks] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForecastResult | null>(null);

  const selectedScenario = useMemo(
    () => SCENARIOS.find((item) => item.value === scenario) ?? SCENARIOS[0],
    [scenario],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!event.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const data = await forecastScenario({
        event: event.trim(),
        scenario,
        ticks,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '推演失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold theme-text-heading" style={{ color: 'var(--text-heading)' }}>推演预测</h2>
        <p className="text-sm theme-text-muted mt-1" style={{ color: 'var(--text-muted)' }}>
          输入一个事件、问题或决策，BeeClaw 会通过多角色推演，给出与你问题类型匹配的最终结果。
        </p>
      </div>

      <Card title="输入一个你想预测的事情">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                事件 / 问题 / 决策
              </label>
              <textarea
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                rows={5}
                placeholder="例如：如果 BeeClaw 对普通用户开放，市场、开发者和媒体会怎么反应？"
                className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-bee-500 theme-input"
                style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  场景类型
                </label>
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value as (typeof SCENARIOS)[number]['value'])}
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bee-500 theme-input"
                  style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                >
                  {SCENARIOS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{selectedScenario.hint}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    推演轮数
                  </label>
                  <span className="text-xs text-bee-400">{ticks} 轮</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  value={ticks}
                  onChange={(e) => setTicks(Number(e.target.value))}
                  className="w-full accent-bee-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !event.trim()}
                className="w-full rounded-xl px-4 py-3 bg-bee-600 hover:bg-bee-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {submitting ? '推演中...' : '开始推演'}
              </button>
            </div>
          </div>
        </form>
      </Card>

      {error && <ErrorState message={error} />}

      {result && (
        <div className="space-y-4">
          <Card title="主结果">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="badge bg-green-500/15 text-green-400 border border-green-500/30">
                  {getResultTypeLabel(result)}
                </span>
                {result.resultType && (
                  <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    类型：{result.resultType}
                  </span>
                )}
                {result.mainResult?.type === 'ForecastValue' && (
                  <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    置信度：{getConfidenceLabel(result.mainResult.confidence)}
                  </span>
                )}
              </div>
              {renderMainResult(result)}
            </div>
          </Card>

          <Card title="推演摘要">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="badge bg-bee-500/15 text-bee-400 border border-bee-500/30">{result.scenarioLabel}</span>
                <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  {result.metrics.agentCount} Agents
                </span>
                <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  {result.metrics.ticks} 轮
                </span>
              </div>
              <p className="text-base leading-7" style={{ color: 'var(--text-secondary)' }}>{result.summary}</p>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="推演中的主要视角">
              <div className="space-y-3">
                {result.factions.map((faction) => (
                  <div key={faction.name} className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{faction.name}</span>
                      <span className="text-sm text-bee-400">{faction.share}%</span>
                    </div>
                    <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{faction.summary}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="支撑证据 / 关键反应">
              <div className="space-y-3">
                {result.keyReactions.map((item) => (
                  <div key={item.actor} className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-heading)' }}>{item.actor}</p>
                    <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.reaction}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="风险点">
              <ul className="space-y-2 list-disc pl-5">
                {result.risks.map((risk) => (
                  <li key={risk} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{risk}</li>
                ))}
              </ul>
            </Card>

            <Card title="建议动作">
              <ul className="space-y-2 list-disc pl-5">
                {result.recommendations.map((item) => (
                  <li key={item} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
