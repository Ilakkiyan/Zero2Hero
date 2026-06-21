/**
 * Client-side request helpers. Generation runs on the local Ollama provider by
 * default (or Azure when the user flips the cloud toggle); web research runs on
 * a local SearxNG instance. No third-party API keys are involved client-side.
 */

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

// ── Azure connection (Settings) ──────────────────────────────────────
// Endpoint + key live on the user's machine (localStorage) and ride along as
// request headers to the LOCAL server, which forwards them to Azure. The
// deployment name reuses the per-provider model override above. This lets the
// desktop app use Azure without editing any env files.
const AZURE_ENDPOINT_STORAGE = "z2h_azure_endpoint";
const AZURE_KEY_STORAGE = "z2h_azure_key";

export interface AzureConfig {
  endpoint: string;
  apiKey: string;
}

export function getAzureConfig(): AzureConfig {
  if (typeof window === "undefined") return { endpoint: "", apiKey: "" };
  try {
    return {
      endpoint: localStorage.getItem(AZURE_ENDPOINT_STORAGE) || "",
      apiKey: localStorage.getItem(AZURE_KEY_STORAGE) || "",
    };
  } catch {
    return { endpoint: "", apiKey: "" };
  }
}

function setAzureField(key: string, value: string): void {
  try {
    const v = value.trim();
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
export const setAzureEndpoint = (v: string) => setAzureField(AZURE_ENDPOINT_STORAGE, v);
export const setAzureApiKey = (v: string) => setAzureField(AZURE_KEY_STORAGE, v);

/** True once endpoint, key, and deployment (model override) are all present. */
export function isAzureConfigured(): boolean {
  const { endpoint, apiKey } = getAzureConfig();
  return !!endpoint && !!apiKey && !!getModelOverride("azure");
}

// ── Google Calendar connection (Settings) ───────────────────────────
// The OAuth client ID/secret/redirect URI live on the user's machine
// (localStorage) so the desktop app needs no .env file. Because OAuth runs on
// full-page redirects (not fetch), they can't ride as request headers like
// Azure's; instead the client POSTs them to /api/calendar/config just before
// connecting, which stashes them in an httpOnly cookie for the OAuth routes.
const GOOGLE_CLIENT_ID_STORAGE = "z2h_gcal_client_id";
const GOOGLE_CLIENT_SECRET_STORAGE = "z2h_gcal_client_secret";
const GOOGLE_REDIRECT_URI_STORAGE = "z2h_gcal_redirect_uri";

export interface GoogleCalConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Default redirect URI for the current origin (must match Google Console). */
export function defaultRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/calendar/callback`;
}

export function getGoogleConfig(): GoogleCalConfig {
  if (typeof window === "undefined") return { clientId: "", clientSecret: "", redirectUri: "" };
  try {
    return {
      clientId: localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE) || "",
      clientSecret: localStorage.getItem(GOOGLE_CLIENT_SECRET_STORAGE) || "",
      redirectUri: localStorage.getItem(GOOGLE_REDIRECT_URI_STORAGE) || defaultRedirectUri(),
    };
  } catch {
    return { clientId: "", clientSecret: "", redirectUri: "" };
  }
}

function setGoogleField(key: string, value: string): void {
  try {
    const v = value.trim();
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
export const setGoogleClientId = (v: string) => setGoogleField(GOOGLE_CLIENT_ID_STORAGE, v);
export const setGoogleClientSecret = (v: string) => setGoogleField(GOOGLE_CLIENT_SECRET_STORAGE, v);
export const setGoogleRedirectUri = (v: string) => setGoogleField(GOOGLE_REDIRECT_URI_STORAGE, v);

/** True once client id, secret, and redirect URI are all present. */
export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  return !!clientId && !!clientSecret && !!redirectUri;
}

/**
 * Relay the stored Google credentials to the server (httpOnly cookie) so the
 * OAuth routes can use them. Call this right before navigating to the connect
 * flow. Resolves whether the server now considers Calendar configured.
 */
export async function pushGoogleConfig(): Promise<boolean> {
  try {
    const res = await fetch("/api/calendar/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getGoogleConfig()),
    });
    const data = (await res.json()) as { configured?: boolean };
    return !!data.configured;
  } catch {
    return false;
  }
}

/** JSON headers plus the chosen provider and any model/Azure overrides. */
export function apiHeaders(): HeadersInit {
  const provider = providerName();
  const model = getModelOverride(provider);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-llm-provider": provider,
    ...(model ? { "x-llm-model": model } : {}),
  };
  if (provider === "azure") {
    const { endpoint, apiKey } = getAzureConfig();
    if (endpoint) headers["x-azure-endpoint"] = endpoint;
    if (apiKey) headers["x-azure-key"] = apiKey;
  }
  return headers;
}
