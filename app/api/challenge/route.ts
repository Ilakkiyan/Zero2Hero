import { NextRequest } from "next/server";
import { chatStream, type ChatMessage } from "@/lib/llm";
import { CHALLENGE_SYSTEM, challengeOpenMessage } from "@/lib/prompts";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Adversarial cofounder: streams a red-team argument against ONE assumption,
 * multi-turn. Same NDJSON token protocol as /api/interview. The client sends the
 * target `assumption` plus the visible conversation `messages`; the server
 * re-anchors the task on the assumption every turn so context never drifts.
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
  const llmModel = req.headers.get("x-llm-model") || undefined;

  let assumption: { claim: string; risk: string; cheapTest: string };
  let messages: ChatMessage[];
  try {
    const body = await req.json();
    const a = body.assumption;
    if (!a || typeof a.claim !== "string") throw new Error("assumption required");
    assumption = { claim: a.claim, risk: String(a.risk ?? "med"), cheapTest: String(a.cheapTest ?? "") };
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bad request";
    return new Response(JSON.stringify({ error: message }), {
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
            { role: "system", content: CHALLENGE_SYSTEM },
            { role: "user", content: challengeOpenMessage(assumption) },
            ...messages,
          ],
          { apiKey, provider: llmProvider, model: llmModel, signal: req.signal },
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
