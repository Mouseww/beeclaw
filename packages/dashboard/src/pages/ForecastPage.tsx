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
          输入一个事件、问题或决策，让 BeeClaw 世界替你跑一轮多角色推演。
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
          <Card title="直接回答">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="badge bg-green-500/15 text-green-400 border border-green-500/30">
                  {result.directAnswer.questionType === 'numeric-forecast' ? '数值预测' : result.directAnswer.questionType === 'judgement' ? '判断预测' : result.directAnswer.questionType === 'decision-simulation' ? '决策预演' : '传播推演'}
                </span>
                <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  置信度：{result.directAnswer.confidence}
                </span>
                {result.directAnswer.range && (
                  <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    区间：{result.directAnswer.range}
                  </span>
                )}
              </div>
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
            <Card title="主要阵营">
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

            <Card title="关键反应">
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
