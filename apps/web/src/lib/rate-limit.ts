// Sliding-window rate limiter (in-memory).
// Good for a single-process deployment; swap for Redis/Upstash when scaling out.
import { ApiError } from "./api";

const buckets = new Map<string, number[]>();

const MAX_TRACKED_KEYS = 10_000; // memory-exhaustion guard

function sweep(windowMs: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  const cutoff = Date.now() - windowMs;
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => t > cutoff);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  sweep(windowMs);
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= max) {
    throw new ApiError(429, "Too many requests — slow down");
  }
  hits.push(now);
  buckets.set(key, hits);
}

// Client IP for rate-limit keys. x-forwarded-for is only trustworthy behind
// a proxy you control — fine for keying limits, never for auth decisions.
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
