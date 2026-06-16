// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import { jsonRequest } from "@/test/helpers";

const chatJSON = vi.fn();
vi.mock("@/lib/llm", () => ({ chatJSON: (...args: unknown[]) => chatJSON(...args) }));

import { POST } from "@/app/api/replan/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/replan", body, headers);

afterEach(() => chatJSON.mockReset());

describe("POST /api/replan", () => {
  it("returns the full revised plan", async () => {
    const revised = { ...validPlan, brief: { ...validPlan.brief, riskiestAssumption: "new risk" } };
    chatJSON.mockResolvedValueOnce(revised);
    const res = await POST(req({ plan: validPlan, note: "users wanted X, not Y" }));
    expect(res.status).toBe(200);
    expect((await res.json()).plan.brief.riskiestAssumption).toBe("new risk");
  });

  it("rejects an invalid current plan with 400", async () => {
    const res = await POST(req({ plan: { nope: true }, note: "tried it" }));
    expect(res.status).toBe(400);
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it("rejects a missing/blank note with 400", async () => {
    const res = await POST(req({ plan: validPlan, note: "   " }));
    expect(res.status).toBe(400);
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it("returns 422 when the revised plan does not match the schema", async () => {
    chatJSON.mockResolvedValueOnce({ brief: { problem: "incomplete" } });
    const res = await POST(req({ plan: validPlan, note: "tried it" }));
    expect(res.status).toBe(422);
  });

  it("passes the user's note into the replan prompt", async () => {
    chatJSON.mockResolvedValueOnce(validPlan);
    await POST(req({ plan: validPlan, note: "the cold emails bounced" }));
    const messages = chatJSON.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages.some((m) => m.content.includes("the cold emails bounced"))).toBe(true);
  });
});
