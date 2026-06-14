import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Cheap validity check for a user-supplied Gemini key: a GET against the model
 * metadata endpoint (no generation cost). Returns { valid } so the key modal
 * can confirm a key works before saving it.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { valid: false, error: "Too many checks — wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const key = req.headers.get("x-gemini-key");
  if (!key) {
    return NextResponse.json({ valid: false, error: "No key provided" }, { status: 400 });
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${key}`,
      { method: "GET" },
    );
    if (res.ok) return NextResponse.json({ valid: true });
    return NextResponse.json({ valid: false, error: `Key rejected (${res.status})` });
  } catch {
    return NextResponse.json({ valid: false, error: "Couldn't reach Google to verify" });
  }
}
