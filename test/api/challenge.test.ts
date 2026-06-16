// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { asyncChunks, collectNdjson, jsonRequest, throwingStream } from "@/test/helpers";

const chatStream = vi.fn();
vi.mock("@/lib/llm", () => ({ chatStream: (...args: unknown[]) => chatStream(...args) }));

import { POST } from "@/app/api/challenge/route";

const target = { claim: "Users will pay", risk: "high", cheapTest: "Run 5 paid pilots" };
const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/challenge", body, headers);

afterEach(() => chatStream.mockReset());

describe("POST /api/challenge", () => {
  it("streams the adversary's argument as token events", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["That's likely wrong because ", "incumbents bundle it."]));
    const res = await POST(req({ assumption: target, messages: [] }));
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).toContain("incumbents bundle it.");
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("anchors the system + opening-challenge messages before the conversation", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["ok"]));
    await POST(req({ assumption: target, messages: [{ role: "assistant", content: "prev" }] }));
    const sent = chatStream.mock.calls[0][0] as { role: string; content: string }[];
    expect(sent[0].role).toBe("system");
    expect(sent[1].content).toContain(target.claim); // opening challenge anchors the assumption
    expect(sent.at(-1)).toMatchObject({ role: "assistant", content: "prev" });
  });

  it("returns 400 when no assumption is provided", async () => {
    const res = await POST(req({ messages: [] }));
    expect(res.status).toBe(400);
    expect(chatStream).not.toHaveBeenCalled();
  });

  it("emits an error event on a mid-stream model failure", async () => {
    chatStream.mockReturnValueOnce(throwingStream([], "model offline"));
    const res = await POST(req({ assumption: target, messages: [] }));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "model offline" });
  });

  it("forwards the provider header", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["x"]));
    await POST(req({ assumption: target, messages: [] }, { "x-llm-provider": "azure" }));
    expect(chatStream).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ provider: "azure" }));
  });
});
