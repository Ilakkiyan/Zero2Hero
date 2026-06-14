import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google";

export const runtime = "nodejs";

/** Kick off the OAuth flow — redirect the user to Google's consent screen. */
export async function GET(req: Request) {
  try {
    return NextResponse.redirect(buildAuthUrl());
  } catch {
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(`${origin}/?gcal=error`);
  }
}
