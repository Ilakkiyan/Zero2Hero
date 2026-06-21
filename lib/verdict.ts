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

/**
 * True if a passed assumption is backed by a real-world (field) test. We accept
 * any field evidence that isn't actively undermining — a smaller local model
 * sometimes labels a genuine win "neutral", so keying strictly on "supports"
 * would deny Build even after the user ran and passed the test. A field test
 * that undermines the claim never counts.
 */
function hasPrimaryProof(plan: Plan): boolean {
  return plan.assumptions.some(
    (a) =>
      a.status === "passed" &&
      (a.evidence ?? []).some((e) => e.kind === "field" && e.stance !== "undermines"),
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

  // "Decided" = every high-risk assumption is resolved (passed) and overall
  // confidence has cleared the bar. The bar is 70 (not higher) so that proving
  // your riskiest assumption with a real field test — which is what actually
  // earns a Build below — is enough on its own, instead of also forcing every
  // medium/low assumption to pass first.
  const decided = s.unresolvedHighRisk === 0 && s.confidence >= 70;

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
      headline: "Almost — log one real-world result",
      reason: `Confidence is ${s.confidence}, but it's resting on reasoning and web reading. A real-world result counts only when you log it as a field test — describing it in chat doesn't.`,
      action: 'Hit "Test it for real" on your riskiest assumption and record what happened — that earns the green light.',
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
