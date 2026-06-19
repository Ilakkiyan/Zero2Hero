// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import { jsonRequest } from "@/test/helpers";

const chatJSON = vi.fn();
vi.mock("@/lib/llm", () => ({ chatJSON: (...args: unknown[]) => chatJSON(...args) }));

import { POST } from "@/app/api/fieldtest/route";

const brief = validPlan.brief;
const assumption = validPlan.assumptions[0];
const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/fieldtest", body, headers);

const validDesign = {
  method: "Door-to-door flyer + sign-up sheet",
  channel: "in-person",
  scale: "Knock on 10 doors this weekend",
  why: "Cheapest way to see if real neighbors want it before building anything.",
  steps: ["Print 10 flyers", "Knock on 10 doors", "Log who signs up"],
  artifact: "Hi — I'm testing a local dog-walking service. Interested? Sign here.",
  proveIf: "3+ of 10 sign up or prepay.",
  killIf: "0 of 10 are interested.",
};

afterEach(() => chatJSON.mockReset());

describe("POST /api/fieldtest", () => {
  it("design: returns a tailored real-world test kit", async () => {
    chatJSON.mockResolvedValueOnce(validDesign);
    const res = await POST(req({ mode: "design", brief, assumption }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.design.method).toMatch(/flyer/i);
    expect(data.design.channel).toBe("in-person");
  });

  it("design: 422 when the model output is not a valid kit", async () => {
    chatJSON.mockResolvedValueOnce({ method: "x" });
    const res = await POST(req({ mode: "design", brief, assumption }));
    expect(res.status).toBe(422);
  });

  it("capture: turns a real result into stance + suggested status", async () => {
    chatJSON.mockResolvedValueOnce({
      stance: "supports",
      summary: "6 of 10 interested, 2 prepaid $20.",
      suggestedStatus: "passed",
    });
    const res = await POST(
      req({ mode: "capture", brief, assumption, method: "Flyer", result: "6 of 10, 2 prepaid" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.stance).toBe("supports");
    expect(data.result.suggestedStatus).toBe("passed");
  });

  it("capture: 400 when no result text is provided", async () => {
    const res = await POST(req({ mode: "capture", brief, assumption, result: "  " }));
    expect(res.status).toBe(400);
  });

  it("400 on a missing/invalid mode", async () => {
    const res = await POST(req({ brief, assumption }));
    expect(res.status).toBe(400);
  });

  it("400 when brief or assumption is missing", async () => {
    const res = await POST(req({ mode: "design", brief }));
    expect(res.status).toBe(400);
  });

  it("forwards the provider header to the LLM layer", async () => {
    chatJSON.mockResolvedValueOnce(validDesign);
    await POST(req({ mode: "design", brief, assumption }, { "x-llm-provider": "azure" }));
    expect(chatJSON).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ provider: "azure" }),
    );
  });
});
