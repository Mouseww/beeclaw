// ============================================================================
// BeeClaw Dashboard — 主应用组件 + 路由配置
// ============================================================================

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { useTheme } from './hooks/useTheme';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';

// 页面组件懒加载 —— 每个页面独立 chunk，减少首屏体积
const WorldOverview = lazy(() => import('./pages/WorldOverview').then(m => ({ default: m.WorldOverview })));
const AgentList = lazy(() => import('./pages/AgentList').then(m => ({ default: m.AgentList })));
const AgentDetail = lazy(() => import('./pages/AgentDetail').then(m => ({ default: m.AgentDetail })));
const EventFeed = lazy(() => import('./pages/EventFeed').then(m => ({ default: m.EventFeed })));
const ConsensusView = lazy(() => import('./pages/ConsensusView').then(m => ({ default: m.ConsensusView })));
const SocialGraphView = lazy(() => import('./pages/SocialGraphView').then(m => ({ default: m.SocialGraphView })));
const IngestionView = lazy(() => import('./pages/IngestionView').then(m => ({ default: m.IngestionView })));
const TimelineReplay = lazy(() => import('./pages/TimelineReplay').then(m => ({ default: m.TimelineReplay })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));

// 加载中占位
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 animate-pulse">Loading...</div>
    </div>
  );
}

export function App() {
  const { state: wsState, lastTick } = useWebSocket();
  const { theme, cycleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col theme-bg-primary theme-text-primary">
      {/* 顶部导航 */}
      <Header wsState={wsState} tick={lastTick?.tick ?? 0} theme={theme} onThemeCycle={cycleTheme} />

      <div className="flex flex-1 min-h-0">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<WorldOverview />} />
              <Route path="/agents" element={<AgentList />} />
              <Route path="/agents/:id" element={<AgentDetail />} />
              <Route path="/events" element={<EventFeed />} />
              <Route path="/consensus" element={<ConsensusView />} />
              <Route path="/social-graph" element={<SocialGraphView />} />
              <Route path="/ingestion" element={<IngestionView />} />
              <Route path="/timeline" element={<TimelineReplay />} />
              <Route path="/settings" element={<Settings />} />
              {/* 未匹配路由重定向到首页 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
