import { NextRequest } from "next/server";
import { chatStream, type ChatMessage } from "@/lib/llm";
import { INTERVIEW_SYSTEM } from "@/lib/prompts";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

const MARKER = "READY_TO_PLAN";

/**
 * Streams the interview reply as newline-delimited JSON events:
 *   {"type":"token","value":"..."}   incremental text
 *   {"type":"done","readyToPlan":bool}
 *   {"type":"error","message":"..."}
 *
 * The READY_TO_PLAN marker is stripped server-side with a tail buffer so a
 * partial marker split across chunks never flashes in the UI.
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
  const llmProvider = req.headers.get("x-llm-provider") || undefined;

  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error("messages[] required");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bad request";
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let buf = ""; // may hold a partial marker prefix; never emitted until proven safe
      let sawMarker = false;

      try {
        for await (const chunk of chatStream(
          [{ role: "system", content: INTERVIEW_SYSTEM }, ...messages],
          { apiKey, provider: llmProvider },
        )) {
          buf += chunk;

          // Remove any complete markers anywhere in the buffer.
          let i: number;
          while ((i = buf.indexOf(MARKER)) !== -1) {
            const before = buf.slice(0, i);
            if (before) send({ type: "token", value: before });
            buf = buf.slice(i + MARKER.length);
            sawMarker = true;
          }

          // Emit everything except a trailing tail that could begin a marker.
          const keep = MARKER.length - 1;
          if (buf.length > keep) {
            send({ type: "token", value: buf.slice(0, buf.length - keep) });
            buf = buf.slice(buf.length - keep);
          }
        }

        if (buf) send({ type: "token", value: buf });
        send({ type: "done", readyToPlan: sawMarker });
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
