import { NextRequest, NextResponse } from "next/server";
import { chatJSON } from "@/lib/llm";
import { REPLAN_SYSTEM, replanUserMessage } from "@/lib/prompts";
import { PlanSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Revises an existing plan from a reality update ("I tried X, it failed").
 * Takes { plan, note }, returns the full revised { plan } — the panel swaps to
 * it, which is the visible "living plan" moment.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const apiKey = req.headers.get("x-gemini-key") || undefined;

  try {
    const { plan, note } = (await req.json()) as { plan: unknown; note: unknown };

    const currentPlan = PlanSchema.safeParse(plan);
    if (!currentPlan.success) {
      return NextResponse.json({ error: "valid plan required" }, { status: 400 });
    }
    if (typeof note !== "string" || !note.trim()) {
      return NextResponse.json({ error: "note required" }, { status: 400 });
    }

    const raw = await chatJSON(
      [
        { role: "system", content: REPLAN_SYSTEM },
        { role: "user", content: replanUserMessage(currentPlan.data, note) },
      ],
      { apiKey },
    );

    const revised = PlanSchema.safeParse(raw);
    if (!revised.success) {
      return NextResponse.json(
        { error: "Revised plan did not match schema", issues: revised.error.issues },
        { status: 422 },
      );
    }

    return NextResponse.json({ plan: revised.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
