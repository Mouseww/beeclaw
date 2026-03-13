// ============================================================================
// BeeClaw Dashboard — 社交网络图页面（Placeholder）
// ============================================================================

import { Card } from '../components';

export function SocialGraphView() {
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold text-white">社交网络</h2>
        <p className="text-sm text-gray-500 mt-1">Agent 之间的社交关系图谱</p>
      </div>

      {/* 占位卡片 */}
      <Card>
        <div className="flex flex-col items-center justify-center py-24">
          {/* 蜂巢装饰图案 */}
          <div className="relative mb-8">
            <HoneycombPattern />
          </div>

          <h3 className="text-xl font-semibold text-gray-300 mb-2">社交网络可视化</h3>
          <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
            此页面将使用 D3.js 力导向图展示 Agent 之间的社交关系，
            包括关注链、信任关系、社区聚类等。
          </p>

          {/* 功能预览标签 */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              '力导向图',
              '社区聚类',
              '信息传播路径',
              '影响力热力图',
              '关系强度',
              '实时更新',
            ].map((feature) => (
              <span
                key={feature}
                className="px-3 py-1 rounded-full bg-gray-800 text-gray-400 text-xs border border-gray-700"
              >
                {feature}
              </span>
            ))}
          </div>

          <div className="mt-8 px-4 py-2 rounded-lg bg-bee-500/10 border border-bee-500/20">
            <p className="text-sm text-bee-400">
              🚧 即将到来 — Phase 2 功能
            </p>
          </div>
        </div>
      </Card>

      {/* 网络统计（placeholder） */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="节点数">
          <p className="stat-value text-gray-600">—</p>
          <p className="text-xs text-gray-600 mt-1">Agent 节点</p>
        </Card>
        <Card title="边数">
          <p className="stat-value text-gray-600">—</p>
          <p className="text-xs text-gray-600 mt-1">社交关系</p>
        </Card>
        <Card title="社区数">
          <p className="stat-value text-gray-600">—</p>
          <p className="text-xs text-gray-600 mt-1">聚类社区</p>
        </Card>
      </div>
    </div>
  );
}

/** 蜂巢装饰图案 */
function HoneycombPattern() {
  // 简易 SVG 蜂巢六边形
  const hexPath = (cx: number, cy: number, r: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    });
    return pts.join(' ');
  };

  const cells = [
    { x: 60, y: 40, opacity: 0.3 },
    { x: 90, y: 57, opacity: 0.5 },
    { x: 60, y: 74, opacity: 0.2 },
    { x: 30, y: 57, opacity: 0.4 },
    { x: 90, y: 23, opacity: 0.15 },
    { x: 30, y: 23, opacity: 0.25 },
    { x: 120, y: 40, opacity: 0.1 },
  ];

  return (
    <svg width="150" height="96" viewBox="0 0 150 96" className="opacity-60">
      {cells.map((cell, i) => (
        <polygon
          key={i}
          points={hexPath(cell.x, cell.y, 18)}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.5"
          opacity={cell.opacity}
        />
      ))}
    </svg>
  );
}
