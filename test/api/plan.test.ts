// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan, sampleTranscript } from "@/test/fixtures/plan";
import { jsonRequest } from "@/test/helpers";

const chatJSON = vi.fn();
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig() as Record<string, unknown>), chatJSON: (...args: unknown[]) => chatJSON(...args) }));

import { POST } from "@/app/api/plan/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/plan", body, headers);

afterEach(() => chatJSON.mockReset());

describe("POST /api/plan", () => {
  it("returns a schema-validated plan with assumption defaults backfilled", async () => {
    chatJSON.mockResolvedValueOnce({
      brief: validPlan.brief,
      assumptions: [{ id: "a1", claim: "x", risk: "high", cheapTest: "test it" }],
      milestones: [{ id: "m1", phase: "Days 1-2", goal: "g", validates: "a1", tasks: ["t"] }],
    });

    const res = await POST(req({ messages: sampleTranscript }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plan.assumptions[0].status).toBe("untested");
    expect(data.plan.assumptions[0].resultNote).toBe("");
    expect(data.plan.assumptions[0].updatedAt).toBeNull();
    expect(data.plan.milestones[0].status).toBe("todo");
  });

  it("returns 422 when the model JSON does not match the schema", async () => {
    chatJSON.mockResolvedValueOnce({ brief: { problem: "only this" } });
    const res = await POST(req({ messages: sampleTranscript }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/did not match schema/i);
    expect(Array.isArray(data.issues)).toBe(true);
  });

  it("retries once and succeeds when the first plan JSON is invalid", async () => {
    chatJSON
      .mockResolvedValueOnce({ brief: { problem: "incomplete" } }) // invalid first try
      .mockResolvedValueOnce(validPlan); // valid on retry
    const res = await POST(req({ messages: sampleTranscript }));
    expect(res.status).toBe(200);
    expect(chatJSON).toHaveBeenCalledTimes(2);
  });

  it("rejects a request without messages[] with 400", async () => {
    const res = await POST(req({ notMessages: true }));
    expect(res.status).toBe(400);
  });

  it("refuses to plan a clearly harmful idea (422) without calling the model", async () => {
    const res = await POST(
      req({ messages: [{ role: "user", content: "an app to sell ransomware to companies" }] }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/harmful or illegal/i);
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it("forwards the provider header to the LLM layer", async () => {
    chatJSON.mockResolvedValueOnce(validPlan);
    await POST(req({ messages: sampleTranscript }, { "x-llm-provider": "azure" }));
    expect(chatJSON).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ provider: "azure" }),
    );
  });

  it("returns 500 when the LLM layer throws", async () => {
    chatJSON.mockRejectedValueOnce(new Error("provider down"));
    const res = await POST(req({ messages: sampleTranscript }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("provider down");
  });
});
