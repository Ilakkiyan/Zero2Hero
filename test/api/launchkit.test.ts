// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import { asyncChunks, collectNdjson, jsonRequest, throwingStream } from "@/test/helpers";

const chatStream = vi.fn();
vi.mock("@/lib/llm", () => ({ chatStream: (...args: unknown[]) => chatStream(...args) }));

import { POST } from "@/app/api/launchkit/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/launchkit", body, headers);

afterEach(() => chatStream.mockReset());

describe("POST /api/launchkit", () => {
  it("streams the launch-kit token events then done", async () => {
    chatStream.mockReturnValueOnce(
      asyncChunks(["**Where your users are:** r/startups\n", "First-customer outreach: ..."]),
    );
    const res = await POST(req({ plan: validPlan }));
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).toContain("Where your users are");
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("returns 400 when the plan is invalid", async () => {
    const res = await POST(req({ plan: { nope: true } }));
    expect(res.status).toBe(400);
    expect(chatStream).not.toHaveBeenCalled();
  });

  it("emits an error event on a mid-stream model failure", async () => {
    chatStream.mockReturnValueOnce(throwingStream([], "launch failed"));
    const res = await POST(req({ plan: validPlan }));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "launch failed" });
  });

  it("forwards the provider header to the LLM layer", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["ok"]));
    await POST(req({ plan: validPlan }, { "x-llm-provider": "azure" }));
    expect(chatStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ provider: "azure" }),
    );
  });
});
