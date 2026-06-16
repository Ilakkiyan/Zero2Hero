// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { asyncChunks, collectNdjson, jsonRequest, throwingStream } from "@/test/helpers";

const chatStream = vi.fn();
vi.mock("@/lib/llm", () => ({ chatStream: (...args: unknown[]) => chatStream(...args) }));

import { POST } from "@/app/api/interview/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/interview", body, headers);

afterEach(() => chatStream.mockReset());

describe("POST /api/interview", () => {
  it("streams token events and a final done event", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["Hello ", "there"]));
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.headers.get("Content-Type")).toContain("x-ndjson");
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).toBe("Hello there");
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({ type: "done", readyToPlan: false });
  });

  it("strips the READY_TO_PLAN marker and flags readyToPlan", async () => {
    chatStream.mockReturnValueOnce(
      asyncChunks(["Good summary.\n", "READY_TO_PLAN", "\nWe understand the idea."]),
    );
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }));
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).not.toContain("READY_TO_PLAN");
    expect(text).toContain("Good summary.");
    expect(events.find((e) => e.type === "done")).toMatchObject({ readyToPlan: true });
  });

  it("strips a marker split across chunk boundaries", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["done READY_TO", "_PLAN tail"]));
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }));
    const events = await collectNdjson(res);
    const text = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).not.toContain("READY_TO_PLAN");
    expect(events.find((e) => e.type === "done")).toMatchObject({ readyToPlan: true });
  });

  it("emits an error event when the model stream throws", async () => {
    chatStream.mockReturnValueOnce(throwingStream(["partial "], "model exploded"));
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "model exploded" });
  });

  it("returns 400 when messages[] is missing", async () => {
    const res = await POST(req({ nope: true }));
    expect(res.status).toBe(400);
  });

  it("forwards the provider header to chatStream", async () => {
    chatStream.mockReturnValueOnce(asyncChunks(["ok"]));
    await POST(req({ messages: [{ role: "user", content: "hi" }] }, { "x-llm-provider": "ollama" }));
    expect(chatStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ provider: "ollama" }),
    );
  });
});
