import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl, CONFIG_COOKIE, parseConfigCookie } from "@/lib/google";

export const runtime = "nodejs";

/** Kick off the OAuth flow — redirect the user to Google's consent screen. */
export async function GET(req: NextRequest) {
  try {
    const override = parseConfigCookie(req.cookies.get(CONFIG_COOKIE)?.value);
    return NextResponse.redirect(buildAuthUrl(override));
  } catch {
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(`${origin}/?gcal=error`);
  }
}
