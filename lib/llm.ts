/**
 * Provider-agnostic LLM layer.
 *
 * The rest of the app only ever imports `chat()` / `chatJSON()` — it never
 * knows which backend is live. Swap providers by changing LLM_PROVIDER in
 * .env.local; no app code changes. This is the seam that lets us dev on free
 * Ollama, demo on Gemini's free tier, and fall back to Azure's $100 credit.
 *
 * Streaming is intentionally NOT here yet (Day 2 on the plan). Spine first:
 * every provider implements a single non-streaming `chat()`.
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
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  stream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<string>;
}

/** Deep-optional shape of a streaming chunk across all three providers. */
interface StreamChunk {
  choices?: { delta?: { content?: string } }[]; // Azure / OpenAI
  candidates?: { content?: { parts?: { text?: string }[] } }[]; // Gemini
  message?: { content?: string }; // Ollama
  done?: boolean; // Ollama
}

// ── Azure OpenAI ─────────────────────────────────────────────────────
class AzureOpenAIProvider implements LLMProvider {
  readonly name = "azure";

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const endpoint = requireEnv("AZURE_OPENAI_ENDPOINT").replace(/\/$/, "");
    const apiKey = requireEnv("AZURE_OPENAI_API_KEY");
    const deployment = requireEnv("AZURE_OPENAI_DEPLOYMENT");
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01";

    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
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
    const endpoint = requireEnv("AZURE_OPENAI_ENDPOINT").replace(/\/$/, "");
    const apiKey = requireEnv("AZURE_OPENAI_API_KEY");
    const deployment = requireEnv("AZURE_OPENAI_DEPLOYMENT");
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01";

    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ messages, temperature: opts.temperature ?? 0.7, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Azure OpenAI ${res.status}: ${await res.text()}`);
    yield* sse(res, (j) => j.choices?.[0]?.delta?.content ?? "");
  }
}

// ── Google Gemini ────────────────────────────────────────────────────
class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const apiKey = requireEnv("GEMINI_API_KEY");
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    // Gemini splits the system prompt out and uses "user"/"model" roles.
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    const apiKey = requireEnv("GEMINI_API_KEY");
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    // alt=sse gives clean `data:` lines instead of a streamed JSON array.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { temperature: opts.temperature ?? 0.7 },
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    yield* sse(res, (j) =>
      j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
    );
  }
}

// ── Ollama (local) ───────────────────────────────────────────────────
class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const model = process.env.OLLAMA_MODEL || "llama3.1";

    const res = await fetchWithRetry(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(opts.json ? { format: "json" } : {}),
        options: { temperature: opts.temperature ?? 0.7 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.message?.content ?? "";
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const model = process.env.OLLAMA_MODEL || "llama3.1";

    const res = await fetchWithRetry(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature: opts.temperature ?? 0.7 },
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

function selectProvider(): LLMProvider {
  const which = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  switch (which) {
    case "azure":
      return new AzureOpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    case "ollama":
      return new OllamaProvider();
    default:
      throw new Error(`Unknown LLM_PROVIDER "${which}". Use azure | gemini | ollama.`);
  }
}

// Lazily built so a missing key for an unused provider never crashes the app.
let _provider: LLMProvider | null = null;
export function provider(): LLMProvider {
  if (!_provider) _provider = selectProvider();
  return _provider;
}

/** Plain text completion. */
export function chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
  return provider().chat(messages, opts);
}

/** Streaming text completion — yields chunks as they arrive. */
export function chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<string> {
  return provider().stream(messages, opts);
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

/** Parse Server-Sent Events (`data: {...}`) — Azure & Gemini. */
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
  const raw = await provider().chat(messages, { ...opts, json: true });
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
