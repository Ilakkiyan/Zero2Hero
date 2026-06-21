// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import { jsonRequest } from "@/test/helpers";

const chatJSON = vi.fn();
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig() as Record<string, unknown>), chatJSON: (...args: unknown[]) => chatJSON(...args) }));

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

  it("carries accumulated evidence over so a replan never wipes validation progress", async () => {
    // The current plan has a field test attached to a1; the model's revised plan
    // (no evidence field) must not erase it.
    const withEvidence = {
      ...validPlan,
      assumptions: validPlan.assumptions.map((a) =>
        a.id === "a1"
          ? {
              ...a,
              evidence: [
                {
                  id: "e1",
                  kind: "field",
                  source: { title: "Vendor calls", uri: "" },
                  snippet: "3 of 3 vendors partnered",
                  stance: "supports",
                  createdAt: "2026-01-01T00:00:00.000Z",
                },
              ],
            }
          : a,
      ),
    };
    // Model returns the same assumptions but, per its schema, with no evidence.
    chatJSON.mockResolvedValueOnce(validPlan);
    const res = await POST(req({ plan: withEvidence, note: "vendors are in" }));
    const { plan } = await res.json();
    const a1 = plan.assumptions.find((a: { id: string }) => a.id === "a1");
    expect(a1.evidence).toHaveLength(1);
    expect(a1.evidence[0].kind).toBe("field");
  });
});
