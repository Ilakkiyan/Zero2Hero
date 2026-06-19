import { NextRequest } from "next/server";
import { chatStream } from "@/lib/llm";
import { FIRSTVERSION_SYSTEM, firstVersionUserMessage } from "@/lib/prompts";
import { PlanSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * First Version ("past the plan", Horizon 2). Streams the cheapest first version
 * of the idea — an embedded clickable HTML prototype when it's genuinely
 * software, or a minimum-offer + concierge plan when it isn't. Same NDJSON token
 * protocol as /api/premortem and /api/draft.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded — try again shortly." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(limit.retryAfter) },
    });
  }

  const llmProvider = req.headers.get("x-llm-provider") || undefined;
  const llmModel = req.headers.get("x-llm-model") || undefined;

  let plan;
  try {
    const body = await req.json();
    const parsed = PlanSchema.safeParse(body.plan);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "valid plan required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    plan = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: "valid plan required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const chunk of chatStream(
          [
            { role: "system", content: FIRSTVERSION_SYSTEM },
            { role: "user", content: firstVersionUserMessage(plan) },
          ],
          { provider: llmProvider, model: llmModel, signal: req.signal },
        )) {
          send({ type: "token", value: chunk });
        }
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
