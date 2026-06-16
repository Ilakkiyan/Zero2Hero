// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthUrl, createPlanEvents, exchangeCode, TokenExpiredError } from "@/lib/google";
import { validPlan } from "@/test/fixtures/plan";

function configureGoogle() {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost/api/calendar/callback");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildAuthUrl", () => {
  it("builds a consent URL with the client id and calendar scope", () => {
    configureGoogle();
    const url = buildAuthUrl();
    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("calendar.events");
  });

  it("throws when Google env vars are missing", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(() => buildAuthUrl()).toThrow(/not configured/);
  });
});

describe("exchangeCode", () => {
  it("posts the code and returns the access token + expiry", async () => {
    configureGoogle();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok-xyz", expires_in: 1800 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await exchangeCode("auth-code");
    expect(out).toEqual({ accessToken: "tok-xyz", expiresIn: 1800 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
  });

  it("throws when the exchange fails", async () => {
    configureGoogle();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" }));
    await expect(exchangeCode("x")).rejects.toThrow(/Token exchange failed/);
  });
});

describe("createPlanEvents", () => {
  beforeEach(configureGoogle);

  it("creates one event per milestone and returns goal + link", async () => {
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ htmlLink: `https://calendar.google.com/e/${++n}` }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const events = await createPlanEvents("tok", validPlan);
    expect(events).toHaveLength(validPlan.milestones.length);
    expect(events[0]).toMatchObject({ goal: validPlan.milestones[0].goal });
    expect(events[0].link).toContain("calendar.google.com");
    // Each call carries the bearer token and a milestone summary.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.summary).toContain(validPlan.milestones[0].goal);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("throws TokenExpiredError on a 401 from the calendar API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
    await expect(createPlanEvents("tok", validPlan)).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it("throws a generic error on other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 500, ok: false, text: async () => "boom" }),
    );
    await expect(createPlanEvents("tok", validPlan)).rejects.toThrow(/Calendar API 500/);
  });
});
