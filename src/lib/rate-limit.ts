interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
