// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan, calendarMilestones } from "@/test/fixtures/plan";
import { jsonRequest } from "@/test/helpers";

const buildAuthUrl = vi.fn();
const exchangeCode = vi.fn();
const createPlanEvents = vi.fn();

// Keep the real TokenExpiredError so the sync route's `instanceof` check works.
vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return {
    // Keep the real cookie helpers/constants so the routes can parse config.
    TokenExpiredError: actual.TokenExpiredError,
    CONFIG_COOKIE: actual.CONFIG_COOKIE,
    parseConfigCookie: actual.parseConfigCookie,
    hasGoogleConfig: actual.hasGoogleConfig,
    isConfigured: actual.isConfigured,
    buildAuthUrl: (...a: unknown[]) => buildAuthUrl(...a),
    exchangeCode: (...a: unknown[]) => exchangeCode(...a),
    createPlanEvents: (...a: unknown[]) => createPlanEvents(...a),
  };
});

import { CONFIG_COOKIE, TokenExpiredError } from "@/lib/google";
import { GET as authGET } from "@/app/api/calendar/auth/route";
import { GET as callbackGET } from "@/app/api/calendar/callback/route";
import { POST as syncPOST } from "@/app/api/calendar/sync/route";
import { POST as configPOST } from "@/app/api/calendar/config/route";

const fullCfg = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "http://localhost/api/calendar/callback",
};

afterEach(() => {
  buildAuthUrl.mockReset();
  exchangeCode.mockReset();
  createPlanEvents.mockReset();
});

describe("GET /api/calendar/auth", () => {
  it("redirects to the Google consent URL", async () => {
    buildAuthUrl.mockReturnValueOnce("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    const res = await authGET(new NextRequest("http://localhost/api/calendar/auth"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("accounts.google.com");
  });

  it("redirects to ?gcal=error when Google is not configured", async () => {
    buildAuthUrl.mockImplementationOnce(() => {
      throw new Error("not configured");
    });
    const res = await authGET(new NextRequest("http://localhost/api/calendar/auth"));
    expect(res.headers.get("location")).toContain("gcal=error");
  });

  it("passes credentials from the relay cookie to buildAuthUrl", async () => {
    buildAuthUrl.mockReturnValueOnce("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    const req = new NextRequest("http://localhost/api/calendar/auth");
    req.cookies.set(CONFIG_COOKIE, JSON.stringify(fullCfg));
    await authGET(req);
    expect(buildAuthUrl).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cid" }));
  });
});

describe("POST /api/calendar/config", () => {
  it("stores complete credentials in an httpOnly cookie", async () => {
    const res = await configPOST(jsonRequest("http://localhost/api/calendar/config", fullCfg));
    const data = await res.json();
    expect(data.configured).toBe(true);
    const cookie = res.cookies.get(CONFIG_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(JSON.parse(cookie!.value)).toMatchObject({ clientId: "cid" });
  });

  it("clears the cookie and reports not configured when fields are missing", async () => {
    const res = await configPOST(
      jsonRequest("http://localhost/api/calendar/config", { clientId: "cid" }),
    );
    const data = await res.json();
    expect(data.configured).toBe(false);
    expect(res.cookies.get(CONFIG_COOKIE)?.value).toBe("");
  });
});

describe("GET /api/calendar/callback", () => {
  it("exchanges the code, sets an httpOnly cookie, and returns connected", async () => {
    exchangeCode.mockResolvedValueOnce({ accessToken: "tok-123", expiresIn: 3600 });
    const res = await callbackGET(
      new NextRequest("http://localhost/api/calendar/callback?code=abc"),
    );
    expect(res.headers.get("location")).toContain("gcal=connected");
    const cookie = res.cookies.get("gcal_token");
    expect(cookie?.value).toBe("tok-123");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("passes credentials from the relay cookie to exchangeCode", async () => {
    exchangeCode.mockResolvedValueOnce({ accessToken: "tok-123", expiresIn: 3600 });
    const req = new NextRequest("http://localhost/api/calendar/callback?code=abc");
    req.cookies.set(CONFIG_COOKIE, JSON.stringify(fullCfg));
    await callbackGET(req);
    expect(exchangeCode).toHaveBeenCalledWith("abc", expect.objectContaining({ clientId: "cid" }));
  });

  it("redirects to error when the provider returns an error param", async () => {
    const res = await callbackGET(
      new NextRequest("http://localhost/api/calendar/callback?error=access_denied"),
    );
    expect(res.headers.get("location")).toContain("gcal=error");
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("redirects to error when the code exchange throws", async () => {
    exchangeCode.mockRejectedValueOnce(new Error("bad code"));
    const res = await callbackGET(
      new NextRequest("http://localhost/api/calendar/callback?code=abc"),
    );
    expect(res.headers.get("location")).toContain("gcal=error");
  });
});

describe("POST /api/calendar/sync", () => {
  const withToken = (body: unknown) =>
    jsonRequest("http://localhost/api/calendar/sync", body, { cookie: "gcal_token=tok-123" });

  it("returns 401 when there is no token cookie", async () => {
    const res = await syncPOST(jsonRequest("http://localhost/api/calendar/sync", { plan: validPlan }));
    expect(res.status).toBe(401);
    expect(createPlanEvents).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid plan", async () => {
    const res = await syncPOST(withToken({ plan: { nope: true } }));
    expect(res.status).toBe(400);
  });

  it("returns the created event count on success", async () => {
    createPlanEvents.mockResolvedValueOnce(calendarMilestones);
    const res = await syncPOST(withToken({ plan: validPlan }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(calendarMilestones.length);
    expect(data.events).toHaveLength(calendarMilestones.length);
  });

  it("clears the cookie and returns 401 when the token is expired", async () => {
    createPlanEvents.mockRejectedValueOnce(new TokenExpiredError());
    const res = await syncPOST(withToken({ plan: validPlan }));
    expect(res.status).toBe(401);
    // Deleting the cookie sets it with an empty value / Max-Age=0.
    expect(res.cookies.get("gcal_token")?.value).toBe("");
  });

  it("returns 500 on a non-auth calendar failure", async () => {
    createPlanEvents.mockRejectedValueOnce(new Error("Calendar API 500"));
    const res = await syncPOST(withToken({ plan: validPlan }));
    expect(res.status).toBe(500);
  });
});
