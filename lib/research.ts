import type { EvidenceStance, IdeaBrief } from "@/lib/schema";
import { chatJSON, chatStream, fetchWithRetry } from "@/lib/llm";
import { evidenceMapMessage, researchPlanMessage, researchSynthesisMessage } from "@/lib/prompts";

/**
 * Agentic web research. Planning and synthesis always run on the active LLM
 * provider (local Ollama by default). Only the SEARCH step reaches the web,
 * via a pluggable backend:
 *   - SearxNG (local, default) — no key, fully private
 *   - Gemini Google Search grounding — used when the user brings a cloud key
 *
 * Phases stream as events so the UI can show the agent working:
 *   PLAN → SEARCH (one call per question) → SYNTHESIZE.
 */

export interface ResearchSource {
  title: string;
  uri: string;
}

export type SuggestedStatus = "passed" | "failed" | "inconclusive" | null;

/** A finding mapped onto one assumption — the Evidence Engine's output unit. */
export interface EvidenceLink {
  assumptionId: string;
  stance: EvidenceStance;
  snippet: string;
  source: ResearchSource;
  suggestedStatus: SuggestedStatus;
}

export type ResearchEvent =
  | { type: "meta"; backend: "local" | "cloud" }
  | { type: "plan"; questions: string[] }
  | { type: "step"; index: number; question: string }
  | { type: "step_done"; index: number; sourceCount: number }
  | { type: "token"; value: string }
  | { type: "evidence"; links: EvidenceLink[] }
  | { type: "sources"; value: ResearchSource[] };

export interface ResearchOptions {
  /** When set, search uses Gemini grounding (cloud) instead of SearxNG. */
  geminiKey?: string;
  /** SearxNG base URL for local search (default http://localhost:8080). */
  searxUrl?: string;
  /** LLM provider for the plan/synthesis brain (azure | ollama | gemini). */
  provider?: string;
  /** The plan's assumptions — when present, findings are linked back as evidence. */
  assumptions?: { id: string; claim: string; risk: string }[];
}

// ── SearxNG (local search) ───────────────────────────────────────────
async function searxSearch(
  question: string,
  searxUrl: string,
): Promise<{ text: string; sources: ResearchSource[] }> {
  const url = `${searxUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(question)}&format=json`;

  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      headers: { Accept: "application/json", "User-Agent": "Zero2Hero/1.0" },
    });
  } catch {
    throw new Error(
      `SearxNG not reachable at ${searxUrl}. Start it (docker compose -f docker-compose.searxng.yml up -d) or add a Gemini key.`,
    );
  }
  if (!res.ok) {
    throw new Error(`SearxNG ${res.status} at ${searxUrl} — is the JSON format enabled in settings.yml?`);
  }

  const data = (await res.json()) as {
    results?: { url?: string; title?: string; content?: string }[];
  };
  const results = (data.results ?? []).slice(0, 5);

  const sources: ResearchSource[] = [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of results) {
    if (r.url && !seen.has(r.url)) {
      seen.add(r.url);
      sources.push({ title: r.title || r.url, uri: r.url });
    }
    if (r.content) lines.push(`- ${r.title ?? ""}: ${r.content}`);
  }
  return { text: lines.join("\n") || "(no results found)", sources };
}

// ── Gemini grounding (cloud search) ──────────────────────────────────
interface GroundChunk {
  web?: { uri?: string; title?: string };
}
interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: GroundChunk[] };
  }[];
}

