/**
 * Provider-agnostic LLM layer.
 *
 * The rest of the app only ever imports `chat()` / `chatJSON()` — it never
 * knows which backend is live. Swap providers by changing LLM_PROVIDER in
 * .env.local; no app code changes. This is the seam that lets us dev on free
 * local Ollama and fall back to Azure's $100 credit.
 */

export type Role = "system" | "user" | "assistant";
export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatOptions {
  /** Hint the model to return strict JSON. Adapters enforce where supported. */
  json?: boolean;
  temperature?: number;
  /** Per-request provider override ("azure" | "ollama"). */
  provider?: string;
  /** Per-request model/deployment override (from Settings). Falls back to env. */
  model?: string;
  /** Per-request Azure endpoint/key (from Settings). Fall back to env. */
  azureEndpoint?: string;
  azureApiKey?: string;
  /** Aborts the upstream provider fetch when the client disconnects (req.signal). */
  signal?: AbortSignal;
}

/**
 * Pull the per-request LLM overrides the client sends (set in the Settings UI):
 * provider + model, and — so Azure works in the desktop app without editing env
 * files — the Azure endpoint and key. Any field left unset falls back to env.
 */
export function llmOptionsFromHeaders(
  headers: Headers,
): Pick<ChatOptions, "provider" | "model" | "azureEndpoint" | "azureApiKey"> {
  return {
    provider: headers.get("x-llm-provider") || undefined,
    model: headers.get("x-llm-model") || undefined,
    azureEndpoint: headers.get("x-azure-endpoint") || undefined,
    azureApiKey: headers.get("x-azure-key") || undefined,
  };
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  stream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<string>;
}

/** Deep-optional shape of a streaming chunk across the providers. */
interface StreamChunk {
  choices?: { delta?: { content?: string } }[]; // Azure / OpenAI
  message?: { content?: string }; // Ollama
  done?: boolean; // Ollama
}

// ── Azure OpenAI ─────────────────────────────────────────────────────
/**
 * Resolve the Azure OpenAI v1 (OpenAI-compatible) endpoint + model. Newer Azure
 * AI Foundry resources only serve `/openai/v1/...` (model in the body), not the
 * classic `/openai/deployments/{name}/...?api-version=` path. We accept an
 * endpoint that's a bare resource host OR one that already includes `/openai`
 * or `/openai/v1`, so either form in .env.local works.
 */
function azureV1(opts: ChatOptions): { url: string; apiKey: string; model: string } {
  const root = (opts.azureEndpoint?.trim() || requireEnv("AZURE_OPENAI_ENDPOINT"))
    .replace(/\/+$/, "")
    .replace(/\/openai(\/v1)?$/, "");
  const apiKey = opts.azureApiKey?.trim() || requireEnv("AZURE_OPENAI_API_KEY");
  const model = opts.model?.trim() || requireEnv("AZURE_OPENAI_DEPLOYMENT");
  return { url: `${root}/openai/v1/chat/completions`, apiKey, model };
}

