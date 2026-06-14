/**
 * Live web research via Gemini's Google Search grounding — the app's
 * "built-in browser". Streams the synthesized brief as text tokens and, at the
 * end, the real cited source links pulled from the grounding metadata.
 *
 * Gemini-specific by design (grounding is a Gemini capability). If the active
 * provider isn't Gemini it throws a clear message rather than silently
 * returning an ungrounded answer.
 */

export interface ResearchSource {
  title: string;
  uri: string;
}

export type ResearchEvent =
  | { type: "token"; value: string }
  | { type: "sources"; value: ResearchSource[] };

interface GroundChunk {
  web?: { uri?: string; title?: string };
}
interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: { groundingChunks?: GroundChunk[] };
}
interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
}

export async function* streamResearch(prompt: string): AsyncGenerator<ResearchEvent> {
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  if (provider !== "gemini") {
    throw new Error("Research needs the Gemini provider (web grounding). Set LLM_PROVIDER=gemini.");
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }], // ← live web search grounding
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  // De-duped by URI so repeated citations collapse to one source.
  const sources = new Map<string, ResearchSource>();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const j = JSON.parse(data) as GeminiStreamChunk;
        const cand = j.candidates?.[0];
        const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (text) yield { type: "token", value: text };

        for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
          if (c.web?.uri) {
            sources.set(c.web.uri, { title: c.web.title ?? c.web.uri, uri: c.web.uri });
          }
        }
      } catch {
        // keep-alive / split JSON — skip
      }
    }
  }

  if (sources.size) yield { type: "sources", value: [...sources.values()] };
}
