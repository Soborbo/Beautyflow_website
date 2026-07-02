/**
 * Per-IP sliding-window rate limiter, in-memory. Extracted from the retired
 * tracking server module — used by /api/contact + /api/boranalizis for bot/abuse
 * throttling (in addition to Turnstile). Survives across requests within a single
 * Worker isolate but NOT across isolates; for stronger guarantees swap in a
 * KV-backed limiter. The map is bounded by periodic GC of expired entries.
 */

export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_CONTACT_MAX = 5;

const rateBuckets = new Map<string, number[]>();
let lastGc = 0;

function gcRateBuckets(now: number): void {
  if (now - lastGc < RATE_LIMIT_WINDOW_MS) return;
  lastGc = now;
  for (const [k, arr] of rateBuckets) {
    const fresh = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) rateBuckets.delete(k);
    else rateBuckets.set(k, fresh);
  }
}

export function checkRateLimit(key: string, max: number): boolean {
  if (!key) return true;
  const now = Date.now();
  gcRateBuckets(now);
  const arr = rateBuckets.get(key) || [];
  const fresh = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= max) {
    rateBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateBuckets.set(key, fresh);
  return true;
}
