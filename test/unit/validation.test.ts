// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Assumption, AssumptionStatus, EvidenceStance, Plan, RiskLevel } from "@/lib/schema";
import { summarizeValidation } from "@/lib/validation";
import { validPlan } from "@/test/fixtures/plan";

function assumption(
  id: string,
  risk: RiskLevel,
  status: AssumptionStatus,
  cheapTest = `test ${id}`,
): Assumption {
  return { id, claim: `claim ${id}`, risk, cheapTest, status, resultNote: "", updatedAt: null };
}

function planWith(assumptions: Assumption[]): Plan {
  return { ...validPlan, assumptions };
}

describe("summarizeValidation", () => {
  it("scores the canonical plan with one open high-risk assumption", () => {
    const s = summarizeValidation(validPlan);
    expect(s.confidence).toBe(62);
    expect(s.unresolvedHighRisk).toBe(1);
    expect(s.testedCount).toBe(1);
    expect(s.totalCount).toBe(3);
    expect(s.nextTest).toBe(validPlan.assumptions[0].cheapTest);
  });

  it("rewards passed assumptions and falls back on nextTest when all pass", () => {
    const s = summarizeValidation(
      planWith([
        assumption("a1", "high", "passed"),
        assumption("a2", "med", "passed"),
        assumption("a3", "low", "passed"),
      ]),
    );
    expect(s.confidence).toBe(86);
    expect(s.unresolvedHighRisk).toBe(0);
    expect(s.highestRiskOpen).toBeNull();
    expect(s.nextTest).toMatch(/strongest validated path/i);
  });

  it("caps confidence at 69 while a high-risk assumption is untested", () => {
    const s = summarizeValidation(
      planWith([
        assumption("h1", "high", "untested"),
        assumption("p1", "low", "passed"),
        assumption("p2", "low", "passed"),
        assumption("p3", "med", "passed"),
      ]),
    );
    expect(s.confidence).toBe(69);
  });

  it("drops confidence when a high-risk assumption fails", () => {
    const s = summarizeValidation(
      planWith([
        assumption("a1", "high", "failed"),
        assumption("a2", "med", "passed"),
        assumption("a3", "low", "untested"),
      ]),
    );
    expect(s.confidence).toBe(38);
    expect(s.unresolvedHighRisk).toBe(1);
  });

  it("picks the highest-risk open assumption as the next test", () => {
    const s = summarizeValidation(
      planWith([
        assumption("low1", "low", "untested"),
        assumption("high1", "high", "untested", "the high-risk test"),
        assumption("med1", "med", "untested"),
      ]),
    );
    expect(s.highestRiskOpen?.id).toBe("high1");
    expect(s.nextTest).toBe("the high-risk test");
  });

  it("clamps confidence to the 5..95 band", () => {
    const floor = summarizeValidation(
      planWith([
        assumption("a1", "high", "failed"),
        assumption("a2", "high", "failed"),
        assumption("a3", "high", "failed"),
      ]),
    );
    expect(floor.confidence).toBe(5);
  });

  it("gives a small boost for a running assumption", () => {
    const running = summarizeValidation(planWith([assumption("a1", "med", "running")]));
    const untested = summarizeValidation(planWith([assumption("a1", "med", "untested")]));
    expect(running.confidence).toBeGreaterThan(untested.confidence);
  });
});

function withEvidence(a: Assumption, stances: EvidenceStance[]): Assumption {
  return {
    ...a,
    evidence: stances.map((stance, i) => ({
      id: `${a.id}-e${i}`,
      source: { title: "S", uri: "https://s" },
      snippet: "",
      stance,
      createdAt: null,
    })),
  };
}

describe("summarizeValidation — evidence influence", () => {
  it("supporting evidence raises confidence vs the same plan without it", () => {
    const base = assumption("a1", "med", "untested");
    const plain = summarizeValidation(planWith([base]));
    const supported = summarizeValidation(planWith([withEvidence(base, ["supports", "supports"])]));
    expect(supported.confidence).toBeGreaterThan(plain.confidence);
  });

  it("undermining evidence lowers confidence", () => {
    const base = assumption("a1", "med", "untested");
    const plain = summarizeValidation(planWith([base]));
    const undermined = summarizeValidation(planWith([withEvidence(base, ["undermines", "undermines"])]));
    expect(undermined.confidence).toBeLessThan(plain.confidence);
  });

  it("bounds total evidence influence so citations can't dominate", () => {
    const many: EvidenceStance[] = Array(20).fill("undermines");
    const a = withEvidence(assumption("a1", "high", "untested"), many);
    const s = summarizeValidation(planWith([a]));
    // Status logic alone (untested high) keeps it well above the 5 floor; the
    // evidence term is capped at -12, so it can't crater the score.
    expect(s.confidence).toBeGreaterThanOrEqual(5);
    expect(s.confidence).toBeLessThan(50);
  });

  it("neutral evidence does not move confidence", () => {
    const base = assumption("a1", "med", "untested");
    const plain = summarizeValidation(planWith([base]));
    const neutral = summarizeValidation(planWith([withEvidence(base, ["neutral", "neutral"])]));
    expect(neutral.confidence).toBe(plain.confidence);
  });
});
