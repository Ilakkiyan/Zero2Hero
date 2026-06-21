// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import { asyncChunks, collectNdjson, jsonRequest, throwingStream } from "@/test/helpers";

const chatStream = vi.fn();
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig() as Record<string, unknown>), chatStream: (...args: unknown[]) => chatStream(...args) }));

import { POST } from "@/app/api/draft/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/draft", body, headers);

const goodBody = { brief: validPlan.brief, milestone: validPlan.milestones[0] };

afterEach(() => chatStream.mockReset());

describe("POST /api/draft", () => {
  it("streams the artifact token events then done", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["**Interview script**\n", "1. ..."]));
    const res = await POST(req(goodBody));
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).toContain("Interview script");
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("returns 400 when brief or milestone is missing/invalid", async () => {
    const res = await POST(req({ brief: { problem: "x" } }));
    expect(res.status).toBe(400);
    expect(chatStream).not.toHaveBeenCalled();
  });

  it("emits an error event on a mid-stream model failure", async () => {
    chatStream.mockReturnValueOnce(throwingStream(["start"], "draft failed"));
    const res = await POST(req(goodBody));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "draft failed" });
  });
});
