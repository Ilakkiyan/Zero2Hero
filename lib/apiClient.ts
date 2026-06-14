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

/** JSON headers plus the user's key when one is set. */
export function apiHeaders(): HeadersInit {
  const key = getGeminiKey();
  return {
    "Content-Type": "application/json",
    ...(key ? { "x-gemini-key": key } : {}),
  };
}
