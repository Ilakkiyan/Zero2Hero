import type { Milestone, Plan } from "@/lib/schema";
import { summarizeValidation } from "@/lib/validation";

/**
 * A true cofounder doesn't just hand you a plan — it tells you the ONE thing to
 * do right now. This derives that single highest-leverage action from the live
 * confidence picture (no model call), and resolves it to a milestone the
 * existing "Draft this" flow can turn into a ready-to-use artifact.
 *
 * Priority: de-risk before you build. While a high-/any-risk assumption is open,
 * the next move is the cheapest test that could kill it. Once everything is
 * validated, the next move is to ship the next unfinished milestone.
 */
export interface NextMove {
  title: string;
  rationale: string;
  milestone: Milestone;
  /** The single concrete action to take first — the "first real step" you can
   *  start this weekend, pulled from the milestone (Direction B: don't just hand
   *  over a plan, name the first move). */
  firstStep: string;
}

/** The one concrete thing to do first: a milestone's opening task, or its goal. */
function firstStepOf(m: Milestone): string {
  return m.tasks.find((t) => t.trim())?.trim() ?? m.goal;
}

export function nextMove(plan: Plan): NextMove {
  const summary = summarizeValidation(plan);
  const open = summary.highestRiskOpen;

  if (open) {
    const existing = plan.milestones.find((m) => m.validates === open.id);
    const milestone: Milestone =
      existing ?? {
        id: `next-${open.id}`,
        phase: "This week",
        goal: open.cheapTest,
        validates: open.id,
        tasks: [open.cheapTest],
        status: "todo",
      };
    return {
      title: `Validate your riskiest open assumption — “${open.claim}”`,
      rationale: `${cap(open.risk)}-risk and unresolved. Cheapest disproof: ${open.cheapTest}`,
      milestone,
      firstStep: open.cheapTest,
    };
  }

  const next = plan.milestones.find((m) => m.status !== "done");
  if (next) {
    return {
      title: `Ship the next milestone — ${next.goal}`,
      rationale: "Every assumption is validated. Time to execute.",
      milestone: next,
      firstStep: firstStepOf(next),
    };
  }

  // Degenerate: nothing open and nothing left to ship.
  const fallback: Milestone = {
    id: "next-momentum",
    phase: "Now",
    goal: "Define the next milestone",
    validates: null,
    tasks: ["Pick the next outcome that moves the idea forward"],
    status: "todo",
  };
  const milestone = plan.milestones[0] ?? fallback;
  return {
    title: "Plan your next milestone",
    rationale: "Everything so far is done or validated — set the next target.",
    milestone,
    firstStep: firstStepOf(milestone),
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
