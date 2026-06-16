import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Reports whether Google Calendar is connected. The access token lives in an
 * httpOnly cookie the browser can't read, so the Settings page asks the server.
 */
export async function GET(req: NextRequest) {
  const connected = !!req.cookies.get("gcal_token")?.value;
  return NextResponse.json({ connected });
}
