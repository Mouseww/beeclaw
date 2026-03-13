// ============================================================================
// BeeClaw Dashboard — 主应用组件 + 路由配置
// ============================================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { WorldOverview } from './pages/WorldOverview';
import { AgentList } from './pages/AgentList';
import { EventFeed } from './pages/EventFeed';
import { ConsensusView } from './pages/ConsensusView';
import { SocialGraphView } from './pages/SocialGraphView';

export function App() {
  const { state: wsState, lastTick } = useWebSocket();

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* 顶部导航 */}
      <Header wsState={wsState} tick={lastTick?.tick ?? 0} />

      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<WorldOverview />} />
            <Route path="/agents" element={<AgentList />} />
            <Route path="/events" element={<EventFeed />} />
            <Route path="/consensus" element={<ConsensusView />} />
            <Route path="/social-graph" element={<SocialGraphView />} />
            {/* 未匹配路由重定向到首页 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
