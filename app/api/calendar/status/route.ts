import { NextRequest, NextResponse } from "next/server";
import { CONFIG_COOKIE, isConfigured, parseConfigCookie } from "@/lib/google";

export const runtime = "nodejs";

/**
 * Reports whether Google Calendar is connected, and whether OAuth credentials
 * are configured at all (from the relayed cookie or env). The access token and
 * credentials live in httpOnly cookies the browser can't read, so the Settings
 * page asks the server.
 */
export async function GET(req: NextRequest) {
  const connected = !!req.cookies.get("gcal_token")?.value;
  const override = parseConfigCookie(req.cookies.get(CONFIG_COOKIE)?.value);
  return NextResponse.json({ connected, configured: isConfigured(override) });
}
