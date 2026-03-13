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
    neutral: 'text-gray-400',
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="card-header">{title}</h3>
          <p className="stat-value">{value}</p>
          {subtitle && (
            <p className={`text-sm mt-1 ${trend ? trendColor[trend] : 'text-gray-500'}`}>
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
          <div className="h-3 w-20 bg-gray-800 rounded mb-3" />
          <div className="h-8 w-24 bg-gray-800 rounded" />
        </div>
      ))}
    </>
  );
}

/** 空状态提示 */
export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
      <span className="text-5xl mb-4 opacity-40">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** 错误提示 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
      <span className="text-5xl mb-4 opacity-40">⚠️</span>
      <p className="text-sm text-red-400 mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 transition-colors"
        >
          重试
        </button>
      )}
    </div>
  );
}
