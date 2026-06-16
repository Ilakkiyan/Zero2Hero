import { NextRequest } from "next/server";

/**
 * Shared helpers for API-route tests. Each request gets a unique client IP so
 * the in-memory per-IP rate limiter never bleeds between unrelated test cases
 * (the dedicated rate-limit test pins a single IP on purpose).
 */

let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 254)}.${(ipCounter % 254) + 1}`;
}

export function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": uniqueIp(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** An async generator that yields the given string chunks in order. */
export async function* asyncChunks(chunks: string[]): AsyncGenerator<string> {
  for (const c of chunks) yield c;
}

/** An async generator that yields some chunks then throws — models a mid-stream failure. */
export async function* throwingStream(chunks: string[], message: string): AsyncGenerator<string> {
  for (const c of chunks) yield c;
  throw new Error(message);
}

/** Read an NDJSON Response body fully and parse each line into an event object. */
export async function collectNdjson<T = Record<string, unknown>>(res: Response): Promise<T[]> {
  const text = await res.text();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}
