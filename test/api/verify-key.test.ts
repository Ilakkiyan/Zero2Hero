// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "@/test/helpers";

import { POST } from "@/app/api/verify-key/route";

const req = (headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/verify-key", {}, headers);

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/verify-key", () => {
  it("returns 400 when no key header is provided", async () => {
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).valid).toBe(false);
  });

  it("reports valid:true when Google accepts the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req({ "x-gemini-key": "good-key" }));
    expect((await res.json()).valid).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("key=good-key");
  });

  it("reports valid:false with the status when Google rejects the key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const res = await POST(req({ "x-gemini-key": "bad-key" }));
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toContain("403");
  });

  it("reports valid:false when Google is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const res = await POST(req({ "x-gemini-key": "any" }));
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toMatch(/reach Google/i);
  });
});
