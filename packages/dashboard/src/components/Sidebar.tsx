// ============================================================================
// BeeClaw Dashboard — 侧边栏导航
// ============================================================================

import { NavLink } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '世界总览', icon: '🌍' },
  { path: '/agents', label: 'Agent 列表', icon: '🤖' },
  { path: '/events', label: '事件流', icon: '⚡' },
  { path: '/timeline', label: '事件回放', icon: '⏮️' },
  { path: '/consensus', label: '共识引擎', icon: '📊' },
  { path: '/social-graph', label: '社交网络', icon: '🔗' },
  { path: '/ingestion', label: '事件接入', icon: '📡' },
  { path: '/settings', label: '系统设置', icon: '⚙️' },
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r theme-border flex flex-col shrink-0 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <nav className="flex-1 py-4 px-3 space-y-1.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `nav-link ${isActive ? 'nav-link-active' : ''}`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 底部信息 */}
      <div className="p-4 border-t theme-border">
        <p className="text-xs theme-text-faint text-center" style={{ color: 'var(--text-faint)' }}>
          BeeClaw v1.0.0
        </p>
      </div>
    </aside>
  );
}
