// ============================================================================
// SocialGraphSync 单元测试
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocialGraphSync } from './SocialGraphSync.js';
import type { SocialGraphTransport, LocalSocialGraph } from './SocialGraphSync.js';
import type { SocialNode, SocialEdge, SocialRole, RelationType } from '@beeclaw/shared';

// ── Mock 传输层 ──

function createMockTransport(): SocialGraphTransport & {
  handlers: Map<string, (payload: string) => void>;
  publishCalls: Array<{ channel: string; payload: string }>;
  /** 模拟接收消息 */
  __deliver: (channel: string, payload: string) => void;
} {
  const handlers = new Map<string, (payload: string) => void>();
  const publishCalls: Array<{ channel: string; payload: string }> = [];

  return {
    handlers,
    publishCalls,

    async publish(channel: string, payload: string): Promise<void> {
      publishCalls.push({ channel, payload });
    },

    async subscribe(channel: string, handler: (payload: string) => void): Promise<void> {
      handlers.set(channel, handler);
    },

    async unsubscribe(channel: string): Promise<void> {
      handlers.delete(channel);
    },

    __deliver(channel: string, payload: string): void {
      const handler = handlers.get(channel);
      if (handler) {
        handler(payload);
      }
    },
  };
}

// ── Mock 本地 SocialGraph ──

function createMockLocalGraph(): LocalSocialGraph & {
  _nodes: Map<string, SocialNode>;
  _edges: Map<string, SocialEdge[]>;
} {
  const _nodes = new Map<string, SocialNode>();
  const _edges = new Map<string, SocialEdge[]>();

  return {
    _nodes,
    _edges,

    addNode(agentId: string, influence: number, community: string, role: SocialRole): void {
      _nodes.set(agentId, { agentId, influence, community, role });
      if (!_edges.has(agentId)) {
        _edges.set(agentId, []);
      }
    },

    removeNode(agentId: string): void {
      _nodes.delete(agentId);
      _edges.delete(agentId);
      for (const [, edgeList] of _edges) {
        const idx = edgeList.findIndex((e) => e.to === agentId);
        if (idx >= 0) edgeList.splice(idx, 1);
      }
    },

    getNode(agentId: string): SocialNode | undefined {
      return _nodes.get(agentId);
    },

    getAllNodes(): SocialNode[] {
      return [..._nodes.values()];
    },

    addEdge(from: string, to: string, type: RelationType, strength: number, tick: number): void {
      if (!_edges.has(from)) {
        _edges.set(from, []);
      }
      const existing = _edges.get(from)!;
      const existingEdge = existing.find((e) => e.to === to);
      if (existingEdge) {
        existingEdge.type = type;
        existingEdge.strength = strength;
        return;
      }
      existing.push({ from, to, type, strength, formedAtTick: tick });
    },

    removeEdge(from: string, to: string): void {
      const edgeList = _edges.get(from);
      if (edgeList) {
        const idx = edgeList.findIndex((e) => e.to === to);
        if (idx >= 0) edgeList.splice(idx, 1);
      }
    },

    getAllEdges(): SocialEdge[] {
      const result: SocialEdge[] = [];
      for (const [, edgeList] of _edges) {
        result.push(...edgeList);
      }
      return result;
    },

    getNeighbors(agentId: string): string[] {
      const neighbors = new Set<string>();
      for (const edge of _edges.get(agentId) ?? []) {
        neighbors.add(edge.to);
      }
      for (const [, edgeList] of _edges) {
        for (const edge of edgeList) {
          if (edge.to === agentId) {
            neighbors.add(edge.from);
          }
        }
      }
      return [...neighbors];
    },

    getFollowers(agentId: string): string[] {
      const result: string[] = [];
      for (const [, edgeList] of _edges) {
        for (const edge of edgeList) {
          if (edge.to === agentId && (edge.type === 'follow' || edge.type === 'trust')) {
            result.push(edge.from);
          }
        }
      }
      return result;
    },

    getFollowing(agentId: string): string[] {
      return (_edges.get(agentId) ?? [])
        .filter((e) => e.type === 'follow' || e.type === 'trust')
        .map((e) => e.to);
    },

    getEdge(from: string, to: string): SocialEdge | undefined {
      return (_edges.get(from) ?? []).find((e) => e.to === to);
    },
  };
}

