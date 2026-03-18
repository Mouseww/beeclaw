// ============================================================================
// BeeClaw Dashboard — 侧边栏导航
// ============================================================================

import { NavLink } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '世界总览', icon: '🌍' },
  { path: '/agents', label: 'Agent 列表', icon: '🤖' },
  { path: '/forecast', label: '推演预测', icon: '🔮' },
  { path: '/events', label: '事件流', icon: '⚡' },
  { path: '/timeline', label: '事件回放', icon: '⏮️' },
  { path: '/consensus', label: '共识引擎', icon: '📊' },
  { path: '/social-graph', label: '社交网络', icon: '🔗' },
  { path: '/ingestion', label: '事件接入', icon: '📡' },
  { path: '/settings', label: '系统设置', icon: '⚙️' },
];

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 lg:w-56 border-r theme-border flex flex-col shrink-0 overflow-y-auto transform transition-transform duration-200 lg:translate-x-0 pt-14 lg:pt-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ backgroundColor: 'var(--bg-primary)' }}
        role="navigation"
        aria-label="主导航"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b theme-border lg:hidden">
          <span className="font-semibold" style={{ color: 'var(--text-heading)' }}>导航</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1.5"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            aria-label="关闭导航菜单"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t theme-border">
          <p className="text-xs theme-text-faint text-center" style={{ color: 'var(--text-faint)' }}>
            BeeClaw Mobile Ready
          </p>
        </div>
      </aside>
    </>
  );
}
