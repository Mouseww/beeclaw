// ============================================================================
// @beeclaw/event-bus EventBus 监听器错误处理补充测试
// 覆盖 notifyListeners 中异步监听器及错误捕获逻辑
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './EventBus.js';

describe('EventBus 监听器错误处理', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('类型监听器抛出异常时不应阻止事件注入', () => {
    const bus = new EventBus();
    const throwingListener = () => { throw new Error('listener error'); };
    bus.on('external', throwingListener);

    const event = bus.injectEvent({
      title: 'test', content: 'test', tick: 1,
    });

    expect(event).toBeDefined();
    expect(event.id).toMatch(/^evt_/);
    expect(console.error).toHaveBeenCalledWith(
      '[EventBus] Listener error:',
      expect.any(Error),
    );
  });

  it('通配监听器抛出异常时不应阻止事件注入', () => {
    const bus = new EventBus();
    const throwingListener = () => { throw new Error('wildcard error'); };
    bus.on('*', throwingListener);

    const event = bus.injectEvent({
      title: 'test', content: 'test', tick: 1,
    });

    expect(event).toBeDefined();
    expect(console.error).toHaveBeenCalledWith(
      '[EventBus] Listener error:',
      expect.any(Error),
    );
  });

  it('多个监听器中一个失败不应影响其他监听器', () => {
    const bus = new EventBus();
    const results: string[] = [];
    bus.on('external', () => { results.push('first'); });
    bus.on('external', () => { throw new Error('second fails'); });
    bus.on('external', () => { results.push('third'); });

    bus.injectEvent({ title: 'test', content: 'test', tick: 1 });

    expect(results).toContain('first');
    // 第三个监听器仍然应该执行
    expect(results).toContain('third');
  });

  it('类型监听器 + 通配监听器同时触发', () => {
    const bus = new EventBus();
    const results: string[] = [];
    bus.on('external', () => { results.push('type'); });
    bus.on('*', () => { results.push('wildcard'); });

    bus.injectEvent({ title: 'test', content: 'test', tick: 1 });

    expect(results).toContain('type');
    expect(results).toContain('wildcard');
  });

  it('agent_action 类型的事件应触发对应监听器', () => {
    const bus = new EventBus();
    const results: string[] = [];
    bus.on('agent_action', (event) => { results.push(event.title); });
    bus.on('*', () => { results.push('wildcard'); });

    bus.emitAgentEvent({
      agentId: 'a1', agentName: 'Agent1',
      title: '发言', content: '我觉得...', tick: 1,
    });

    expect(results).toContain('发言');
    expect(results).toContain('wildcard');
  });

  it('同一类型注册多个监听器都应被调用', () => {
    const bus = new EventBus();
    const calls: number[] = [];
    bus.on('external', () => calls.push(1));
    bus.on('external', () => calls.push(2));
    bus.on('external', () => calls.push(3));

    bus.injectEvent({ title: 'test', content: 'test', tick: 1 });

    expect(calls).toEqual([1, 2, 3]);
  });

  it('无监听器时事件注入应正常工作', () => {
    const bus = new EventBus();
    const event = bus.injectEvent({ title: 'test', content: 'test', tick: 1 });
    expect(event).toBeDefined();
    expect(bus.getHistoryLength()).toBe(1);
  });
});