async function groundedSearch(
  question: string,
  apiKey: string,
): Promise<{ text: string; sources: ResearchSource[] }> {
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

// ── Planning (active LLM provider — local by default) ────────────────
async function planQuestions(
  brief: IdeaBrief,
  geminiKey?: string,
  provider?: string,
): Promise<string[]> {
  try {
    const data = await chatJSON<{ questions?: unknown }>(
      [{ role: "user", content: researchPlanMessage(brief) }],
      { apiKey: geminiKey, provider },
    );
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

// ── Evidence mapping (active LLM provider) ───────────────────────────
const STANCES = new Set<EvidenceStance>(["supports", "undermines", "neutral"]);
const STATUSES = new Set(["passed", "failed", "inconclusive"]);

/**
 * Ask the model to map findings onto the assumptions. Hardened against bad
 * output: drops links for unknown assumption ids, invalid stances, or sources
 * that aren't real http(s) URLs — so we never attach a hallucinated citation.
 */
async function mapEvidence(
  brief: IdeaBrief,
  assumptions: NonNullable<ResearchOptions["assumptions"]>,
  findings: { question: string; text: string }[],
  opts: ResearchOptions,
): Promise<EvidenceLink[]> {
  if (!assumptions.length) return [];
  const ids = new Set(assumptions.map((a) => a.id));
  try {
    const data = await chatJSON<{ links?: unknown }>(
      [{ role: "user", content: evidenceMapMessage(brief, assumptions, findings) }],
      { apiKey: opts.geminiKey, provider: opts.provider },
    );
    const raw = Array.isArray(data.links) ? data.links : [];
    const links: EvidenceLink[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const assumptionId = String(o.assumptionId ?? "");
      const stance = String(o.stance ?? "neutral") as EvidenceStance;
      const uri = String(o.sourceUri ?? "");
      if (!ids.has(assumptionId) || !STANCES.has(stance) || !/^https?:\/\//.test(uri)) continue;
      const suggested = String(o.suggestedStatus ?? "");
      links.push({
        assumptionId,
        stance,
        snippet: String(o.snippet ?? "").slice(0, 400),
        source: { title: String(o.sourceTitle || uri), uri },
        suggestedStatus: STATUSES.has(suggested) ? (suggested as SuggestedStatus) : null,
      });
    }
    return links;
  } catch {
    return [];
  }
}

export async function* runAgenticResearch(
  brief: IdeaBrief,
  opts: ResearchOptions = {},
): AsyncGenerator<ResearchEvent> {
  const useCloud = !!opts.geminiKey;
  const searxUrl = opts.searxUrl || "http://localhost:8080";
  yield { type: "meta", backend: useCloud ? "cloud" : "local" };

  // 1. PLAN (local brain)
  const questions = await planQuestions(brief, opts.geminiKey, opts.provider);
  yield { type: "plan", questions };

  // 2. SEARCH (pluggable backend)
  const findings: { question: string; text: string }[] = [];
  const allSources = new Map<string, ResearchSource>();

  for (let i = 0; i < questions.length; i++) {
    yield { type: "step", index: i, question: questions[i] };
    try {
      const { text, sources } = useCloud
        ? await groundedSearch(questions[i], opts.geminiKey!)
        : await searxSearch(questions[i], searxUrl);
      findings.push({ question: questions[i], text });
      for (const s of sources) allSources.set(s.uri, s);
      yield { type: "step_done", index: i, sourceCount: sources.length };
    } catch (err) {
      // A failure on the very first search (backend down / bad key) is fatal —
      // surface it instead of synthesizing from nothing.
      if (i === 0) throw err;
      findings.push({ question: questions[i], text: "(search failed)" });
      yield { type: "step_done", index: i, sourceCount: 0 };
    }
  }

  // 3. SYNTHESIZE (local brain)
  for await (const chunk of chatStream(
    [{ role: "user", content: researchSynthesisMessage(brief, findings) }],
    { apiKey: opts.geminiKey, provider: opts.provider },
  )) {
    yield { type: "token", value: chunk };
  }

  // 4. EVIDENCE — link findings back onto the assumptions so research de-risks
  // the actual plan instead of producing a throwaway brief.
  if (opts.assumptions?.length) {
    const links = await mapEvidence(brief, opts.assumptions, findings, opts);
    if (links.length) yield { type: "evidence", links };
  }

  yield { type: "sources", value: [...allSources.values()] };
}
