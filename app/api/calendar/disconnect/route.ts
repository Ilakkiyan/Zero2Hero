import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Disconnect Google Calendar by clearing the access-token cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("gcal_token", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
