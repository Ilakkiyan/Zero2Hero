import type { EvidenceStance, IdeaBrief } from "@/lib/schema";
import { chatJSON, chatStream, fetchWithRetry } from "@/lib/llm";
import { evidenceMapMessage, researchPlanMessage, researchSynthesisMessage } from "@/lib/prompts";

/**
 * Agentic web research. Planning and synthesis always run on the active LLM
 * provider (local Ollama by default). The SEARCH step prefers a local, fully
 * private SearxNG instance, and automatically falls back to a keyless
 * DuckDuckGo web search when SearxNG isn't running — so research works out of
 * the box with no Docker and no API key.
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

/** Which search backend served a query: private local SearxNG, or the keyless
 *  DuckDuckGo web fallback that needs no setup. */
export type SearchBackend = "local" | "web";

export type ResearchEvent =
  | { type: "meta"; backend: SearchBackend }
  | { type: "plan"; questions: string[] }
  | { type: "step"; index: number; question: string }
  | { type: "step_done"; index: number; sourceCount: number }
  | { type: "token"; value: string }
  | { type: "evidence"; links: EvidenceLink[] }
  | { type: "sources"; value: ResearchSource[] };

export interface ResearchOptions {
  /** SearxNG base URL for local search (default http://localhost:8080). */
  searxUrl?: string;
  /** LLM provider for the plan/synthesis brain (azure | ollama). */
  provider?: string;
  /** Model/deployment override for the plan/synthesis brain (from Settings). */
  model?: string;
  /** Per-request Azure endpoint/key (from Settings), forwarded to the brain. */
  azureEndpoint?: string;
  azureApiKey?: string;
  /** The plan's assumptions — when present, findings are linked back as evidence. */
  assumptions?: { id: string; claim: string; risk: string }[];
}

/** The LLM overrides the plan/synthesis "brain" needs, pulled from research opts. */
function brainOpts(opts: ResearchOptions) {
  return {
    provider: opts.provider,
    model: opts.model,
    azureEndpoint: opts.azureEndpoint,
    azureApiKey: opts.azureApiKey,
  };
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
      `SearxNG not reachable at ${searxUrl}. Make sure Docker is running — the desktop app starts it automatically (or run: docker compose -f docker-compose.searxng.yml up -d).`,
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

// ── DuckDuckGo (keyless web fallback — no Docker, no API key) ─────────
const DDG_HTML = "https://html.duckduckgo.com/html/";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
/** DDG wraps result links as /l/?uddg=<encoded real url>; unwrap to the target. */
function resolveDdgUrl(href: string): string {
  try {
    const u = new URL(href.startsWith("//") ? `https:${href}` : href);
    const uddg = u.searchParams.get("uddg");
    if (uddg) return uddg; // URLSearchParams already decoded it
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* malformed href — drop it */
  }
  return "";
}

/**
 * Keyless web search via DuckDuckGo's server-side HTML endpoint. Runs on the
 * Next server (no CORS, no key), so research works with zero setup. Best-effort
 * HTML parsing — if the markup shifts we just return fewer results, never crash.
 */
async function ddgSearch(question: string): Promise<{ text: string; sources: ResearchSource[] }> {
  let res: Response;
  try {
    res = await fetchWithRetry(`${DDG_HTML}?q=${encodeURIComponent(question)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
  } catch {
    throw new Error("Web search is unavailable — check your internet connection and try again.");
  }
  if (!res.ok) throw new Error(`Web search failed (${res.status}).`);
  const html = await res.text();

  const titles: { uri: string; title: string }[] = [];
  const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m = linkRe.exec(html); m; m = linkRe.exec(html)) {
    const uri = resolveDdgUrl(m[1]);
    if (uri) titles.push({ uri, title: stripHtml(m[2]) });
  }
  const snippets: string[] = [];
  const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m = snipRe.exec(html); m; m = snipRe.exec(html)) snippets.push(stripHtml(m[1]));

  const sources: ResearchSource[] = [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (let k = 0; k < titles.length && sources.length < 5; k++) {
    const { uri, title } = titles[k];
    if (seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: title || uri, uri });
    if (snippets[k]) lines.push(`- ${title}: ${snippets[k]}`);
  }
  return { text: lines.join("\n") || "(no results found)", sources };
}

// ── Backend selection ────────────────────────────────────────────────
/**
 * Run one search: prefer the private SearxNG instance, and on any failure
 * (most commonly "not running" because Docker isn't installed) fall back to the
 * keyless DuckDuckGo search. Reports which backend actually served the result.
 */
async function searchWeb(
  question: string,
  searxUrl: string,
): Promise<{ text: string; sources: ResearchSource[]; backend: SearchBackend }> {
  try {
    return { ...(await searxSearch(question, searxUrl)), backend: "local" };
  } catch {
    return { ...(await ddgSearch(question)), backend: "web" };
  }
}

// ── Planning (active LLM provider — local by default) ────────────────
async function planQuestions(
  brief: IdeaBrief,
  brain: ReturnType<typeof brainOpts>,
): Promise<string[]> {
  try {
    const data = await chatJSON<{ questions?: unknown }>(
      [{ role: "user", content: researchPlanMessage(brief) }],
      brain,
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
      brainOpts(opts),
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
  const searxUrl = opts.searxUrl || "http://localhost:8080";

  // 1. PLAN (local brain)
  const questions = await planQuestions(brief, brainOpts(opts));
  yield { type: "plan", questions };

  // 2. SEARCH — prefer private SearxNG, fall back to keyless DuckDuckGo so
  // research needs no setup. `meta` reports whichever backend served the first
  // query (they're equivalent downstream).
  const findings: { question: string; text: string }[] = [];
  const allSources = new Map<string, ResearchSource>();
  let backend: SearchBackend | null = null;

  for (let i = 0; i < questions.length; i++) {
    yield { type: "step", index: i, question: questions[i] };
    try {
      const { text, sources, backend: used } = await searchWeb(questions[i], searxUrl);
      if (!backend) {
        backend = used;
        yield { type: "meta", backend };
      }
      findings.push({ question: questions[i], text });
      for (const s of sources) allSources.set(s.uri, s);
      yield { type: "step_done", index: i, sourceCount: sources.length };
    } catch (err) {
      // Both backends down on the very first query is fatal — surface it
      // instead of synthesizing from nothing.
      if (i === 0) throw err;
      findings.push({ question: questions[i], text: "(search failed)" });
      yield { type: "step_done", index: i, sourceCount: 0 };
    }
  }

  // 3. SYNTHESIZE (local brain)
  for await (const chunk of chatStream(
    [{ role: "user", content: researchSynthesisMessage(brief, findings) }],
    brainOpts(opts),
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
