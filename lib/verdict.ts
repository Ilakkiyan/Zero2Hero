import type { Plan } from "@/lib/schema";
import { summarizeValidation } from "@/lib/validation";

/**
 * The Verdict — the go/no-go the founder actually came for. A planner tracks a
 * confidence number; a cofounder makes the call. Derived deterministically from
 * the live validation picture (no model call), like nextMove.
 *
 * The honest part: "Build" is gated on PRIMARY evidence — a high-risk assumption
 * that "passed" only on reasoning or web reading isn't proof. Real-world (field)
 * evidence is what earns the green light, so the verdict can't be talked into a
 * yes the way a cheerleader could.
 */
export type VerdictCall = "build" | "kill" | "keep-testing";

export interface Verdict {
  call: VerdictCall;
  headline: string;
  reason: string;
  /** The single concrete next thing this verdict implies. */
  action: string;
}

/** True if a passed assumption is backed by supporting real-world evidence. */
function hasPrimaryProof(plan: Plan): boolean {
  return plan.assumptions.some(
    (a) =>
      a.status === "passed" &&
      (a.evidence ?? []).some((e) => e.kind === "field" && e.stance === "supports"),
  );
}

export function verdict(plan: Plan): Verdict {
  const s = summarizeValidation(plan);

  // 1. A failed high-risk assumption is a kill/pivot signal, full stop.
  const failedHigh = plan.assumptions.find((a) => a.risk === "high" && a.status === "failed");
  if (failedHigh) {
    return {
      call: "kill",
      headline: "Don't build this as-is",
      reason: `A core assumption failed: “${failedHigh.claim}”. The idea depends on it, and the evidence says it doesn't hold.`,
      action: "Pivot around what you learned, or drop it — re-plan from the failure.",
    };
  }

  const decided = s.unresolvedHighRisk === 0 && s.confidence >= 75;

  // 2. Decided AND backed by real-world proof → green light.
  if (decided && hasPrimaryProof(plan)) {
    return {
      call: "build",
      headline: "Build it",
      reason: `The riskiest assumptions held up against real-world evidence (confidence ${s.confidence}). You've earned the right to build.`,
      action: "Generate your first version and put it in front of users.",
    };
  }

  // 3. Confident on paper, but no primary proof yet → don't call it yet.
  if (decided) {
    return {
      call: "keep-testing",
      headline: "Almost — get one piece of real proof",
      reason: `Confidence is ${s.confidence}, but it's resting on reasoning and web reading, not real-world results.`,
      action: "Run one field test on your riskiest assumption to earn the green light.",
    };
  }

  // 4. Still open → name the single thing standing between here and a decision.
  const open = s.highestRiskOpen;
  return {
    call: "keep-testing",
    headline: "Not yet — one thing stands in the way",
    reason: open
      ? `Your riskiest open assumption is still unproven: “${open.claim}”.`
      : `Confidence is ${s.confidence} — keep de-risking before you commit.`,
    action: open ? `Test it: ${open.cheapTest}` : s.nextTest,
  };
}
