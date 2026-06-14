import { NextRequest } from "next/server";
import { streamResearch } from "@/lib/research";
import { researchUserMessage } from "@/lib/prompts";
import { IdeaBriefSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Streams a grounded research brief for the idea. NDJSON events:
 *   {"type":"token","value":"..."}      incremental text
 *   {"type":"sources","value":[{title,uri}]}   cited links (once, near the end)
 *   {"type":"done"} / {"type":"error","message":"..."}
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded — try again shortly." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(limit.retryAfter) },
    });
  }

  let brief;
  try {
    const body = await req.json();
    const parsed = IdeaBriefSchema.safeParse(body.brief);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "valid brief required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    brief = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: "valid brief required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const event of streamResearch(researchUserMessage(brief))) {
          send(event);
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
