import { NextRequest, NextResponse } from "next/server";
import { chatJSON, type ChatMessage } from "@/lib/llm";
import { PLAN_SYSTEM, sharedContextMessages } from "@/lib/prompts";
import { PlanSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

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

  const apiKey = req.headers.get("x-gemini-key") || undefined;
  const llmProvider = req.headers.get("x-llm-provider") || undefined;
  const llmModel = req.headers.get("x-llm-model") || undefined;

  try {
    const body = (await req.json()) as { messages: ChatMessage[]; sharedContext?: unknown };
    const { messages } = body;
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages[] required" }, { status: 400 });
    }

    const raw = await chatJSON(
      [
        { role: "system", content: PLAN_SYSTEM },
        ...sharedContextMessages(body.sharedContext),
        ...messages,
        { role: "user", content: "Produce the execution plan JSON now." },
      ],
      { apiKey, provider: llmProvider, model: llmModel, signal: req.signal },
    );

    const parsed = PlanSchema.safeParse(raw);
    if (!parsed.success) {
      // Surface the validation issue so we can tighten the prompt during the build.
      return NextResponse.json(
        { error: "Plan did not match schema", issues: parsed.error.issues },
        { status: 422 },
      );
    }

    return NextResponse.json({ plan: parsed.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
