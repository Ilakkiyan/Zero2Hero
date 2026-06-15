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
function providerName(): string {
  return getProviderPref() === "cloud" ? "azure" : "ollama";
}

/** JSON headers plus the chosen provider and the user's key when set. */
export function apiHeaders(): HeadersInit {
  const key = getGeminiKey();
  return {
    "Content-Type": "application/json",
    "x-llm-provider": providerName(),
    ...(key ? { "x-gemini-key": key } : {}),
  };
}
