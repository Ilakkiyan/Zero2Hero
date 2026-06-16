/**
 * Bring-your-own-key helpers (client-side). The user's Gemini key lives in
 * localStorage and rides on each API request as the x-gemini-key header. It is
 * used by the server for that request only — never persisted or logged there.
 */

const KEY_STORAGE = "z2h_gemini_key";

export function getGeminiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setGeminiKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* storage blocked — key applies for this session only */
  }
}

export function clearGeminiKey(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

// ── Provider preference (UI toggle: cloud=Azure | local=Ollama) ──────
const PROVIDER_STORAGE = "z2h_provider";
export type ProviderPref = "cloud" | "local";

export function getProviderPref(): ProviderPref {
  if (typeof window === "undefined") return "local";
  try {
    return localStorage.getItem(PROVIDER_STORAGE) === "cloud" ? "cloud" : "local";
  } catch {
    return "local";
  }
}

export function setProviderPref(v: ProviderPref): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE, v);
  } catch {
    /* ignore */
  }
}

/** Map the UI preference to the server provider name. */
export function providerName(pref: ProviderPref = getProviderPref()): string {
  return pref === "cloud" ? "azure" : "ollama";
}

// ── Model override (Settings) ────────────────────────────────────────
// Models are provider-specific, so the override is keyed by server provider
// name. Empty means "use the server's env default" for that provider.
const MODEL_STORAGE_PREFIX = "z2h_model_";

export function getModelOverride(provider: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(MODEL_STORAGE_PREFIX + provider) || "";
  } catch {
    return "";
  }
}

export function setModelOverride(provider: string, model: string): void {
  try {
    const v = model.trim();
    if (v) localStorage.setItem(MODEL_STORAGE_PREFIX + provider, v);
    else localStorage.removeItem(MODEL_STORAGE_PREFIX + provider);
  } catch {
    /* ignore */
  }
}

/** JSON headers plus the chosen provider, model override, and the user's key when set. */
export function apiHeaders(): HeadersInit {
  const key = getGeminiKey();
  const provider = providerName();
  const model = getModelOverride(provider);
  return {
    "Content-Type": "application/json",
    "x-llm-provider": provider,
    ...(key ? { "x-gemini-key": key } : {}),
    ...(model ? { "x-llm-model": model } : {}),
  };
}
