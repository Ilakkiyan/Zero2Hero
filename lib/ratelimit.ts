/**
 * Best-effort, dependency-free per-IP rate limiter for the public API routes.
 *
 * ⚠️ In-memory and per-instance: it resets on serverless cold starts and is NOT
 * shared across instances. It raises the bar against casual spam of a public
 * Devpost demo, but it is NOT the real protection — that is restricting +
 * rotating the API key in Google AI Studio and keeping it in host env vars
 * only (never the repo). For durable limits use Upstash/Redis or the host's
 * built-in rate limiting.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 15; // requests per IP per window

const hits = new Map<string, number[]>();

export interface RateResult {
  ok: boolean;
  retryAfter: number; // seconds
}

export function rateLimit(key: string, max = MAX_PER_WINDOW, windowMs = WINDOW_MS): RateResult {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    hits.set(key, recent);
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    return { ok: false, retryAfter };
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded across many IPs.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }

  return { ok: true, retryAfter: 0 };
}

/** Derive a client key from proxy headers (best-effort). */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
