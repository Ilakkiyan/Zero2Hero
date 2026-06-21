import { NextRequest, NextResponse } from "next/server";
import { CONFIG_COOKIE, exchangeCode, parseConfigCookie } from "@/lib/google";

export const runtime = "nodejs";

/**
 * OAuth redirect target. Exchanges the code for an access token, stores it in
 * an httpOnly cookie (never exposed to the browser), and returns to the app
 * with ?gcal=connected so the client can auto-sync.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?gcal=error`);
  }

  try {
    const override = parseConfigCookie(req.cookies.get(CONFIG_COOKIE)?.value);
    const { accessToken, expiresIn } = await exchangeCode(code, override);
    const res = NextResponse.redirect(`${origin}/?gcal=connected`);
    res.cookies.set("gcal_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, expiresIn - 60),
    });
    return res;
  } catch {
    return NextResponse.redirect(`${origin}/?gcal=error`);
  }
}
