// ============================================================================
// BeeClaw Dashboard — 事件接入监控页面
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { Card, StatCard, EmptyState, ErrorState } from '../components';
import { fetchIngestionStatus } from '../api/client';
import type { IngestionStatus, IngestionSourceStatus, IngestionFinanceSourceStatus } from '../types';

const REFRESH_INTERVAL = 10_000; // 10 秒自动刷新

export function IngestionView() {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchIngestionStatus();
      setStatus(data);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !status) {
    return (
      <div className="space-y-6">
        <PageHeader lastRefresh={null} />
        <Card>
          <EmptyState icon="📡" message="正在加载事件接入状态..." />
        </Card>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="space-y-6">
        <PageHeader lastRefresh={null} />
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-6">
      <PageHeader lastRefresh={lastRefresh} />

      {/* 整体状态概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="运行状态"
          value={status.running ? '运行中' : '已停止'}
          icon={status.running ? '🟢' : '🔴'}
        />
        <StatCard
          title="RSS 数据源"
          value={status.sourceCount}
          icon="📰"
        />
        <StatCard
          title="金融数据源"
          value={status.financeSourceCount}
          icon="💰"
        />
        <StatCard
          title="去重缓存"
          value={status.deduplicationCacheSize}
          subtitle="已缓存事件 GUID"
          icon="🗂️"
        />
      </div>

      {/* RSS 数据源列表 */}
      {status.sources.length > 0 && (
        <Card title="📰 RSS 数据源">
          <div className="space-y-2">
            {status.sources.map((src) => (
              <RssSourceRow key={src.id} source={src} />
            ))}
          </div>
        </Card>
      )}

      {/* 金融数据源列表 */}
      {status.financeSources.length > 0 && (
        <Card title="💰 金融数据源">
          <div className="space-y-2">
            {status.financeSources.map((src) => (
              <FinanceSourceRow key={src.id} source={src} />
            ))}
          </div>
        </Card>
      )}

      {status.sources.length === 0 && status.financeSources.length === 0 && (
        <Card>
          <EmptyState icon="📡" message="暂无已配置的数据源" />
        </Card>
      )}
    </div>
  );
}

/** 页面标题 */
function PageHeader({ lastRefresh }: { lastRefresh: Date | null }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>事件接入</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>RSS 和金融数据源状态监控</p>
      </div>
      {lastRefresh && (
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
          上次刷新：{lastRefresh.toLocaleTimeString('zh-CN')}
        </span>
      )}
    </div>
  );
}

/** RSS 数据源行 */
function RssSourceRow({ source }: { source: IngestionSourceStatus }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      {/* 状态指示 */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          source.lastError ? 'bg-red-400' : source.enabled ? 'bg-green-400' : 'bg-gray-500'
        }`}
      />

      {/* 名称和 URL */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {source.name}
          </span>
          {!source.enabled && (
            <span className="badge bg-gray-800 text-gray-400 border border-gray-700 text-xs">
              已禁用
            </span>
          )}
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-faint)' }}>
          {source.url}
        </p>
      </div>

      {/* 统计数据 */}
      <div className="flex items-center gap-4 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
        <MetricPill label="抓取" value={source.itemsFetched} />
        <MetricPill label="发射" value={source.eventsEmitted} />
        <span className="w-24 text-right">
          {source.lastPollTime
            ? new Date(source.lastPollTime).toLocaleTimeString('zh-CN')
            : '—'}
        </span>
      </div>

      {/* 错误提示 */}
      {source.lastError && (
        <span className="text-xs text-red-400 max-w-48 truncate" title={source.lastError}>
          ⚠️ {source.lastError}
        </span>
      )}
    </div>
  );
}

/** 金融数据源行 */
function FinanceSourceRow({ source }: { source: IngestionFinanceSourceStatus }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      {/* 状态指示 */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          source.lastError ? 'bg-red-400' : source.running ? 'bg-green-400 animate-pulse' : source.enabled ? 'bg-yellow-400' : 'bg-gray-500'
        }`}
      />

      {/* 名称 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {source.name}
          </span>
          {source.running ? (
            <span className="badge bg-green-900/50 text-green-400 border border-green-800 text-xs">
              运行中
            </span>
          ) : !source.enabled ? (
            <span className="badge bg-gray-800 text-gray-400 border border-gray-700 text-xs">
              已禁用
            </span>
          ) : (
            <span className="badge bg-yellow-900/50 text-yellow-400 border border-yellow-800 text-xs">
              已停止
            </span>
          )}
        </div>
      </div>

      {/* 统计 */}
      <div className="flex items-center gap-4 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
        <MetricPill label="标的" value={source.symbolCount} />
        <MetricPill label="行情" value={source.quotesPolled} />
        <MetricPill label="事件" value={source.eventsEmitted} />
        <span className="w-24 text-right">
          {source.lastPollTime
            ? new Date(source.lastPollTime).toLocaleTimeString('zh-CN')
            : '—'}
        </span>
      </div>

      {source.lastError && (
        <span className="text-xs text-red-400 max-w-48 truncate" title={source.lastError}>
          ⚠️ {source.lastError}
        </span>
      )}
    </div>
  );
}

/** 小指标胶囊 */
function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
