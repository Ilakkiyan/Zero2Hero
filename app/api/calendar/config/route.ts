import { NextRequest, NextResponse } from "next/server";
import { CONFIG_COOKIE, hasGoogleConfig } from "@/lib/google";

export const runtime = "nodejs";

/**
 * Stores the user's Google OAuth client credentials (entered in Settings) in an
 * httpOnly cookie so the OAuth routes — which run on full-page redirects and so
 * can't read request headers like the LLM routes do — can use them server-side.
 * The cookie is never readable by the browser. Falls through to env vars when no
 * credentials are provided (advanced/self-hosted setups).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const cfg = body as { clientId?: string; clientSecret?: string; redirectUri?: string };
  const value = {
    clientId: (cfg.clientId ?? "").trim(),
    clientSecret: (cfg.clientSecret ?? "").trim(),
    redirectUri: (cfg.redirectUri ?? "").trim(),
  };

  const res = NextResponse.json({ ok: true, configured: hasGoogleConfig(value) });
  if (hasGoogleConfig(value)) {
    res.cookies.set(CONFIG_COOKIE, JSON.stringify(value), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days; the user's own credentials on their own device
    });
  } else {
    res.cookies.delete(CONFIG_COOKIE);
  }
  return res;
}
