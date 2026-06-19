// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import { asyncChunks, collectNdjson, jsonRequest, throwingStream } from "@/test/helpers";

const chatStream = vi.fn();
vi.mock("@/lib/llm", () => ({ chatStream: (...args: unknown[]) => chatStream(...args) }));

import { POST } from "@/app/api/firstversion/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/firstversion", body, headers);

afterEach(() => chatStream.mockReset());

describe("POST /api/firstversion", () => {
  it("streams the first-version token events then done", async () => {
    chatStream.mockReturnValueOnce(
      asyncChunks(["**First version:** concierge offer\n", "Deliver it by hand for user #1."]),
    );
    const res = await POST(req({ plan: validPlan }));
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).toContain("First version");
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("returns 400 when the plan is invalid", async () => {
    const res = await POST(req({ plan: { nope: true } }));
    expect(res.status).toBe(400);
    expect(chatStream).not.toHaveBeenCalled();
  });

  it("emits an error event on a mid-stream model failure", async () => {
    chatStream.mockReturnValueOnce(throwingStream([], "build failed"));
    const res = await POST(req({ plan: validPlan }));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "build failed" });
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
