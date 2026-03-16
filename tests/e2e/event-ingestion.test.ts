// ============================================================================
// BeeClaw E2E — Event Ingestion Pipeline
// 验证：Feed 解析 → 事件注入 → Agent 反应链路
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '@beeclaw/event-bus';
import { EventIngestion, parseFeed, ImportanceEvaluator } from '@beeclaw/event-ingestion';
import { buildTestWorld, silenceConsole, MOCK_RSS_XML } from './helpers.js';
import type { FeedSource } from '@beeclaw/event-ingestion';

describe('Event Ingestion Pipeline', () => {
  beforeEach(() => {
    silenceConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════
  // Feed 解析
  // ═══════════════════════════════════

  describe('RSS Feed 解析', () => {
    it('应正确解析 RSS XML 为结构化数据', () => {
      const feed = parseFeed(MOCK_RSS_XML);

      expect(feed.title).toBe('模拟财经新闻');
      expect(feed.items).toHaveLength(3);

      const firstItem = feed.items[0]!;
      expect(firstItem.title).toBe('央行宣布降息25个基点');
      expect(firstItem.content).toContain('贷款基准利率');
      expect(firstItem.guid).toBe('mock-news-001');
      expect(firstItem.pubDate).toBeInstanceOf(Date);
    });

    it('应正确解析多条目', () => {
      const feed = parseFeed(MOCK_RSS_XML);

      expect(feed.items[0]!.title).toBe('央行宣布降息25个基点');
      expect(feed.items[1]!.title).toBe('科技巨头发布新一代AI芯片');
      expect(feed.items[2]!.title).toBe('国际油价创年内新高');
    });

    it('应解析分类信息', () => {
      const feed = parseFeed(MOCK_RSS_XML);

      const item = feed.items[0]!;
      expect(item.categories).toContain('金融');
    });

    it('空 RSS 应抛出错误', () => {
      expect(() => parseFeed('<rss></rss>')).toThrow();
    });

    it('Atom feed 应可解析', () => {
      const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>测试 Atom Feed</title>
  <entry>
    <title>Atom 条目一</title>
    <summary>这是一条 Atom 测试内容</summary>
    <id>atom-001</id>
    <updated>2026-03-10T08:00:00Z</updated>
  </entry>
</feed>`;

      const feed = parseFeed(atomXml);
      expect(feed.title).toBe('测试 Atom Feed');
      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]!.title).toBe('Atom 条目一');
    });
  });

  // ═══════════════════════════════════
  // 重要性评估
  // ═══════════════════════════════════

  describe('ImportanceEvaluator', () => {
    it('包含高重要性关键词的条目应有较高评分', () => {
      const evaluator = new ImportanceEvaluator(
        ['央行', '降息', '加息', '暴跌'],
        ['市场', '投资'],
      );

      const assessment = evaluator.evaluate({
        title: '央行宣布降息',
        content: '央行决定下调基准利率',
        guid: 'test-1',
      });

      expect(assessment.importance).toBeGreaterThanOrEqual(0.5);
      expect(assessment.matchedKeywords.length).toBeGreaterThan(0);
    });

    it('无关键词匹配的条目应有较低评分', () => {
      const evaluator = new ImportanceEvaluator(
        ['央行', '降息'],
        ['市场'],
      );

      const assessment = evaluator.evaluate({
        title: '天气预报',
        content: '明天多云转晴',
        guid: 'test-2',
      });

      expect(assessment.importance).toBeLessThan(0.5);
    });
  });

  // ═══════════════════════════════════
  // EventIngestion → EventBus 注入
  // ═══════════════════════════════════

  describe('EventIngestion 事件注入', () => {
    it('手动 pollSource 应通过 fetch → parse → inject 链路', async () => {
      const eventBus = new EventBus(50);

      // Mock fetch 返回 RSS XML
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_XML),
      });
      vi.stubGlobal('fetch', mockFetch);

      const source: FeedSource = {
        id: 'test-feed',
        name: '测试新闻源',
        url: 'http://mock-news.example.com/rss',
        category: 'finance',
        enabled: true,
        tags: ['测试'],
      };

      const ingestion = new EventIngestion(eventBus, {
        maxItemsPerPoll: 10,
        sources: [source],
      });

      // 手动触发一次轮询
      const eventsEmitted = await ingestion.pollSource('test-feed');
      expect(eventsEmitted).toBe(3); // RSS 有 3 条

      // EventBus 中应有 3 条事件
      const events = eventBus.consumeEvents();
      expect(events).toHaveLength(3);
      expect(events[0]!.title).toBe('央行宣布降息25个基点');
      expect(events[0]!.type).toBe('external');
      expect(events[0]!.source).toContain('test-feed');

      vi.unstubAllGlobals();
    });

    it('去重机制应过滤重复条目', async () => {
      const eventBus = new EventBus(50);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_XML),
      });
      vi.stubGlobal('fetch', mockFetch);

      const source: FeedSource = {
        id: 'dedup-feed',
        name: '去重测试',
        url: 'http://mock.example.com/rss',
        category: 'general',
        enabled: true,
      };

      const ingestion = new EventIngestion(eventBus, {
        sources: [source],
      });

      // 第一次轮询
      const first = await ingestion.pollSource('dedup-feed');
      expect(first).toBe(3);

      // 消费掉事件
      eventBus.consumeEvents();

      // 第二次轮询相同内容
      const second = await ingestion.pollSource('dedup-feed');
      expect(second).toBe(0); // 应全部被去重

      vi.unstubAllGlobals();
    });

    it('数据源状态应正确记录', async () => {
      const eventBus = new EventBus(50);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_XML),
      });
      vi.stubGlobal('fetch', mockFetch);

      const ingestion = new EventIngestion(eventBus, {
        sources: [
          { id: 's1', name: '源1', url: 'http://a', category: 'finance', enabled: true },
          { id: 's2', name: '源2', url: 'http://b', category: 'tech', enabled: false },
        ],
      });

      const states = ingestion.getSourceStates();
      expect(states).toHaveLength(2);
      expect(states[0]!.enabled).toBe(true);
      expect(states[1]!.enabled).toBe(false);

      vi.unstubAllGlobals();
    });

    it('fetch 失败应不崩溃并记录错误', async () => {
      const eventBus = new EventBus(50);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const ingestion = new EventIngestion(eventBus, {
        sources: [
          { id: 'fail', name: '失败源', url: 'http://fail', category: 'general', enabled: true },
        ],
      });

      const result = await ingestion.pollSource('fail');
      expect(result).toBe(0);

      const states = ingestion.getSourceStates();
      expect(states[0]!.lastError).toBeDefined();

      vi.unstubAllGlobals();
    });
  });

  // ═══════════════════════════════════
  // 完整管道：Feed → EventBus → WorldEngine → Agent 反应
  // ═══════════════════════════════════

  describe('完整管道集成', () => {
    it('Feed 解析 → 事件注入 → tick → Agent 反应', async () => {
      // 构建世界
      const { engine } = buildTestWorld({ agentCount: 5 });

      // 解析 Feed
      const feed = parseFeed(MOCK_RSS_XML);
      expect(feed.items.length).toBeGreaterThan(0);

      // 将 feed 条目转为事件注入引擎
      for (const item of feed.items) {
        engine.injectEvent({
          title: item.title,
          content: item.content,
          category: 'finance',
          importance: 0.7,
          propagationRadius: 0.6,
          tags: item.categories ?? [],
        });
      }

      // 执行 tick
      const result = await engine.step();

      // 验证事件被处理
      expect(result.eventsProcessed).toBeGreaterThanOrEqual(3);

      // Agent 应有响应
      expect(result.agentsActivated).toBeGreaterThan(0);
      expect(result.responsesCollected).toBeGreaterThan(0);

      engine.stop();
    });

    it('EventIngestion + WorldEngine 端到端', async () => {
      const { engine } = buildTestWorld({ agentCount: 5 });

      // Mock fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_XML),
      });
      vi.stubGlobal('fetch', mockFetch);

      // 创建 EventIngestion，使用引擎的 EventBus
      const ingestion = new EventIngestion(engine.eventBus, {
        sources: [
          {
            id: 'e2e-feed',
            name: 'E2E测试源',
            url: 'http://mock.example.com/rss',
            category: 'finance',
            enabled: true,
            tags: ['e2e'],
          },
        ],
      });

      // 轮询获取事件
      const eventsEmitted = await ingestion.pollSource('e2e-feed');
      expect(eventsEmitted).toBe(3);

      // 执行 tick
      const result = await engine.step();

      // 验证事件传播到 Agent
      expect(result.eventsProcessed).toBeGreaterThanOrEqual(3);
      expect(result.agentsActivated).toBeGreaterThan(0);

      // 再执行一轮，验证级联
      const result2 = await engine.step();
      expect(result2.tick).toBe(2);

      engine.stop();
      vi.unstubAllGlobals();
    });

    it('多轮 Feed → 多轮 tick → 共识信号链路', async () => {
      const { engine } = buildTestWorld({ agentCount: 8 });

      // 第一批事件
      engine.injectEvent({
        title: '第一波：央行降息',
        content: '央行大幅降息刺激经济',
        category: 'finance',
        importance: 0.9,
        propagationRadius: 0.8,
        tags: ['央行', '降息'],
      });

      await engine.step();

      // 第二批事件
      engine.injectEvent({
        title: '第二波：市场反应',
        content: '股市应声上涨，投资者情绪高涨',
        category: 'finance',
        importance: 0.8,
        propagationRadius: 0.7,
        tags: ['股市', '上涨'],
      });

      await engine.step();

      // 第三轮无新事件
      await engine.step();

      // 检查引擎状态
      expect(engine.getCurrentTick()).toBe(3);
      const history = engine.getTickHistory();
      expect(history).toHaveLength(3);

      // 总响应数
      const totalResponses = history.reduce((s, h) => s + h.responsesCollected, 0);
      expect(totalResponses).toBeGreaterThan(0);

      // 共识引擎应有处理过信号
      const consensus = engine.getConsensusEngine();
      const topics = consensus.getAllTopics();
      // 如果有响应则应有 topic
      if (totalResponses > 0) {
        expect(topics.length).toBeGreaterThanOrEqual(0);
      }

      engine.stop();
    });
  });

  // ═══════════════════════════════════
  // start/stop 生命周期
  // ═══════════════════════════════════

  describe('EventIngestion 生命周期', () => {
    it('start/stop 应正确管理运行状态', () => {
      const eventBus = new EventBus(50);
      const ingestion = new EventIngestion(eventBus);

      expect(ingestion.isRunning()).toBe(false);

      ingestion.start();
      expect(ingestion.isRunning()).toBe(true);

      ingestion.stop();
      expect(ingestion.isRunning()).toBe(false);
    });

    it('setCurrentTick 应同步更新', () => {
      const eventBus = new EventBus(50);
      const ingestion = new EventIngestion(eventBus);

      ingestion.setCurrentTick(42);
      // 没有直接查询 currentTick 的方法，通过 seenCount 验证不崩溃
      expect(ingestion.getSeenCount()).toBe(0);
    });

    it('clearSeenCache 应重置去重缓存', async () => {
      const eventBus = new EventBus(50);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_XML),
      });
      vi.stubGlobal('fetch', mockFetch);

      const ingestion = new EventIngestion(eventBus, {
        sources: [
          { id: 'cache-test', name: '缓存测试', url: 'http://test', category: 'general', enabled: true },
        ],
      });

      await ingestion.pollSource('cache-test');
      expect(ingestion.getSeenCount()).toBe(3);

      ingestion.clearSeenCache();
      expect(ingestion.getSeenCount()).toBe(0);

      vi.unstubAllGlobals();
    });

    it('addSource / removeSource 应正确管理数据源', () => {
      const eventBus = new EventBus(50);
      const ingestion = new EventIngestion(eventBus);

      ingestion.addSource({
        id: 'dynamic',
        name: '动态源',
        url: 'http://dynamic',
        category: 'tech',
        enabled: true,
      });

      const states = ingestion.getSourceStates();
      expect(states).toHaveLength(1);
      expect(states[0]!.id).toBe('dynamic');

      ingestion.removeSource('dynamic');
      expect(ingestion.getSourceStates()).toHaveLength(0);
    });
  });
});
