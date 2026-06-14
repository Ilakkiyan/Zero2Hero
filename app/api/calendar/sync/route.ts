import { NextRequest, NextResponse } from "next/server";
import { createPlanEvents, TokenExpiredError } from "@/lib/google";
import { PlanSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Creates one calendar event per milestone. Reads the access token from the
 * httpOnly cookie set during the OAuth callback. Returns 401 (so the client
 * can trigger the connect flow) when there's no/expired token.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const token = req.cookies.get("gcal_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not connected to Google" }, { status: 401 });
  }

  let plan;
  try {
    const body = await req.json();
    const parsed = PlanSchema.safeParse(body.plan);
    if (!parsed.success) {
      return NextResponse.json({ error: "valid plan required" }, { status: 400 });
    }
    plan = parsed.data;
  } catch {
    return NextResponse.json({ error: "valid plan required" }, { status: 400 });
  }

  try {
    const events = await createPlanEvents(token, plan);
    return NextResponse.json({ count: events.length, events });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      const res = NextResponse.json({ error: "Google session expired" }, { status: 401 });
      res.cookies.delete("gcal_token");
      return res;
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
