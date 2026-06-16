// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Plan } from "@/lib/schema";
import { nextMove } from "@/lib/nextMove";
import { validPlan } from "@/test/fixtures/plan";

describe("nextMove", () => {
  it("prioritises validating the riskiest open assumption", () => {
    const move = nextMove(validPlan);
    // validPlan's highest-risk open assumption is a1 (high, untested).
    expect(move.title).toContain(validPlan.assumptions[0].claim);
    expect(move.rationale).toMatch(/High-risk and unresolved/);
    // m1 validates a1, so the draftable milestone is the real m1.
    expect(move.milestone.id).toBe("m1");
  });

  it("synthesises a milestone when nothing validates the open assumption", () => {
    const plan: Plan = { ...validPlan, milestones: [] };
    const move = nextMove(plan);
    expect(move.milestone.validates).toBe(validPlan.assumptions[0].id);
    expect(move.milestone.tasks).toContain(validPlan.assumptions[0].cheapTest);
  });

  it("switches to shipping once every assumption is validated", () => {
    const plan: Plan = {
      ...validPlan,
      assumptions: validPlan.assumptions.map((a) => ({ ...a, status: "passed" })),
    };
    const move = nextMove(plan);
    expect(move.title).toMatch(/Ship the next milestone/);
    expect(move.milestone.id).toBe("m1");
  });

  it("targets the first unfinished milestone when shipping", () => {
    const plan: Plan = {
      ...validPlan,
      assumptions: validPlan.assumptions.map((a) => ({ ...a, status: "passed" })),
      milestones: [
        { ...validPlan.milestones[0], status: "done" },
        { ...validPlan.milestones[1], status: "todo" },
      ],
    };
    expect(nextMove(plan).milestone.id).toBe("m2");
  });
});
