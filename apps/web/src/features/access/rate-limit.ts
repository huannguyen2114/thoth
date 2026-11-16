/** Sliding-window limiter for failed unlock attempts. In memory: a restart clears it, which is fine for one user. */
export class FailureLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length > 0) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Seconds to wait before the next try, or 0 when allowed. */
  retryAfterSec(key: string, now = Date.now()): number {
    const list = this.recent(key, now);
    if (list.length < this.max) return 0;
    const unlockAt = (list[list.length - this.max] ?? now) + this.windowMs;
    return Math.max(1, Math.ceil((unlockAt - now) / 1000));
  }

  recordFailure(key: string, now = Date.now()): void {
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

/** Per-peer and global limiters, kept on globalThis so dev reloads do not reset them. */
const store = globalThis as unknown as {
  __thothLimiters?: { peer: FailureLimiter; all: FailureLimiter };
};
export function getLimiters() {
  store.__thothLimiters ??= {
    peer: new FailureLimiter(5, 15 * 60_000),
    // The global cap stops a flood from many addresses (or forged ones in untrusted mode).
    all: new FailureLimiter(30, 15 * 60_000),
  };
  return store.__thothLimiters;
}
