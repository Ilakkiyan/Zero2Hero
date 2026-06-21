import type { Plan } from "@/lib/schema";

/**
 * Google Calendar OAuth + event creation. Zero SDK — just fetch against
 * Google's REST endpoints so we add no dependencies. Tokens are short-lived
 * (online access) and held in an httpOnly cookie by the route handlers; this
 * module never touches cookies or the browser.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

/**
 * OAuth client credentials. Supplied either from the UI (Settings, relayed via a
 * cookie) or, as a fallback, from server env vars — so the desktop app needs no
 * .env file while a deployed instance can still use env config.
 */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** True when a (partial) override carries all three credentials. */
export function hasGoogleConfig(o?: Partial<GoogleConfig> | null): o is GoogleConfig {
  return !!o && !!o.clientId && !!o.clientSecret && !!o.redirectUri;
}

/**
 * Name of the httpOnly cookie the UI sets (just before the OAuth handshake) to
 * relay the user's OAuth client credentials to the server. The browser never
 * reads it back; only our own route handlers do.
 */
export const CONFIG_COOKIE = "gcal_cfg";

/** Parse the relayed config cookie into a usable override, or null. */
export function parseConfigCookie(raw?: string | null): Partial<GoogleConfig> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<GoogleConfig>;
    return {
      clientId: typeof o.clientId === "string" ? o.clientId : undefined,
      clientSecret: typeof o.clientSecret === "string" ? o.clientSecret : undefined,
      redirectUri: typeof o.redirectUri === "string" ? o.redirectUri : undefined,
    };
  } catch {
    return null;
  }
}

function config(override?: Partial<GoogleConfig> | null): GoogleConfig {
  const clientId = override?.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = override?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = override?.redirectUri || process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google Calendar not configured — add your Client ID, Client Secret, and Redirect URI in Settings (or set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** True when credentials are available from either the override or env. */
export function isConfigured(override?: Partial<GoogleConfig> | null): boolean {
  try {
    config(override);
    return true;
  } catch {
    return false;
  }
}

export function buildAuthUrl(override?: Partial<GoogleConfig> | null): string {
  const { clientId, redirectUri } = config(override);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "online", // short-lived token is fine for a sync action
    include_granted_scopes: "true",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  override?: Partial<GoogleConfig> | null,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret, redirectUri } = config(override);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { accessToken: data.access_token as string, expiresIn: (data.expires_in as number) ?? 3600 };
}

export interface CreatedEvent {
  goal: string;
  link: string;
}

/** Thrown when the access token is rejected — caller should clear it and reconnect. */
export class TokenExpiredError extends Error {
  constructor() {
    super("Google session expired");
    this.name = "TokenExpiredError";
  }
}

/**
 * Create one all-day event per milestone, scheduled sequentially from tomorrow
 * (each a 2-day block). The freeform `phase` label is preserved in the title so
 * the plan's framing carries over even though it isn't a real date.
 */
export async function createPlanEvents(accessToken: string, plan: Plan): Promise<CreatedEvent[]> {
  const created: CreatedEvent[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1); // start tomorrow
  const DURATION_DAYS = 2;

  for (const m of plan.milestones) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + DURATION_DAYS); // end.date is exclusive for all-day events

    const description = [
      m.tasks.length ? "Tasks:\n" + m.tasks.map((t) => `• ${t}`).join("\n") : "",
      m.validates ? `\n\nValidates assumption: ${m.validates}` : "",
      "\n\n— planned with Zero2Hero",
    ].join("");

    const res = await fetch(EVENTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `[${m.phase}] ${m.goal}`,
        description,
        start: { date: isoDate(start) },
        end: { date: isoDate(end) },
      }),
    });

    if (res.status === 401) throw new TokenExpiredError();
    if (!res.ok) throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    created.push({ goal: m.goal, link: (data.htmlLink as string) ?? "" });

    cursor.setTime(end.getTime());
  }

  return created;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
