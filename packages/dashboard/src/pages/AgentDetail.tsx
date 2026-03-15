// ============================================================================
// BeeClaw Dashboard — Agent 详情页面
// ============================================================================

import { useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { fetchAgent } from '../api/client';
import { Card, ErrorState } from '../components';
import { AgentStatusBadge, ModelTierBadge } from '../components/StatusBadge';
import { SentimentBar } from '../components/SentimentBar';

/** 性格特征进度条 */
function TraitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-bee-500 rounded-full transition-all"
          style={{ width: `${(value * 100).toFixed(0)}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

/** 观点立场条 */
function StanceBar({ stance, confidence }: { stance: number; confidence: number }) {
  // stance: -1 ~ +1 -> 映射到 0% ~ 100%
  const pct = ((stance + 1) / 2) * 100;
  const color =
    stance > 0.2 ? 'bg-green-500' : stance < -0.2 ? 'bg-red-500' : 'bg-gray-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-400">反对</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden relative">
        {/* 中线 */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-gray-600" />
        <div
          className={`absolute top-0 h-full ${color} rounded-full transition-all`}
          style={{
            left: stance >= 0 ? '50%' : `${pct}%`,
            width: `${Math.abs(stance) * 50}%`,
          }}
        />
      </div>
      <span className="text-xs text-green-400">支持</span>
      <span className="text-xs text-gray-500 w-16 text-right">
        信心 {(confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();

  const fetcher = useCallback(() => fetchAgent(id!), [id]);
  const { data: agent, error, loading, refresh } = usePolling(fetcher, 10000);

  if (error) return <ErrorState message={error} onRetry={refresh} />;

  if (loading && !agent) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-800 rounded" />
          <div className="h-4 w-96 bg-gray-800 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 bg-gray-800 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    return <ErrorState message="Agent 未找到" />;
  }

  const opinions = Object.values(agent.memory.opinions);

  return (
    <div className="space-y-6">
      {/* 面包屑 + 标题 */}
      <div>
        <Link
          to="/agents"
          className="text-sm text-gray-500 hover:text-bee-400 transition-colors"
        >
          ← 返回 Agent 列表
        </Link>
        <div className="flex items-center gap-4 mt-2">
          <span className="w-12 h-12 rounded-full bg-gradient-to-br from-bee-500 to-bee-700 flex items-center justify-center text-lg font-bold text-white">
            {agent.name.charAt(0)}
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white">{agent.name}</h2>
              <AgentStatusBadge status={agent.status} />
              <ModelTierBadge tier={agent.modelTier} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {agent.persona.profession} · ID: {agent.id.slice(0, 12)}...
            </p>
          </div>
        </div>
      </div>

      {/* 概览统计行 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">影响力</p>
          <p className="stat-value">{agent.influence}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">信誉度</p>
          <p className={`stat-value ${agent.credibility >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {agent.credibility}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">粉丝</p>
          <p className="stat-value">{agent.followers.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">关注</p>
          <p className="stat-value">{agent.following.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 人格 Persona */}
        <Card title="人格画像">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs text-gray-500 uppercase mb-1">背景</h4>
              <p className="text-sm text-gray-300 leading-relaxed">{agent.persona.background}</p>
            </div>
            <div>
              <h4 className="text-xs text-gray-500 uppercase mb-1">表达风格</h4>
              <p className="text-sm text-gray-300">{agent.persona.communicationStyle}</p>
            </div>
            <div>
              <h4 className="text-xs text-gray-500 uppercase mb-1">专业领域</h4>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {agent.persona.expertise.map((e) => (
                  <span key={e} className="badge bg-bee-900/30 text-bee-400 border border-bee-800">
                    {e}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs text-gray-500 uppercase mb-1">认知偏见</h4>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {agent.persona.biases.map((b) => (
                  <span key={b} className="badge bg-orange-900/30 text-orange-400 border border-orange-800">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* 性格特征 */}
        <Card title="性格特征">
          <div className="space-y-3">
            <TraitBar label="风险偏好" value={agent.persona.traits.riskTolerance} />
            <TraitBar label="信息敏感" value={agent.persona.traits.informationSensitivity} />
            <TraitBar label="从众性" value={agent.persona.traits.conformity} />
            <TraitBar label="情绪化" value={agent.persona.traits.emotionality} />
            <TraitBar label="分析深度" value={agent.persona.traits.analyticalDepth} />
          </div>

          <div className="mt-6 pt-4 border-t border-gray-800">
            <h4 className="text-xs text-gray-500 uppercase mb-3">生命周期</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">出生 Tick</span>
                <p className="text-gray-300 font-mono">#{agent.spawnedAtTick}</p>
              </div>
              <div>
                <span className="text-gray-500">最后活跃</span>
                <p className="text-gray-300 font-mono">#{agent.lastActiveTick}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* 观点立场 */}
        <Card title="观点立场">
          {opinions.length > 0 ? (
            <div className="space-y-4">
              {opinions.map((op) => (
                <div key={op.topic} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-200">{op.topic}</span>
                    <span className="text-xs text-gray-500 font-mono">Tick #{op.lastUpdatedTick}</span>
                  </div>
                  <StanceBar stance={op.stance} confidence={op.confidence} />
                  <p className="text-xs text-gray-500 leading-relaxed">{op.reasoning}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center">暂无观点记录</p>
          )}
        </Card>

        {/* 记忆 */}
        <Card title="短期记忆">
          {agent.memory.shortTerm.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {agent.memory.shortTerm.slice(0, 20).map((mem, i) => (
                <div key={i} className="flex gap-3 py-2 border-b border-gray-800/50 last:border-0">
                  <div className="shrink-0">
                    <span className="text-xs text-gray-600 font-mono">#{mem.tick}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="badge bg-gray-800 text-gray-400 text-[10px]">{mem.type}</span>
                      {mem.emotionalImpact !== 0 && (
                        <SentimentBar
                          bullish={Math.max(0, mem.emotionalImpact)}
                          bearish={Math.max(0, -mem.emotionalImpact)}
                          neutral={0}
                          showLabels={false}
                          height="h-1"
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed truncate">{mem.content}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center">暂无记忆</p>
          )}
        </Card>

        {/* 长期记忆 */}
        {agent.memory.longTerm.length > 0 && (
          <Card title="长期记忆">
            <div className="space-y-3">
              {agent.memory.longTerm.map((mem, i) => (
                <div key={i} className="p-3 bg-gray-800/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-mono">
                      Tick #{mem.tickRange[0]} ~ #{mem.tickRange[1]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{mem.summary}</p>
                  {mem.keyInsights.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {mem.keyInsights.map((insight, j) => (
                        <span key={j} className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                          {insight}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 预测记录 */}
        {agent.memory.predictions.length > 0 && (
          <Card title="预测记录">
            <div className="space-y-2">
              {agent.memory.predictions.map((pred, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-800/50 last:border-0">
                  <span className="text-xs text-gray-600 font-mono shrink-0">#{pred.tick}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-300">{pred.prediction}</p>
                    {pred.outcome && (
                      <p className="text-xs text-gray-500 mt-1">结果: {pred.outcome}</p>
                    )}
                  </div>
                  {pred.accurate !== undefined && (
                    <span className={`badge ${pred.accurate ? 'badge-active' : 'badge-dead'}`}>
                      {pred.accurate ? '准确' : '偏差'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
