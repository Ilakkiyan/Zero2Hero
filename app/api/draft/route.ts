import { NextRequest } from "next/server";
import { z } from "zod";
import { chatStream } from "@/lib/llm";
import { DRAFT_SYSTEM, draftUserMessage } from "@/lib/prompts";
import { IdeaBriefSchema, MilestoneSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

const BodySchema = z.object({
  brief: IdeaBriefSchema,
  milestone: MilestoneSchema,
});

/**
 * Streams a ready-to-use artifact for one milestone (NDJSON token events,
 * same protocol as /api/interview). No marker stripping needed here.
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

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "brief and milestone required" }), {
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
            { role: "system", content: DRAFT_SYSTEM },
            { role: "user", content: draftUserMessage(body.brief, body.milestone) },
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
