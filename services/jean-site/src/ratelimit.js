/**
 * FILE / ROOT: services/jean-site/src/ratelimit.js
 * DESCRIPTION: In-memory abuse and cost controls. RateLimiter is a per-key token bucket
 *   (default 10/min, burst 5) with bounded memory. DailyCap is a global count of questions
 *   per UTC day. Both are per instance — Cloud Run max-instances bounds the total.
 */

export class RateLimiter {
  /**
   * @param {{ ratePerMin: number, burst: number, now?: () => number, maxKeys?: number }} opts
   */
  constructor({ ratePerMin, burst, now = Date.now, maxKeys = 50000 }) {
    this.ratePerMs = ratePerMin / 60000;
    this.burst = burst;
    this.now = now;
    this.maxKeys = maxKeys;
    this.buckets = new Map(); // key -> { tokens, ts }
  }

  /** @returns {{ ok: true } | { ok: false, retryAfter: number }} retryAfter in whole seconds */
  take(key) {
    const t = this.now();
    let b = this.buckets.get(key);
    if (b) {
      b.tokens = Math.min(this.burst, b.tokens + (t - b.ts) * this.ratePerMs);
      b.ts = t;
    } else {
      if (this.buckets.size >= this.maxKeys) this.sweep(t);
      b = { tokens: this.burst, ts: t };
      this.buckets.set(key, b);
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true };
    }
    const retryAfter = Math.max(1, Math.ceil((1 - b.tokens) / this.ratePerMs / 1000));
    return { ok: false, retryAfter };
  }

  /** Drops buckets that have refilled completely (they carry no state worth keeping). */
  sweep(t = this.now()) {
    const fullAfterMs = this.burst / this.ratePerMs;
    for (const [k, b] of this.buckets) {
      if (t - b.ts >= fullAfterMs) this.buckets.delete(k);
    }
    // Still full of active keys (e.g. a flood of spoofed keys): drop the oldest half.
    if (this.buckets.size >= this.maxKeys) {
      let n = Math.floor(this.buckets.size / 2);
      for (const k of this.buckets.keys()) {
        if (n-- <= 0) break;
        this.buckets.delete(k);
      }
    }
  }
}

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export class DailyCap {
  constructor({ limit, now = Date.now }) {
    this.limit = limit;
    this.now = now;
    this.day = utcDay(now());
    this.count = 0;
  }

  roll() {
    const d = utcDay(this.now());
    if (d !== this.day) {
      this.day = d;
      this.count = 0;
    }
  }

  /** Consumes one question if under the cap. */
  tryConsume() {
    this.roll();
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }

  /** Seconds until the next UTC midnight. */
  secondsUntilReset() {
    const t = this.now();
    const next = new Date(t);
    next.setUTCHours(24, 0, 0, 0);
    return Math.max(1, Math.ceil((next.getTime() - t) / 1000));
  }
}
