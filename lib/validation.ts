import type { Assumption, Plan, RiskLevel } from "@/lib/schema";

const riskWeight: Record<RiskLevel, number> = {
  high: 3,
  med: 2,
  low: 1,
};

export interface ValidationSummary {
  confidence: number;
  unresolvedHighRisk: number;
  highestRiskOpen: Assumption | null;
  nextTest: string;
  testedCount: number;
  totalCount: number;
}

export function summarizeValidation(plan: Plan): ValidationSummary {
  const assumptions = plan.assumptions;
  let score = 50;

  for (const a of assumptions) {
    const weight = riskWeight[a.risk];
    if (a.status === "passed") score += weight * 6;
    else if (a.status === "failed") score -= weight * 8;
    // Inconclusive = "no clear answer yet", not a failure. A modest dip, so a
    // real-world near-miss that still showed interest doesn't tank confidence
    // (the evidence term below still differentiates supports vs. undermines).
    else if (a.status === "inconclusive") score -= weight * 2;
    else if (a.status === "running") score += weight * 1;
  }

  // Cited evidence nudges confidence on its own (before any status change):
  // supporting findings raise it, undermining findings lower it, weighted by
  // the assumption's risk and bounded so a pile of citations can't dominate.
  let evidenceScore = 0;
  for (const a of assumptions) {
    const net = (a.evidence ?? []).reduce(
      (sum, e) => sum + (e.stance === "supports" ? 1 : e.stance === "undermines" ? -1 : 0),
      0,
    );
    evidenceScore += clamp(net, -2, 2) * riskWeight[a.risk];
  }
  score += clamp(evidenceScore, -12, 12);

  const untestedHigh = assumptions.some((a) => a.risk === "high" && a.status === "untested");
  const unresolvedHighRisk = assumptions.filter(
    (a) => a.risk === "high" && a.status !== "passed",
  ).length;

  if (untestedHigh) score = Math.min(score, 69);
  if (unresolvedHighRisk > 0) score = Math.min(score, 82);

  const open = assumptions.filter((a) => a.status !== "passed");
  const highestRiskOpen =
    open.sort((a, b) => riskWeight[b.risk] - riskWeight[a.risk])[0] ?? null;

  return {
    confidence: clamp(Math.round(score), 5, 95),
    unresolvedHighRisk,
    highestRiskOpen,
    nextTest: highestRiskOpen?.cheapTest ?? "Turn the strongest validated path into the next milestone.",
    testedCount: assumptions.filter((a) => a.status !== "untested").length,
    totalCount: assumptions.length,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
