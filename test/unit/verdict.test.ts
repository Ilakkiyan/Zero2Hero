import { describe, expect, it } from "vitest";
import { verdict } from "@/lib/verdict";
import { validPlan } from "@/test/fixtures/plan";
import type { Assumption, Evidence, Plan } from "@/lib/schema";

const fieldSupport: Evidence = {
  id: "e1",
  kind: "field",
  source: { title: "Field test — flyer", uri: "" },
  snippet: "6 of 10 prepaid",
  stance: "supports",
  createdAt: null,
};

function planWith(assumptions: Partial<Assumption>[]): Plan {
  return {
    ...validPlan,
    assumptions: assumptions.map((a, i) => ({
      id: a.id ?? `a${i}`,
      claim: a.claim ?? "claim",
      risk: a.risk ?? "high",
      cheapTest: a.cheapTest ?? "test it",
      status: a.status ?? "untested",
      resultNote: "",
      updatedAt: null,
      evidence: a.evidence ?? [],
    })),
  };
}

describe("verdict", () => {
  it("kills when a high-risk assumption failed", () => {
    const v = verdict(planWith([{ risk: "high", status: "failed", claim: "people will pay" }]));
    expect(v.call).toBe("kill");
    expect(v.reason).toMatch(/people will pay/);
  });

  it("builds when high-risk assumptions passed WITH real-world proof", () => {
    const v = verdict(
      planWith([
        { risk: "high", status: "passed", evidence: [fieldSupport] },
        { risk: "low", status: "passed" },
      ]),
    );
    expect(v.call).toBe("build");
  });

  it("builds when the lone high-risk assumption is proven with a field test", () => {
    // Proving the riskiest assumption with real-world evidence should earn Build
    // on its own — without also having to pass every other assumption first.
    const v = verdict(planWith([{ risk: "high", status: "passed", evidence: [fieldSupport] }]));
    expect(v.call).toBe("build");
  });

  it("counts a passed assumption with a neutral-labelled field test as proof", () => {
    // A weaker model sometimes labels a genuine win "neutral"; a passed assumption
    // backed by a real field test still earns Build (only "undermines" wouldn't).
    // Second pass clears the confidence bar so this isolates the proof gate.
    const fieldNeutral: Evidence = { ...fieldSupport, stance: "neutral" };
    const v = verdict(
      planWith([
        { risk: "high", status: "passed", evidence: [fieldNeutral] },
        { risk: "med", status: "passed" },
      ]),
    );
    expect(v.call).toBe("build");
  });

  it("does NOT count an undermining field test as proof, even when confident", () => {
    const fieldUndermines: Evidence = { ...fieldSupport, stance: "undermines" };
    const v = verdict(
      planWith([
        { risk: "high", status: "passed", evidence: [fieldUndermines] },
        { risk: "med", status: "passed" },
      ]),
    );
    expect(v.call).toBe("keep-testing");
  });

  it("withholds the green light when confident but lacking primary proof", () => {
    // Two high-risk passed (confidence clears 75) but on status only — no field
    // evidence — so the verdict must NOT call "build".
    const v = verdict(
      planWith([
        { risk: "high", status: "passed" },
        { risk: "high", status: "passed" },
      ]),
    );
    expect(v.call).toBe("keep-testing");
    expect(v.reason).toMatch(/reasoning|web/i);
  });

  it("keeps testing and names the riskiest open assumption otherwise", () => {
    const v = verdict(
      planWith([{ risk: "high", status: "untested", claim: "strangers will sign up", cheapTest: "ask 10" }]),
    );
    expect(v.call).toBe("keep-testing");
    expect(v.reason).toMatch(/strangers will sign up/);
    expect(v.action).toMatch(/ask 10/);
  });
});
