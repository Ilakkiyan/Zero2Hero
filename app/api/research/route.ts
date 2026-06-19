import { NextRequest } from "next/server";
import { runAgenticResearch } from "@/lib/research";
import { IdeaBriefSchema } from "@/lib/schema";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Agentic research runs several LLM + SearxNG search calls; give it room.
// 60s is the Vercel Hobby ceiling (the loop typically finishes in ~25s).
// On Pro you can raise this to 300.
export const maxDuration = 60;

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

  const llmProvider = req.headers.get("x-llm-provider") || undefined;
  const llmModel = req.headers.get("x-llm-model") || undefined;

  let brief;
  let assumptions: { id: string; claim: string; risk: string }[] = [];
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
    // Optional: the plan's assumptions, so research can link evidence back.
    if (Array.isArray(body.assumptions)) {
      assumptions = body.assumptions
        .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a: Record<string, unknown>) => ({
          id: String(a.id ?? ""),
          claim: String(a.claim ?? ""),
          risk: String(a.risk ?? "med"),
        }))
        .filter((a: { id: string }) => a.id);
    }
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
        const searxUrl = process.env.SEARXNG_URL || "http://localhost:8080";
        for await (const event of runAgenticResearch(brief, {
          searxUrl,
          provider: llmProvider,
          model: llmModel,
          assumptions,
        })) {
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