// ── 测试辅助 ──

/** 使传输层 publish 的消息自动投递到对方 */
function connectTransports(
  transports: Array<ReturnType<typeof createMockTransport>>,
): void {
  for (const t of transports) {
    const originalPublish = t.publish.bind(t);
    t.publish = async (channel: string, payload: string): Promise<void> => {
      await originalPublish(channel, payload);
      // 投递到所有其他传输层
      for (const other of transports) {
        other.__deliver(channel, payload);
      }
    };
  }
}

// ── 测试套件 ──

describe('SocialGraphSync', () => {
  let transport: ReturnType<typeof createMockTransport>;
  let localGraph: ReturnType<typeof createMockLocalGraph>;
  let sync: SocialGraphSync;

  beforeEach(() => {
    transport = createMockTransport();
    localGraph = createMockLocalGraph();
  });

  afterEach(async () => {
    if (sync?.isStarted()) {
      await sync.stop();
    }
  });

  // ── 生命周期 ──

  describe('生命周期', () => {
    it('start() 应订阅广播和私有 channel', async () => {
      sync = new SocialGraphSync({ nodeId: 'node-1', isPrimary: true });
      await sync.start(transport, localGraph);

      expect(transport.handlers.has('beeclaw:sg:broadcast')).toBe(true);
      expect(transport.handlers.has('beeclaw:sg:node:node-1')).toBe(true);
      expect(sync.isStarted()).toBe(true);
    });

    it('start() 重复调用应幂等', async () => {
      sync = new SocialGraphSync({ nodeId: 'node-1', isPrimary: true });
      await sync.start(transport, localGraph);
      await sync.start(transport, localGraph);

      expect(sync.isStarted()).toBe(true);
    });

    it('stop() 应取消订阅并清理资源', async () => {
      sync = new SocialGraphSync({ nodeId: 'node-1', isPrimary: true });
      await sync.start(transport, localGraph);
      await sync.stop();

      expect(transport.handlers.size).toBe(0);
      expect(sync.isStarted()).toBe(false);
    });

    it('stop() 未启动时应安全无操作', async () => {
      sync = new SocialGraphSync({ nodeId: 'node-1', isPrimary: true });
      await sync.stop(); // 不应抛错
      expect(sync.isStarted()).toBe(false);
    });

    it('getNodeId() 应返回配置的节点 ID', () => {
      sync = new SocialGraphSync({ nodeId: 'test-node' });
      expect(sync.getNodeId()).toBe('test-node');
    });

    it('isPrimary() 应返回配置值', () => {
      sync = new SocialGraphSync({ nodeId: 'n1', isPrimary: true });
      expect(sync.isPrimary()).toBe(true);

      const sync2 = new SocialGraphSync({ nodeId: 'n2', isPrimary: false });
      expect(sync2.isPrimary()).toBe(false);
    });

    it('支持自定义 channel 前缀', async () => {
      sync = new SocialGraphSync({ nodeId: 'n1', isPrimary: true, channelPrefix: 'myapp:sg' });
      await sync.start(transport, localGraph);

      expect(transport.handlers.has('myapp:sg:broadcast')).toBe(true);
      expect(transport.handlers.has('myapp:sg:node:n1')).toBe(true);
    });
  });

  // ── 写操作广播 ──

  describe('写操作广播（Primary 节点）', () => {
    beforeEach(async () => {
      sync = new SocialGraphSync({ nodeId: 'primary', isPrimary: true });
      await sync.start(transport, localGraph);
    });

    it('broadcastNodeAdded 应发布到广播 channel', async () => {
      await sync.broadcastNodeAdded('agent-1', 50, 'finance', 'leader');

      expect(transport.publishCalls).toHaveLength(1);
      expect(transport.publishCalls[0]!.channel).toBe('beeclaw:sg:broadcast');

      const payload = JSON.parse(transport.publishCalls[0]!.payload);
      expect(payload.type).toBe('sg_node_added');
      expect(payload.agentId).toBe('agent-1');
      expect(payload.influence).toBe(50);
      expect(payload.community).toBe('finance');
      expect(payload.role).toBe('leader');
      expect(payload.sourceNodeId).toBe('primary');
    });

    it('broadcastNodeRemoved 应发布到广播 channel', async () => {
      await sync.broadcastNodeRemoved('agent-1');

      expect(transport.publishCalls).toHaveLength(1);
      const payload = JSON.parse(transport.publishCalls[0]!.payload);
      expect(payload.type).toBe('sg_node_removed');
      expect(payload.agentId).toBe('agent-1');
    });

    it('broadcastEdgeAdded 应发布到广播 channel', async () => {
      await sync.broadcastEdgeAdded('agent-1', 'agent-2', 'trust', 0.8, 5);

      expect(transport.publishCalls).toHaveLength(1);
      const payload = JSON.parse(transport.publishCalls[0]!.payload);
      expect(payload.type).toBe('sg_edge_added');
      expect(payload.from).toBe('agent-1');
      expect(payload.to).toBe('agent-2');
      expect(payload.edgeType).toBe('trust');
      expect(payload.strength).toBe(0.8);
      expect(payload.formedAtTick).toBe(5);
    });

    it('broadcastEdgeRemoved 应发布到广播 channel', async () => {
      await sync.broadcastEdgeRemoved('agent-1', 'agent-2');

      expect(transport.publishCalls).toHaveLength(1);
      const payload = JSON.parse(transport.publishCalls[0]!.payload);
      expect(payload.type).toBe('sg_edge_removed');
      expect(payload.from).toBe('agent-1');
      expect(payload.to).toBe('agent-2');
    });

    it('每次写操作应递增版本号', async () => {
      expect(sync.getVersion()).toBe(0);

      await sync.broadcastNodeAdded('a1', 10, 'default', 'follower');
      expect(sync.getVersion()).toBe(1);

      await sync.broadcastEdgeAdded('a1', 'a2', 'follow', 0.5, 1);
      expect(sync.getVersion()).toBe(2);

      await sync.broadcastEdgeRemoved('a1', 'a2');
      expect(sync.getVersion()).toBe(3);

      await sync.broadcastNodeRemoved('a1');
      expect(sync.getVersion()).toBe(4);
    });
  });

  // ── 非 Primary 节点写操作限制 ──

  describe('非 Primary 节点写操作限制', () => {
    beforeEach(async () => {
      sync = new SocialGraphSync({ nodeId: 'replica', isPrimary: false });
      await sync.start(transport, localGraph);
    });

    it('非 primary 节点调用 broadcastNodeAdded 应抛出错误', async () => {
      await expect(sync.broadcastNodeAdded('a1', 10, 'default', 'follower'))
        .rejects.toThrow('Only primary node can execute broadcastNodeAdded');
    });

    it('非 primary 节点调用 broadcastNodeRemoved 应抛出错误', async () => {
      await expect(sync.broadcastNodeRemoved('a1'))
        .rejects.toThrow('Only primary node can execute broadcastNodeRemoved');
    });

    it('非 primary 节点调用 broadcastEdgeAdded 应抛出错误', async () => {
      await expect(sync.broadcastEdgeAdded('a1', 'a2', 'follow', 0.5, 1))
        .rejects.toThrow('Only primary node can execute broadcastEdgeAdded');
    });

    it('非 primary 节点调用 broadcastEdgeRemoved 应抛出错误', async () => {
      await expect(sync.broadcastEdgeRemoved('a1', 'a2'))
        .rejects.toThrow('Only primary node can execute broadcastEdgeRemoved');
    });
  });

  // ── 未启动时操作限制 ──

  describe('未启动时操作限制', () => {
    it('未启动时 broadcastNodeAdded 应抛出错误', async () => {
      sync = new SocialGraphSync({ nodeId: 'n1', isPrimary: true });
      await expect(sync.broadcastNodeAdded('a1', 10, 'default', 'follower'))
        .rejects.toThrow('Not started');
    });

    it('未启动时 queryNeighbors 应抛出错误', async () => {
      sync = new SocialGraphSync({ nodeId: 'n1' });
      await expect(sync.queryNeighbors('a1', 'target'))
        .rejects.toThrow('Not started');
    });

    it('未启动时 requestFullSync 应抛出错误', async () => {
      sync = new SocialGraphSync({ nodeId: 'n1' });
      await expect(sync.requestFullSync())
        .rejects.toThrow('Not started');
    });
  });

  // ── 变更事件接收与应用 ──

  describe('变更事件接收（Replica 节点）', () => {
    let primaryTransport: ReturnType<typeof createMockTransport>;
    let replicaTransport: ReturnType<typeof createMockTransport>;
    let replicaGraph: ReturnType<typeof createMockLocalGraph>;
    let primarySync: SocialGraphSync;
    let replicaSync: SocialGraphSync;

    beforeEach(async () => {
      primaryTransport = createMockTransport();
      replicaTransport = createMockTransport();
      replicaGraph = createMockLocalGraph();

      connectTransports([primaryTransport, replicaTransport]);

      primarySync = new SocialGraphSync({ nodeId: 'primary', isPrimary: true });
      replicaSync = new SocialGraphSync({ nodeId: 'replica', isPrimary: false });

      await primarySync.start(primaryTransport, createMockLocalGraph());
      await replicaSync.start(replicaTransport, replicaGraph);
    });

    afterEach(async () => {
      await primarySync.stop();
      await replicaSync.stop();
    });

    it('replica 应收到并应用 node_added 事件', async () => {
      await primarySync.broadcastNodeAdded('agent-1', 50, 'finance', 'leader');

      expect(replicaGraph._nodes.has('agent-1')).toBe(true);
      const node = replicaGraph._nodes.get('agent-1')!;
      expect(node.influence).toBe(50);
      expect(node.community).toBe('finance');
      expect(node.role).toBe('leader');
    });

    it('replica 应收到并应用 node_removed 事件', async () => {
      replicaGraph.addNode('agent-1', 50, 'finance', 'leader');
      await primarySync.broadcastNodeRemoved('agent-1');

      expect(replicaGraph._nodes.has('agent-1')).toBe(false);
    });

    it('replica 应收到并应用 edge_added 事件', async () => {
      replicaGraph.addNode('a1', 10, 'default', 'follower');
      replicaGraph.addNode('a2', 10, 'default', 'follower');
      await primarySync.broadcastEdgeAdded('a1', 'a2', 'trust', 0.8, 5);

      const edge = replicaGraph.getEdge('a1', 'a2');
      expect(edge).toBeDefined();
      expect(edge!.type).toBe('trust');
      expect(edge!.strength).toBe(0.8);
      expect(edge!.formedAtTick).toBe(5);
    });

    it('replica 应收到并应用 edge_removed 事件', async () => {
      replicaGraph.addNode('a1', 10, 'default', 'follower');
      replicaGraph.addNode('a2', 10, 'default', 'follower');
      replicaGraph.addEdge('a1', 'a2', 'follow', 0.5, 1);

      await primarySync.broadcastEdgeRemoved('a1', 'a2');

      const edge = replicaGraph.getEdge('a1', 'a2');
      expect(edge).toBeUndefined();
    });

    it('replica 收到变更后应递增本地版本号', async () => {
      expect(replicaSync.getVersion()).toBe(0);
      await primarySync.broadcastNodeAdded('a1', 10, 'default', 'follower');
      expect(replicaSync.getVersion()).toBe(1);
    });

    it('primary 不应重复处理自己发出的变更', async () => {
      const primaryGraph = createMockLocalGraph();
      await primarySync.stop();
      await primarySync.start(primaryTransport, primaryGraph);

      await primarySync.broadcastNodeAdded('a1', 10, 'default', 'follower');

      // primary 的 localGraph 不应被自动修改（写操作由调用方控制）
      expect(primaryGraph._nodes.has('a1')).toBe(false);
    });
  });

  // ── 全量同步 ──

  describe('全量同步', () => {
    let primaryTransport: ReturnType<typeof createMockTransport>;
    let replicaTransport: ReturnType<typeof createMockTransport>;
    let primaryGraph: ReturnType<typeof createMockLocalGraph>;
    let replicaGraph: ReturnType<typeof createMockLocalGraph>;
    let primarySync: SocialGraphSync;
    let replicaSync: SocialGraphSync;

    beforeEach(async () => {
      primaryTransport = createMockTransport();
      replicaTransport = createMockTransport();
      primaryGraph = createMockLocalGraph();
      replicaGraph = createMockLocalGraph();

      connectTransports([primaryTransport, replicaTransport]);

      // primary 节点预填充数据
      primaryGraph.addNode('a1', 50, 'finance', 'leader');
      primaryGraph.addNode('a2', 30, 'tech', 'follower');
      primaryGraph.addEdge('a1', 'a2', 'trust', 0.9, 3);

      primarySync = new SocialGraphSync({ nodeId: 'primary', isPrimary: true });
      replicaSync = new SocialGraphSync({ nodeId: 'replica', isPrimary: false });

      await primarySync.start(primaryTransport, primaryGraph);
      await replicaSync.start(replicaTransport, replicaGraph);
    });

    afterEach(async () => {
      await primarySync.stop();
      await replicaSync.stop();
    });

    it('replica 请求全量同步应获取完整图数据', async () => {
      const result = await replicaSync.requestFullSync();

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.nodes.find((n) => n.agentId === 'a1')).toBeDefined();
      expect(result.nodes.find((n) => n.agentId === 'a2')).toBeDefined();
      expect(result.edges[0]!.from).toBe('a1');
      expect(result.edges[0]!.to).toBe('a2');
    });

    it('全量同步应将数据应用到 replica 的本地图', async () => {
      await replicaSync.requestFullSync();

      expect(replicaGraph._nodes.has('a1')).toBe(true);
      expect(replicaGraph._nodes.has('a2')).toBe(true);
      expect(replicaGraph.getEdge('a1', 'a2')).toBeDefined();
    });

    it('非 primary 节点不应响应全量同步请求', async () => {
      // 创建第三个 replica 节点
      const replica2Transport = createMockTransport();
      const replica2Graph = createMockLocalGraph();
      connectTransports([primaryTransport, replicaTransport, replica2Transport]);

      const replica2Sync = new SocialGraphSync({ nodeId: 'replica-2', isPrimary: false });
      await replica2Sync.start(replica2Transport, replica2Graph);

      // replica-2 的图是空的，如果 replica (非 primary) 响应了，结果应为空
      // 但 primary 有数据，所以 replica-2 应能获取到完整数据
      const result = await replica2Sync.requestFullSync();
      expect(result.nodes.length).toBeGreaterThan(0);

      await replica2Sync.stop();
    });

    it('全量同步超时应正确拒绝 Promise', async () => {
      // 创建一个没有 primary 节点的环境
      const isolatedTransport = createMockTransport();
      const isolatedGraph = createMockLocalGraph();
      const isolatedSync = new SocialGraphSync({
        nodeId: 'isolated',
        isPrimary: false,
        queryTimeoutMs: 100,
      });
      await isolatedSync.start(isolatedTransport, isolatedGraph);

      await expect(isolatedSync.requestFullSync())
        .rejects.toThrow('Full sync request timed out');

      await isolatedSync.stop();
    });
  });

  // ── 远程查询 ──

  describe('远程查询', () => {
    let primaryTransport: ReturnType<typeof createMockTransport>;
    let replicaTransport: ReturnType<typeof createMockTransport>;
    let primaryGraph: ReturnType<typeof createMockLocalGraph>;
    let primarySync: SocialGraphSync;
    let replicaSync: SocialGraphSync;

    beforeEach(async () => {
      primaryTransport = createMockTransport();
      replicaTransport = createMockTransport();
      primaryGraph = createMockLocalGraph();

      connectTransports([primaryTransport, replicaTransport]);

      // primary 节点预填充数据
      primaryGraph.addNode('a1', 50, 'finance', 'leader');
      primaryGraph.addNode('a2', 30, 'tech', 'follower');
      primaryGraph.addNode('a3', 20, 'finance', 'bridge');
      primaryGraph.addEdge('a1', 'a2', 'follow', 0.7, 1);
      primaryGraph.addEdge('a3', 'a1', 'trust', 0.9, 2);
      primaryGraph.addEdge('a2', 'a3', 'follow', 0.5, 3);

      primarySync = new SocialGraphSync({ nodeId: 'primary', isPrimary: true });
      replicaSync = new SocialGraphSync({ nodeId: 'replica', isPrimary: false });

      await primarySync.start(primaryTransport, primaryGraph);
      await replicaSync.start(replicaTransport, createMockLocalGraph());
    });

    afterEach(async () => {
      await primarySync.stop();
      await replicaSync.stop();
    });

    it('queryNeighbors 应返回远程节点的邻居列表', async () => {
      const neighbors = await replicaSync.queryNeighbors('a1', 'primary');

      expect(neighbors).toContain('a2');
      expect(neighbors).toContain('a3');
    });

    it('queryFollowers 应返回远程节点的 followers', async () => {
      const followers = await replicaSync.queryFollowers('a1', 'primary');

      expect(followers).toContain('a3');
    });

    it('queryFollowing 应返回远程节点的 following 列表', async () => {
      const following = await replicaSync.queryFollowing('a1', 'primary');

      expect(following).toContain('a2');
    });

    it('queryNode 应返回远程节点信息', async () => {
      const node = await replicaSync.queryNode('a1', 'primary');

      expect(node).toBeDefined();
      expect(node!.agentId).toBe('a1');
      expect(node!.influence).toBe(50);
      expect(node!.community).toBe('finance');
      expect(node!.role).toBe('leader');
    });

    it('queryNode 查询不存在的节点应返回 null', async () => {
      const node = await replicaSync.queryNode('nonexistent', 'primary');

      expect(node).toBeNull();
    });

    it('queryEdge 应返回远程边信息', async () => {
      const edge = await replicaSync.queryEdge('a1', 'a2', 'primary');

      expect(edge).toBeDefined();
      expect(edge!.from).toBe('a1');
      expect(edge!.to).toBe('a2');
      expect(edge!.type).toBe('follow');
      expect(edge!.strength).toBe(0.7);
    });

    it('queryEdge 查询不存在的边应返回 null', async () => {
      const edge = await replicaSync.queryEdge('a1', 'a3', 'primary');

      expect(edge).toBeNull();
    });

    it('查询超时应正确拒绝 Promise', async () => {
      const isolatedTransport = createMockTransport();
      const isolatedSync = new SocialGraphSync({
        nodeId: 'isolated',
        isPrimary: false,
        queryTimeoutMs: 100,
      });
      await isolatedSync.start(isolatedTransport, createMockLocalGraph());

      await expect(isolatedSync.queryNeighbors('a1', 'nonexistent'))
        .rejects.toThrow('timed out');

      await isolatedSync.stop();
    });
  });

  // ── 消息去重 ──

  describe('消息去重', () => {
    let primaryTransport: ReturnType<typeof createMockTransport>;
    let replicaTransport: ReturnType<typeof createMockTransport>;
    let replicaGraph: ReturnType<typeof createMockLocalGraph>;
    let primarySync: SocialGraphSync;
    let replicaSync: SocialGraphSync;

    beforeEach(async () => {
      primaryTransport = createMockTransport();
      replicaTransport = createMockTransport();
      replicaGraph = createMockLocalGraph();

      connectTransports([primaryTransport, replicaTransport]);

      primarySync = new SocialGraphSync({ nodeId: 'primary', isPrimary: true });
      replicaSync = new SocialGraphSync({ nodeId: 'replica', isPrimary: false });

      await primarySync.start(primaryTransport, createMockLocalGraph());
      await replicaSync.start(replicaTransport, replicaGraph);
    });

    afterEach(async () => {
      await primarySync.stop();
      await replicaSync.stop();
    });

    it('相同消息重复投递应只处理一次', async () => {
      const addNodeSpy = vi.spyOn(replicaGraph, 'addNode');

      // 手动构造重复消息
      const message = JSON.stringify({
        type: 'sg_node_added',
        agentId: 'a1',
        influence: 10,
        community: 'default',
        role: 'follower',
        sourceNodeId: 'primary',
        timestamp: 1000,
      });

      // 直接向 replica 投递两次相同消息
      replicaTransport.__deliver('beeclaw:sg:broadcast', message);
      replicaTransport.__deliver('beeclaw:sg:broadcast', message);

      expect(addNodeSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── 无效消息处理 ──

  describe('无效消息处理', () => {
    beforeEach(async () => {
      sync = new SocialGraphSync({ nodeId: 'n1', isPrimary: true });
      await sync.start(transport, localGraph);
    });

    it('收到无效 JSON 不应抛出异常', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      transport.__deliver('beeclaw:sg:broadcast', 'invalid-json{{{');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('收到未知消息类型不应抛出异常', () => {
      const message = JSON.stringify({
        type: 'unknown_type',
        sourceNodeId: 'other',
        timestamp: Date.now(),
      });

      // 不应抛错
      transport.__deliver('beeclaw:sg:broadcast', message);
    });
  });

  // ── stop() 清理 pending queries ──

  describe('stop() 清理', () => {
    it('stop() 应拒绝所有待处理的查询', async () => {
      const isolatedTransport = createMockTransport();
      const isolatedSync = new SocialGraphSync({
        nodeId: 'isolated',
        isPrimary: false,
        queryTimeoutMs: 60_000, // 长超时
      });
      await isolatedSync.start(isolatedTransport, createMockLocalGraph());

      // 发起查询（不会有响应）
      const queryPromise = isolatedSync.queryNeighbors('a1', 'nonexistent');

      // 立即 stop
      await isolatedSync.stop();

      await expect(queryPromise).rejects.toThrow('SocialGraphSync stopped');
    });
  });

  // ── 多节点同步集成测试 ──

  describe('多节点集成', () => {
    it('三节点场景：primary 写入，两个 replica 同步接收', async () => {
      const t1 = createMockTransport();
      const t2 = createMockTransport();
      const t3 = createMockTransport();
      connectTransports([t1, t2, t3]);

      const g1 = createMockLocalGraph();
      const g2 = createMockLocalGraph();
      const g3 = createMockLocalGraph();

      const s1 = new SocialGraphSync({ nodeId: 'primary', isPrimary: true });
      const s2 = new SocialGraphSync({ nodeId: 'replica-1', isPrimary: false });
      const s3 = new SocialGraphSync({ nodeId: 'replica-2', isPrimary: false });

      await s1.start(t1, g1);
      await s2.start(t2, g2);
      await s3.start(t3, g3);

      // primary 进行写操作
      await s1.broadcastNodeAdded('agent-A', 80, 'finance', 'leader');
      await s1.broadcastNodeAdded('agent-B', 40, 'tech', 'follower');
      await s1.broadcastEdgeAdded('agent-A', 'agent-B', 'trust', 0.95, 10);

      // 两个 replica 都应同步收到
      expect(g2._nodes.has('agent-A')).toBe(true);
      expect(g2._nodes.has('agent-B')).toBe(true);
      expect(g2.getEdge('agent-A', 'agent-B')).toBeDefined();

      expect(g3._nodes.has('agent-A')).toBe(true);
      expect(g3._nodes.has('agent-B')).toBe(true);
      expect(g3.getEdge('agent-A', 'agent-B')).toBeDefined();

      // 版本号一致
      expect(s2.getVersion()).toBe(3);
      expect(s3.getVersion()).toBe(3);

      await s1.stop();
      await s2.stop();
      await s3.stop();
    });

    it('全量同步 + 增量同步混合场景', async () => {
      const t1 = createMockTransport();
      const t2 = createMockTransport();
      connectTransports([t1, t2]);

      const g1 = createMockLocalGraph();
      const g2 = createMockLocalGraph();

      // primary 先有一些数据
      g1.addNode('existing-1', 30, 'default', 'follower');
      g1.addNode('existing-2', 20, 'default', 'follower');
      g1.addEdge('existing-1', 'existing-2', 'follow', 0.5, 1);

      const s1 = new SocialGraphSync({ nodeId: 'primary', isPrimary: true });
      const s2 = new SocialGraphSync({ nodeId: 'new-replica', isPrimary: false });

      await s1.start(t1, g1);
      await s2.start(t2, g2);

      // 新 replica 先做全量同步
      const fullSyncResult = await s2.requestFullSync();
      expect(fullSyncResult.nodes).toHaveLength(2);
      expect(fullSyncResult.edges).toHaveLength(1);

      // 之后 primary 继续增量变更
      await s1.broadcastNodeAdded('new-agent', 60, 'tech', 'bridge');

      expect(g2._nodes.has('existing-1')).toBe(true);
      expect(g2._nodes.has('existing-2')).toBe(true);
      expect(g2._nodes.has('new-agent')).toBe(true);

      await s1.stop();
      await s2.stop();
    });
  });
});
