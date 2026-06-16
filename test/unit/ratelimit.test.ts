// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rateLimit, clientKey } from "@/lib/ratelimit";

describe("rateLimit", () => {
  it("allows requests up to the limit, then blocks with a retry hint", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate windows per key", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it("frees up capacity once the window elapses", () => {
    const key = `w-${Math.random()}`;
    expect(rateLimit(key, 1, 1).ok).toBe(true);
    // Past the 1ms window, the old hit no longer counts.
    const later = Date.now();
    while (Date.now() === later) {
      /* spin a tick so the window slides */
    }
    expect(rateLimit(key, 1, 1).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first x-forwarded-for entry", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKey(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientKey(new Request("http://x"))).toBe("unknown");
  });
});
