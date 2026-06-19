import { NextRequest } from "next/server";
import { chatStream } from "@/lib/llm";
import { LAUNCHKIT_SYSTEM, launchKitUserMessage } from "@/lib/prompts";
import { PlanSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Launch Kit ("past the plan", Horizon 3). Streams a first-users go-to-market
 * kit — channels matched to where THIS target user actually is (online OR
 * local/offline), ready-to-post copy, first-customer outreach, and a first-week
 * checklist. Same NDJSON token protocol as /api/firstversion and /api/premortem.
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
            { role: "system", content: LAUNCHKIT_SYSTEM },
            { role: "user", content: launchKitUserMessage(plan) },
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
