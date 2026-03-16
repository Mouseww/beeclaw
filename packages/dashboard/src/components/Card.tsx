// ============================================================================
// BeeClaw Dashboard — 卡片组件
// ============================================================================

import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** 通用卡片容器 */
export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div className={`card mb-4 ${className}`}>
      {title && <h3 className="card-header">{title}</h3>}
      {children}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
}

/** 统计数据卡片 */
export function StatCard({ title, value, subtitle, icon, trend }: StatCardProps) {
  const trendColor = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: '',
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="card-header">{title}</h3>
          <p className="stat-value">{value}</p>
          {subtitle && (
            <p className={`text-sm mt-1 ${trend ? trendColor[trend] : ''}`} style={!trend || trend === 'neutral' ? { color: 'var(--text-muted)' } : undefined}>
              {subtitle}
            </p>
          )}
        </div>
        {icon && <span className="text-3xl opacity-60">{icon}</span>}
      </div>
    </div>
  );
}

/** 加载骨架 */
export function CardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-3 w-20 rounded mb-3" style={{ backgroundColor: 'var(--skeleton-bg)' }} />
          <div className="h-8 w-24 rounded" style={{ backgroundColor: 'var(--skeleton-bg)' }} />
        </div>
      ))}
    </>
  );
}

/** 空状态提示 */
export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
      <span className="text-5xl mb-4 opacity-40">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** 错误提示 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
      <span className="text-5xl mb-4 opacity-40">⚠️</span>
      <p className="text-sm text-red-400 mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-1.5 rounded-lg text-sm transition-colors"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          重试
        </button>
      )}
    </div>
  );
}
