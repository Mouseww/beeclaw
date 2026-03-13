// ============================================================================
// BeeClaw Dashboard — 主应用组件 + 路由配置
// ============================================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { WorldOverview } from './components/WorldOverview';
import { AgentList } from './components/AgentList';
import { EventTimeline } from './components/EventTimeline';
import { ConsensusPanel } from './components/ConsensusPanel';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WorldOverview />} />
        <Route path="agents" element={<AgentList />} />
        <Route path="events" element={<EventTimeline />} />
        <Route path="consensus" element={<ConsensusPanel />} />
        {/* 未匹配路由重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
