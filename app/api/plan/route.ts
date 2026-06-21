import { NextRequest, NextResponse } from "next/server";
import { chatJSON, llmOptionsFromHeaders, type ChatMessage } from "@/lib/llm";
import { PLAN_SYSTEM, sharedContextMessages } from "@/lib/prompts";
import { PlanSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { screenInput } from "@/lib/safety";

export const runtime = "nodejs";

/**
 * Turns the interview transcript into a structured Plan (JSON, zod-validated).
 * The validated object is what the right-hand Plan panel renders.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const llm = llmOptionsFromHeaders(req.headers);

  try {
    const body = (await req.json()) as { messages: ChatMessage[]; sharedContext?: unknown };
    const { messages } = body;
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages[] required" }, { status: 400 });
    }

    // Safety backstop: don't build a plan from a clearly harmful/illegal idea or
    // from spam/flooding text.
    for (const m of messages) {
      if (m.role !== "user") continue;
      const screen = screenInput(m.content);
      if (screen.blocked) {
        return NextResponse.json({ error: screen.message }, { status: 422 });
      }
    }

    const planMessages: ChatMessage[] = [
      { role: "system", content: PLAN_SYSTEM },
      ...sharedContextMessages(body.sharedContext),
      ...messages,
      { role: "user", content: "Produce the execution plan JSON now." },
    ];

    // Smaller local models sometimes return malformed or incomplete JSON, which
    // looked like a silent stall ("plan never populated"). Retry once on bad
    // output before giving up; a real provider/network error surfaces immediately.
    let parsed: ReturnType<typeof PlanSchema.safeParse> | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: unknown;
      try {
        raw = await chatJSON(planMessages, { ...llm, signal: req.signal });
      } catch (e) {
        if (e instanceof SyntaxError && attempt === 0) continue; // malformed JSON — retry
        throw e; // provider/network error — surface as 500
      }
      parsed = PlanSchema.safeParse(raw);
      if (parsed.success) break;
    }

    if (!parsed || !parsed.success) {
      return NextResponse.json(
        { error: "Plan did not match schema", issues: parsed?.error.issues ?? [] },
        { status: 422 },
      );
    }

    return NextResponse.json({ plan: parsed.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
