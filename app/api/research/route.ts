import { NextRequest } from "next/server";
import { runAgenticResearch } from "@/lib/research";
import { IdeaBriefSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Agentic research runs several LLM + grounded-search calls; give it room.
export const maxDuration = 120;

/**
 * Streams agentic web research as NDJSON events:
 *   {"type":"plan","questions":[...]}          the research plan
 *   {"type":"step","index":N,"question":"..."}  a search starting
 *   {"type":"step_done","index":N,"sourceCount":K}
 *   {"type":"token","value":"..."}              synthesized brief (streamed)
 *   {"type":"sources","value":[{title,uri}]}    all cited links
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

  const apiKey = req.headers.get("x-gemini-key") || undefined;

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
        for await (const event of runAgenticResearch(brief, apiKey)) {
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
