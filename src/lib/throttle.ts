// Per-instance helpers for calling public OSM services politely. Serverless instances don't share this state;
// that's fine at our volume (see #1), and the client side throttles too.

/** Runs calls one at a time, at least `gapMs` apart. */
export function createThrottle(gapMs: number, now = () => Date.now()) {
  let queue: Promise<unknown> = Promise.resolve();
  let last = -Infinity;
  return function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = last + gapMs - now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        last = now();
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };
}

/** Small TTL cache; drops the oldest entry once full. */
export function createCache<T>(ttlMs: number, max = 500, now = () => Date.now()) {
  const entries = new Map<string, { value: T; expires: number }>();
  return {
    get(key: string): T | undefined {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      entries.delete(key);
      if (entries.size >= max) entries.delete(entries.keys().next().value!);
      entries.set(key, { value, expires: now() + ttlMs });
    },
  };
}

/** Sliding-window limit per key (e.g. user id). `hit` returns false once the key is over the limit. */
export function createRateLimiter(limit: number, windowMs: number, now = () => Date.now()) {
  const hits = new Map<string, number[]>();
  return function hit(key: string) {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((at) => at > t - windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}
