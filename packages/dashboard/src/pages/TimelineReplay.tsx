// ============================================================================
// BeeClaw Dashboard — 事件回放/时间轴页面
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePolling } from '../hooks/usePolling';
import { fetchHistory, fetchTickEvents, fetchTickResponses } from '../api/client';
import { Card, EmptyState, ErrorState, CardSkeleton } from '../components';
import type { TickEvent, TickResponse } from '../types';

// ── 播放状态 ──

type PlayState = 'stopped' | 'playing' | 'paused';

// ── 主组件 ──

export function TimelineReplay() {
  const { data: historyData, error, loading, refresh } = usePolling(() => fetchHistory(200), 10000);

  const ticks = historyData?.history ?? [];
  const sortedTicks = [...ticks].sort((a, b) => a.tick - b.tick);
  const maxTick = sortedTicks.length > 0 ? sortedTicks[sortedTicks.length - 1]!.tick : 0;
  const minTick = sortedTicks.length > 0 ? sortedTicks[0]!.tick : 0;

  // 当前选中的 tick 索引（在 sortedTicks 中的索引）
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playState, setPlayState] = useState<PlayState>('stopped');
  const [playSpeed, setPlaySpeed] = useState(1000); // 毫秒/帧

  // 当前 tick 的详细 events 和 responses
  const [tickEvents, setTickEvents] = useState<TickEvent[]>([]);
  const [tickResponses, setTickResponses] = useState<TickResponse[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const currentTick = sortedTicks[currentIndex] ?? null;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载指定 tick 的详细数据
  const loadTickDetail = useCallback(async (tickNum: number) => {
    setDetailLoading(true);
    setSelectedEventId(null);
    try {
      const [evtRes, respRes] = await Promise.all([
        fetchTickEvents(tickNum),
        fetchTickResponses(tickNum),
      ]);
      setTickEvents(evtRes.events ?? []);
      setTickResponses(respRes.responses ?? []);
    } catch {
      setTickEvents([]);
      setTickResponses([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // 当 currentIndex 变化时加载详细数据
  useEffect(() => {
    if (currentTick) {
      loadTickDetail(currentTick.tick);
    }
  }, [currentTick?.tick, loadTickDetail]);

  // 当历史数据首次加载完毕，跳转到最新 tick
  useEffect(() => {
    if (sortedTicks.length > 0 && playState === 'stopped') {
      setCurrentIndex(sortedTicks.length - 1);
    }
  }, [sortedTicks.length]);

  // 播放定时器
  useEffect(() => {
    if (playState === 'playing') {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= sortedTicks.length - 1) {
            setPlayState('paused');
            return prev;
          }
          return prev + 1;
        });
      }, playSpeed);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playState, playSpeed, sortedTicks.length]);

  // 控制函数
  const handlePlay = () => {
    if (currentIndex >= sortedTicks.length - 1) {
      setCurrentIndex(0);
    }
    setPlayState('playing');
  };
  const handlePause = () => setPlayState('paused');
  const handleStop = () => {
    setPlayState('stopped');
    setCurrentIndex(0);
  };
  const handleStepForward = () => {
    setPlayState('paused');
    setCurrentIndex((prev) => Math.min(prev + 1, sortedTicks.length - 1));
  };
  const handleStepBackward = () => {
    setPlayState('paused');
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };
  const handleSliderChange = (value: number) => {
    setPlayState('paused');
    setCurrentIndex(value);
  };

  // 根据选中事件过滤响应
  const filteredResponses = selectedEventId
    ? tickResponses.filter((r) => r.eventId === selectedEventId)
    : tickResponses;

  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>
          事件回放
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          按 Tick 逐帧回放世界演化 · 共 {sortedTicks.length} 帧（Tick {minTick}–{maxTick}）
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          <CardSkeleton count={3} />
        </div>
      ) : sortedTicks.length === 0 ? (
        <Card>
          <EmptyState icon="⏮️" message="暂无历史数据，等待世界运行..." />
        </Card>
      ) : (
        <>
          {/* 播放控制栏 */}
          <Card>
            <div className="space-y-4">
              {/* 时间轴滑块 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>Tick #{sortedTicks[0]?.tick ?? 0}</span>
                  <span className="font-mono text-bee-400 text-sm font-bold">
                    当前：Tick #{currentTick?.tick ?? '—'}
                  </span>
                  <span>Tick #{sortedTicks[sortedTicks.length - 1]?.tick ?? 0}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={sortedTicks.length - 1}
                  value={currentIndex}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-bee-500"
                  style={{ background: `linear-gradient(to right, var(--bee-500, #f59e0b) ${(currentIndex / Math.max(sortedTicks.length - 1, 1)) * 100}%, var(--bg-tertiary, #374151) ${(currentIndex / Math.max(sortedTicks.length - 1, 1)) * 100}%)` }}
                  data-testid="timeline-slider"
                />
              </div>

              {/* 控制按钮 */}
              <div className="flex items-center justify-center gap-3">
                {/* 停止 */}
                <button
                  onClick={handleStop}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: 'var(--text-secondary)' }}
                  title="停止并回到起点"
                  data-testid="btn-stop"
                >
                  ⏹
                </button>

                {/* 后退一帧 */}
                <button
                  onClick={handleStepBackward}
                  disabled={currentIndex <= 0}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: 'var(--text-secondary)' }}
                  title="后退一帧"
                  data-testid="btn-step-backward"
                >
                  ⏮
                </button>

                {/* 播放 / 暂停 */}
                {playState === 'playing' ? (
                  <button
                    onClick={handlePause}
                    className="p-3 rounded-full bg-bee-500 text-white shadow-lg hover:bg-bee-600 transition-colors text-lg"
                    title="暂停"
                    data-testid="btn-pause"
                  >
                    ⏸
                  </button>
                ) : (
                  <button
                    onClick={handlePlay}
                    className="p-3 rounded-full bg-bee-500 text-white shadow-lg hover:bg-bee-600 transition-colors text-lg"
                    title="播放"
                    data-testid="btn-play"
                  >
                    ▶
                  </button>
                )}

                {/* 前进一帧 */}
                <button
                  onClick={handleStepForward}
                  disabled={currentIndex >= sortedTicks.length - 1}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: 'var(--text-secondary)' }}
                  title="前进一帧"
                  data-testid="btn-step-forward"
                >
                  ⏭
                </button>

                {/* 速度控制 */}
                <div className="ml-4 flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>速度</span>
                  <select
                    value={playSpeed}
                    onChange={(e) => setPlaySpeed(Number(e.target.value))}
                    className="text-xs rounded px-2 py-1 border"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-secondary)',
                    }}
                    data-testid="speed-select"
                  >
                    <option value={2000}>0.5x</option>
                    <option value={1000}>1x</option>
                    <option value={500}>2x</option>
                    <option value={250}>4x</option>
                  </select>
                </div>
              </div>

              {/* 进度信息 */}
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>
                  帧 {currentIndex + 1} / {sortedTicks.length}
                </span>
                <span>
                  {playState === 'playing' ? '▶ 播放中' : playState === 'paused' ? '⏸ 已暂停' : '⏹ 已停止'}
                </span>
                {currentTick?.timestamp && (
                  <span>{new Date(currentTick.timestamp).toLocaleString('zh-CN')}</span>
                )}
              </div>
            </div>
          </Card>

          {/* Tick 概要信息 */}
          {currentTick && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MiniStat label="Tick" value={`#${currentTick.tick}`} accent />
              <MiniStat label="处理事件" value={String(currentTick.eventsProcessed)} />
              <MiniStat label="Agent 响应" value={String(currentTick.responsesCollected)} />
              <MiniStat label="耗时" value={`${currentTick.durationMs}ms`} />
            </div>
          )}

          {/* 事件和响应详情 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 事件列表 */}
            <Card title={`事件列表（${tickEvents.length}）`}>
              {detailLoading ? (
                <CardSkeleton count={2} />
              ) : tickEvents.length > 0 ? (
                <div className="space-y-2">
                  {tickEvents.map((evt) => (
                    <button
                      key={evt.id}
                      onClick={() => setSelectedEventId(selectedEventId === evt.id ? null : evt.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors border ${
                        selectedEventId === evt.id
                          ? 'border-bee-500/50 shadow-bee-500/10 shadow-md'
                          : 'border-transparent hover:border-white/10'
                      }`}
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                      data-testid={`event-item-${evt.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <CategoryIcon category={evt.category} />
                        <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {evt.title}
                        </span>
                        <ImportanceBadge importance={evt.importance} />
                      </div>
                      {selectedEventId === evt.id && (
                        <div className="mt-2 pt-2 border-t text-xs" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}>
                          <span>ID: {evt.id}</span>
                          <span className="ml-3">分类: {evt.category}</span>
                          <span className="ml-3">重要性: {Math.round(evt.importance * 100)}%</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon="📭" message="该 Tick 无事件" />
              )}
            </Card>

            {/* Agent 响应列表 */}
            <Card title={`Agent 响应（${filteredResponses.length}）`}>
              {detailLoading ? (
                <CardSkeleton count={2} />
              ) : filteredResponses.length > 0 ? (
                <div className="space-y-2 max-h-[480px] overflow-y-auto">
                  {filteredResponses.map((resp) => (
                    <ResponseItem key={resp.agentId} response={resp} />
                  ))}
                </div>
              ) : (
                <EmptyState icon="🤖" message="该 Tick 无 Agent 响应" />
              )}
            </Card>
          </div>

          {/* Tick 缩略时间轴 */}
          <Card title="Tick 时间轴">
            <div className="flex gap-1 flex-wrap">
              {sortedTicks.map((t, idx) => {
                const isActive = idx === currentIndex;
                const hasEvents = t.eventsProcessed > 0;
                return (
                  <button
                    key={t.tick}
                    onClick={() => handleSliderChange(idx)}
                    className={`w-8 h-8 rounded text-xs font-mono transition-all flex items-center justify-center ${
                      isActive
                        ? 'bg-bee-500 text-white shadow-lg scale-110'
                        : hasEvents
                          ? 'hover:bg-white/10'
                          : 'opacity-40 hover:opacity-70'
                    }`}
                    style={
                      isActive
                        ? undefined
                        : {
                            backgroundColor: 'var(--bg-tertiary)',
                            color: hasEvents ? 'var(--text-secondary)' : 'var(--text-faint)',
                          }
                    }
                    title={`Tick #${t.tick} — ${t.eventsProcessed} 事件, ${t.responsesCollected} 响应`}
                    data-testid={`tick-block-${t.tick}`}
                  >
                    {t.tick}
                  </button>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ── 子组件 ──

/** 迷你统计指标 */
function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-lg px-4 py-3 text-center"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
    >
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p
        className={`text-xl font-bold font-mono mt-1 ${accent ? 'text-bee-400' : ''}`}
        style={accent ? undefined : { color: 'var(--text-heading)' }}
      >
        {value}
      </p>
    </div>
  );
}

/** Agent 响应条目 */
function ResponseItem({ response }: { response: TickResponse }) {
  const emotionColor =
    response.emotionalState > 0.3
      ? 'text-green-400'
      : response.emotionalState < -0.3
        ? 'text-red-400'
        : 'text-gray-400';

  return (
    <div
      className="px-3 py-2 rounded-lg border"
      style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {response.agentName}
        </span>
        <span className={`text-xs font-mono ${emotionColor}`}>
          {response.emotionalState > 0 ? '+' : ''}
          {response.emotionalState.toFixed(2)}
        </span>
      </div>
      <p className="text-xs line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
        {response.opinion}
      </p>
      <span className="text-xs mt-1 inline-block" style={{ color: 'var(--text-faint)' }}>
        {response.action}
      </span>
    </div>
  );
}

/** 分类图标 */
function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, string> = {
    finance: '💰',
    politics: '🏛️',
    tech: '💻',
    social: '👥',
    general: '📋',
  };
  return <span className="text-sm w-6 text-center">{icons[category] ?? '📋'}</span>;
}

/** 重要性标签 */
function ImportanceBadge({ importance }: { importance: number }) {
  const pct = Math.round(importance * 100);
  const color =
    importance >= 0.7
      ? 'bg-red-500/20 text-red-400'
      : importance >= 0.4
        ? 'bg-yellow-500/20 text-yellow-400'
        : 'bg-gray-500/20 text-gray-400';
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${color}`}>
      {pct}%
    </span>
  );
}