class AzureOpenAIProvider implements LLMProvider {
  readonly name = "azure";

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const { url, apiKey, model } = azureV1(opts);
    const res = await fetchWithRetry(url, {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Azure OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    const { url, apiKey, model } = azureV1(opts);
    const res = await fetchWithRetry(url, {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.7, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Azure OpenAI ${res.status}: ${await res.text()}`);
    yield* sse(res, (j) => j.choices?.[0]?.delta?.content ?? "");
  }
}

// ── Ollama (local) ───────────────────────────────────────────────────
class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const model = opts.model?.trim() || process.env.OLLAMA_MODEL || "qwen2.5:7b";

    const res = await fetchWithRetry(`${base}/api/chat`, {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        // Only send `think` when OLLAMA_THINK is set — qwen2.5 (the default)
        // rejects the param with a 400, while qwen3 reasoning models accept it:
        // think=true isolates the <think> trace into a separate field we drop,
        // think=false leaks it into `content`. Default (unset): omit entirely.
        ...(process.env.OLLAMA_THINK ? { think: process.env.OLLAMA_THINK === "true" } : {}),
        ...(opts.json ? { format: "json" } : {}),
        options: {
          temperature: opts.temperature ?? 0.7,
          ...(process.env.OLLAMA_NUM_CTX ? { num_ctx: Number(process.env.OLLAMA_NUM_CTX) } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.message?.content ?? "";
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const model = opts.model?.trim() || process.env.OLLAMA_MODEL || "qwen2.5:7b";

    const res = await fetchWithRetry(`${base}/api/chat`, {
      method: "POST",
      signal: opts.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        // see chat(): only send `think` when OLLAMA_THINK is set (qwen2.5 400s on it)
        ...(process.env.OLLAMA_THINK ? { think: process.env.OLLAMA_THINK === "true" } : {}),
        options: {
          temperature: opts.temperature ?? 0.7,
          ...(process.env.OLLAMA_NUM_CTX ? { num_ctx: Number(process.env.OLLAMA_NUM_CTX) } : {}),
        },
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    yield* ndjson(res);
  }
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}. See .env.example`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() with capped exponential backoff on 429 (rate limit) and 503
 * (overload). Honors Retry-After when present, capped at 8s so a long
 * per-minute window can't hang a request. Returns the final Response for the
 * caller to handle (ok or not) — smooths the bursts you get when several
 * teammates hit one free-tier key at once.
 */
export async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    if ((response.status !== 429 && response.status !== 503) || attempt >= maxRetries) {
      return response;
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : Math.min(2 ** attempt * 500, 8000) + Math.random() * 250;
    await response.body?.cancel().catch(() => {}); // free the connection before retrying
    await sleep(wait);
  }
}

const KNOWN_PROVIDERS = new Set(["azure", "ollama"]);
const providerCache = new Map<string, LLMProvider>();

function makeProvider(which: string): LLMProvider {
  switch (which) {
    case "azure":
      return new AzureOpenAIProvider();
    case "ollama":
      return new OllamaProvider();
    default:
      throw new Error(`Unknown LLM provider "${which}". Use azure | ollama.`);
  }
}

/**
 * Resolve a provider per request: an explicit valid name (from the UI toggle's
 * x-llm-provider header) wins; otherwise the LLM_PROVIDER env default; otherwise
 * Ollama. Instances are cached and built lazily, so an unconfigured provider
 * never crashes the app until it's actually used.
 */
export function getProvider(name?: string): LLMProvider {
  const requested = name?.toLowerCase();
  const which =
    requested && KNOWN_PROVIDERS.has(requested)
      ? requested
      : (process.env.LLM_PROVIDER || "ollama").toLowerCase();
  let p = providerCache.get(which);
  if (!p) {
    p = makeProvider(which);
    providerCache.set(which, p);
  }
  return p;
}

/** Plain text completion. */
export function chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
  return getProvider(opts?.provider).chat(messages, opts);
}

/** Streaming text completion — yields chunks as they arrive. */
export function chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<string> {
  return getProvider(opts?.provider).stream(messages, opts);
}

// ── Stream parsing helpers ───────────────────────────────────────────
/** Yield the response body one line at a time, tolerant of chunk splits. */
async function* readLines(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      yield buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
    }
  }
  if (buffer.length) yield buffer;
}

/** Parse Server-Sent Events (`data: {...}`) — Azure. */
async function* sse(res: Response, extract: (j: StreamChunk) => string): AsyncGenerator<string> {
  for await (const line of readLines(res)) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") return;
    try {
      const text = extract(JSON.parse(data) as StreamChunk);
      if (text) yield text;
    } catch {
      // keep-alive comment or split JSON — skip
    }
  }
}

/** Parse newline-delimited JSON — Ollama. */
async function* ndjson(res: Response): AsyncGenerator<string> {
  for await (const line of readLines(res)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j = JSON.parse(t) as StreamChunk;
      if (j.message?.content) yield j.message.content;
      if (j.done) return;
    } catch {
      // partial line — skip
    }
  }
}

/** JSON completion — asks the provider for strict JSON and parses it. */
export async function chatJSON<T = unknown>(messages: ChatMessage[], opts?: ChatOptions): Promise<T> {
  const raw = await getProvider(opts?.provider).chat(messages, { ...opts, json: true });
  return JSON.parse(stripFences(raw)) as T;
}

/** Some models wrap JSON in ```json fences even in JSON mode — strip them. */
function stripFences(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return t;
}
