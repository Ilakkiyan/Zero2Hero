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
    TokenExpiredError: actual.TokenExpiredError,
    buildAuthUrl: (...a: unknown[]) => buildAuthUrl(...a),
    exchangeCode: (...a: unknown[]) => exchangeCode(...a),
    createPlanEvents: (...a: unknown[]) => createPlanEvents(...a),
  };
});

import { TokenExpiredError } from "@/lib/google";
import { GET as authGET } from "@/app/api/calendar/auth/route";
import { GET as callbackGET } from "@/app/api/calendar/callback/route";
import { POST as syncPOST } from "@/app/api/calendar/sync/route";

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
