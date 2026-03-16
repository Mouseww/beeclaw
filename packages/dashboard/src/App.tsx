// ============================================================================
// BeeClaw Dashboard — 主应用组件 + 路由配置
// ============================================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { useTheme } from './hooks/useTheme';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { WorldOverview } from './pages/WorldOverview';
import { AgentList } from './pages/AgentList';
import { AgentDetail } from './pages/AgentDetail';
import { EventFeed } from './pages/EventFeed';
import { ConsensusView } from './pages/ConsensusView';
import { SocialGraphView } from './pages/SocialGraphView';
import { Settings } from './pages/Settings';

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
          <Routes>
            <Route path="/" element={<WorldOverview />} />
            <Route path="/agents" element={<AgentList />} />
            <Route path="/agents/:id" element={<AgentDetail />} />
            <Route path="/events" element={<EventFeed />} />
            <Route path="/consensus" element={<ConsensusView />} />
            <Route path="/social-graph" element={<SocialGraphView />} />
            <Route path="/settings" element={<Settings />} />
            {/* 未匹配路由重定向到首页 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
