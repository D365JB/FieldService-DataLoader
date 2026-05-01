/**
 * Tiny in-memory cache + in-flight request deduplication used by the upstream
 * fetch endpoints (`fetchWebsite`, `fetchImage`).
 *
 * Why this matters under multi-user load:
 *   - During a demo, multiple attendees frequently analyze the SAME customer
 *     URL within seconds of each other. Without coalescing, each call hits
 *     the upstream site, spends 5-15s reading bytes, and ties up a Function
 *     instance. With this cache, the first request does the work; everyone
 *     else gets the response from memory (`get`) or piggybacks on the
 *     in-flight promise (`coalesce`).
 *   - Flex Consumption scales out to multiple instances — each instance has
 *     its own copy. That's fine: cache hits are best-effort and the upstream
 *     sites tolerate the worst-case (one fetch per instance) easily.
 *
 * Not used for AOAI responses (each prompt is unique and AI output is non-
 * deterministic, so caching would just confuse users).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 100,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest when full. Map preserves insertion order so the first
    // key in iteration is the oldest. This is good enough — perfect LRU
    // adds bookkeeping cost we don't need at this size.
    if (this.entries.size >= this.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) this.entries.delete(firstKey);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * Run `producer` for `key` exactly once across concurrent callers on this
   * instance. Subsequent callers reuse the same promise. Cleared once the
   * promise settles so future requests after expiry can re-fetch. Cache is
   * NOT populated automatically — callers do `cache.set(key, value)` so they
   * control whether errors get cached (typically they shouldn't).
   */
  async coalesce(key: string, producer: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = producer().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}
