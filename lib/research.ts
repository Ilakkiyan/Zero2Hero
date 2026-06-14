import type { IdeaBrief } from "@/lib/schema";
import { chatJSON, chatStream, fetchWithRetry } from "@/lib/llm";
import { researchPlanMessage, researchSynthesisMessage } from "@/lib/prompts";

/**
 * Agentic web research. Three phases, all emitted as a stream of events so the
 * UI can show the agent working:
 *   1. PLAN      — generate focused sub-questions (1 LLM call)
 *   2. SEARCH    — one grounded Google-Search call per question (sequential, so
 *                  progress is visible and free-tier rate limits stay happy)
 *   3. SYNTHESIZE — stream a decision-useful brief from the gathered findings
 *
 * Grounding is Gemini-only, so the whole flow requires LLM_PROVIDER=gemini.
 */

export interface ResearchSource {
  title: string;
  uri: string;
}

export type ResearchEvent =
  | { type: "plan"; questions: string[] }
  | { type: "step"; index: number; question: string }
  | { type: "step_done"; index: number; sourceCount: number }
  | { type: "token"; value: string }
  | { type: "sources"; value: ResearchSource[] };

interface GroundChunk {
  web?: { uri?: string; title?: string };
}
interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: GroundChunk[] };
  }[];
}

function ensureGemini() {
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  if (provider !== "gemini") {
    throw new Error("Research needs the Gemini provider (web grounding). Set LLM_PROVIDER=gemini.");
  }
}

async function planQuestions(brief: IdeaBrief): Promise<string[]> {
  try {
    const data = await chatJSON<{ questions?: unknown }>([
      { role: "user", content: researchPlanMessage(brief) },
    ]);
    const qs = Array.isArray(data.questions)
      ? data.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      : [];
    if (qs.length) return qs.slice(0, 5);
  } catch {
    // fall through to defaults
  }
  return [
    `Who are the direct competitors and similar products for: ${brief.problem}?`,
    `What do users dislike about existing solutions for ${brief.targetUser}?`,
    `What skills and technology are needed to build a product that solves: ${brief.problem}?`,
    `Is there growing market demand among ${brief.targetUser} for solving: ${brief.problem}?`,
  ];
}

async function groundedSearch(question: string): Promise<{ text: string; sources: ResearchSource[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Answer with concise, current facts from the web (3-5 bullet points, real names only).\n\nQuestion: ${question}`,
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as GeminiResponse;
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  const sources: ResearchSource[] = [];
  const seen = new Set<string>();
  for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
    const w = c.web;
    if (w?.uri && !seen.has(w.uri)) {
      seen.add(w.uri);
      sources.push({ title: w.title ?? w.uri, uri: w.uri });
    }
  }
  return { text, sources };
}

export async function* runAgenticResearch(brief: IdeaBrief): AsyncGenerator<ResearchEvent> {
  ensureGemini();

  // 1. PLAN
  const questions = await planQuestions(brief);
  yield { type: "plan", questions };

  // 2. SEARCH (sequential)
  const findings: { question: string; text: string }[] = [];
  const allSources = new Map<string, ResearchSource>();

  for (let i = 0; i < questions.length; i++) {
    yield { type: "step", index: i, question: questions[i] };
    try {
      const { text, sources } = await groundedSearch(questions[i]);
      findings.push({ question: questions[i], text });
      for (const s of sources) allSources.set(s.uri, s);
      yield { type: "step_done", index: i, sourceCount: sources.length };
    } catch {
      findings.push({ question: questions[i], text: "(search failed)" });
      yield { type: "step_done", index: i, sourceCount: 0 };
    }
  }

  // 3. SYNTHESIZE (streamed)
  for await (const chunk of chatStream([
    { role: "user", content: researchSynthesisMessage(brief, findings) },
  ])) {
    yield { type: "token", value: chunk };
  }

  yield { type: "sources", value: [...allSources.values()] };
}
