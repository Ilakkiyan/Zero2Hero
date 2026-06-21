// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import { asyncChunks, collectNdjson, jsonRequest, throwingStream } from "@/test/helpers";

const chatStream = vi.fn();
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig() as Record<string, unknown>), chatStream: (...args: unknown[]) => chatStream(...args) }));

import { POST } from "@/app/api/premortem/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/premortem", body, headers);

afterEach(() => chatStream.mockReset());

describe("POST /api/premortem", () => {
  it("streams the pre-mortem token events then done", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["**No demand**\n", "Early sign: ..."]));
    const res = await POST(req({ plan: validPlan }));
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).toContain("No demand");
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("returns 400 when the plan is invalid", async () => {
    const res = await POST(req({ plan: { nope: true } }));
    expect(res.status).toBe(400);
    expect(chatStream).not.toHaveBeenCalled();
  });

  it("emits an error event on a mid-stream model failure", async () => {
    chatStream.mockReturnValueOnce(throwingStream([], "premortem failed"));
    const res = await POST(req({ plan: validPlan }));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "premortem failed" });
  });
});
