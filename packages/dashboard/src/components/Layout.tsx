// ============================================================================
// BeeClaw Dashboard — 布局组件（侧边栏导航）
// ============================================================================

import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '世界总览', icon: '🌍' },
  { to: '/agents', label: 'Agent 列表', icon: '🐝' },
  { to: '/events', label: '事件时间线', icon: '⚡' },
  { to: '/consensus', label: '共识面板', icon: '📊' },
];

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* 侧边栏 */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <img src="/bee.svg" alt="BeeClaw" className="w-8 h-8" />
          <div>
            <h1 className="text-lg font-bold text-bee-400">BeeClaw</h1>
            <p className="text-xs text-gray-500">群体智能仿真引擎</p>
          </div>
        </div>

        {/* 导航链接 */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link-active' : ''}`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* 底部状态 */}
        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
          BeeClaw v0.1.0
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
