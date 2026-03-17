// ============================================================================
// BeeClaw Dashboard — 测试环境初始化
// ============================================================================

// 注意：不使用 '@testing-library/jest-dom/vitest' 自动注册，因为在 monorepo 中
// 它可能解析到根目录的 vitest (v4) 而非 dashboard 本地的 vitest (v3)，导致
// expect.extend 注册到错误的 expect 实例上。改为手动导入 matchers 并注册。
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Mock WebSocket (jsdom 不提供)
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(_data: string) {
    // noop
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

Object.defineProperty(globalThis, 'WebSocket', { value: MockWebSocket, writable: true });

// Mock window.matchMedia（Tailwind / 响应式组件可能需要）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver（D3 / 布局组件及 recharts ResponsiveContainer 需要）
// 使用 class 确保 new ResizeObserver(...) 调用正常（vi.fn() 不支持 new）
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
