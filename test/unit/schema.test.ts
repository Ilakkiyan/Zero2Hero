// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PlanSchema, AssumptionSchema, EvidenceSchema, PlanEventSchema } from "@/lib/schema";
import { legacyPlan, validPlan } from "@/test/fixtures/plan";

describe("PlanSchema", () => {
  it("accepts a fully-formed plan unchanged", () => {
    const parsed = PlanSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.assumptions[1].status).toBe("passed");
  });

  it("backfills assumption status + evidence defaults on a legacy plan", () => {
    const parsed = PlanSchema.safeParse(legacyPlan);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const a = parsed.data.assumptions[0];
    expect(a.status).toBe("untested");
    expect(a.resultNote).toBe("");
    expect(a.updatedAt).toBeNull();
    expect(a.evidence).toEqual([]);
  });

  it("defaults a legacy milestone status to todo", () => {
    const parsed = PlanSchema.safeParse(legacyPlan);
    expect(parsed.success && parsed.data.milestones[0].status).toBe("todo");
  });

  it("rejects an unknown assumption status", () => {
    const bad = AssumptionSchema.safeParse({
      id: "a1",
      claim: "c",
      risk: "high",
      cheapTest: "t",
      status: "maybe",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an invalid risk level", () => {
    const bad = AssumptionSchema.safeParse({ id: "a1", claim: "c", risk: "critical", cheapTest: "t" });
    expect(bad.success).toBe(false);
  });

  it("rejects a plan missing required brief fields", () => {
    const bad = PlanSchema.safeParse({ brief: { problem: "x" }, assumptions: [], milestones: [] });
    expect(bad.success).toBe(false);
  });
});

describe("EvidenceSchema", () => {
  it("defaults stance to neutral and createdAt to null", () => {
    const parsed = EvidenceSchema.safeParse({
      id: "e1",
      source: { title: "T", uri: "https://x" },
      snippet: "s",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.stance).toBe("neutral");
      expect(parsed.data.createdAt).toBeNull();
    }
  });

  it("rejects an unknown stance", () => {
    const bad = EvidenceSchema.safeParse({
      id: "e1",
      source: { title: "T", uri: "https://x" },
      snippet: "s",
      stance: "maybe",
    });
    expect(bad.success).toBe(false);
  });

  it("parses through AssumptionSchema's evidence array", () => {
    const parsed = AssumptionSchema.safeParse({
      id: "a1",
      claim: "c",
      risk: "high",
      cheapTest: "t",
      evidence: [{ id: "e1", source: { title: "T", uri: "https://x" }, snippet: "s", stance: "undermines" }],
    });
    expect(parsed.success && parsed.data.evidence[0].stance).toBe("undermines");
  });
});

describe("PlanEventSchema", () => {
  it("accepts a well-formed event and defaults assumptionId", () => {
    const parsed = PlanEventSchema.safeParse({
      at: "2026-01-01T00:00:00.000Z",
      kind: "created",
      confidence: 50,
      label: "Plan generated",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.assumptionId).toBeNull();
  });

  it("rejects an unknown event kind", () => {
    const bad = PlanEventSchema.safeParse({ at: "x", kind: "exploded", confidence: 1, label: "l" });
    expect(bad.success).toBe(false);
  });
});
