// ============================================================================
// TickScheduler — 回合调度器，管理世界时钟推进
// ============================================================================

export interface TickSchedulerOptions {
  /** 每个 tick 的间隔时间（毫秒），默认 60000ms (1分钟) */
  tickIntervalMs: number;
}

export class TickScheduler {
  private currentTick = 0;
  private tickIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private tickCallback: ((tick: number) => Promise<void>) | null = null;
  private startTime: Date;

  constructor(options: TickSchedulerOptions) {
    this.tickIntervalMs = options.tickIntervalMs;
    this.startTime = new Date();
  }

  /**
   * 获取当前 tick 数
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * 获取对应的世界时间戳
   */
  getWorldTimestamp(): Date {
    return new Date(this.startTime.getTime() + this.currentTick * this.tickIntervalMs);
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 注册每 tick 的回调
   */
  onTick(callback: (tick: number) => Promise<void>): void {
    this.tickCallback = callback;
  }

  /**
   * 开始自动推进
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[TickScheduler] 启动，间隔 ${this.tickIntervalMs}ms`);
    this.scheduleNext();
  }

  /**
   * 停止自动推进
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`[TickScheduler] 已停止，当前 Tick: ${this.currentTick}`);
  }

  /**
   * 手动推进一个 tick（不需要等待定时器）
   */
  async advance(): Promise<number> {
    this.currentTick++;
    if (this.tickCallback) {
      await this.tickCallback(this.currentTick);
    }
    return this.currentTick;
  }

  /**
   * 设置 tick 值（用于恢复状态）
   */
  setTick(tick: number): void {
    this.currentTick = tick;
  }

  /**
   * 调度下一个 tick
   */
  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      try {
        await this.advance();
      } catch (err) {
        console.error(`[TickScheduler] Tick ${this.currentTick} 执行出错:`, err);
      }
      this.scheduleNext();
    }, this.tickIntervalMs);
  }
}
