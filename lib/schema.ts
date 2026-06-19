import { z } from "zod";

/**
 * The plan data model. The model emits JSON matching `PlanSchema`; the right-
 * hand panel renders directly off it. Keeping this typed (and zod-validated at
 * the API boundary) is what makes Zero2Hero an AI *system*, not a chat wrapper.
 */

export const RiskLevel = z.enum(["high", "med", "low"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const AssumptionStatus = z.enum([
  "untested",
  "running",
  "passed",
  "failed",
  "inconclusive",
]);
export type AssumptionStatus = z.infer<typeof AssumptionStatus>;

/**
 * A piece of cited web evidence the research agent attached to an assumption.
 * `stance` is how the finding bears on the claim — this is what lets evidence
 * move confidence and re-shape the plan, instead of sitting in a throwaway modal.
 */
export const EvidenceStance = z.enum(["supports", "undermines", "neutral"]);
export type EvidenceStance = z.infer<typeof EvidenceStance>;

/**
 * Where a piece of evidence came from. "web" is a cited online source (the
 * research agent); "field" is PRIMARY evidence — the result of a real-world test
 * the founder actually ran (talked to 10 people, 3 prepaid, etc.). Field
 * evidence usually has no URL, so `source.uri` may be empty.
 */
export const EvidenceKind = z.enum(["web", "field"]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const EvidenceSchema = z.object({
  id: z.string(),
  kind: EvidenceKind.default("web"),
  source: z.object({ title: z.string(), uri: z.string().default("") }),
  snippet: z.string(),
  stance: EvidenceStance.default("neutral"),
  createdAt: z.string().nullable().default(null),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const AssumptionSchema = z.object({
  id: z.string(),
  claim: z.string(),
  risk: RiskLevel,
  // The cheap experiment that would prove/kill this assumption.
  cheapTest: z.string(),
  status: AssumptionStatus.default("untested"),
  resultNote: z.string().default(""),
  updatedAt: z.string().nullable().default(null),
  // Cited evidence the research agent linked to this claim (default empty so
  // older plans and fresh model output both parse).
  evidence: z.array(EvidenceSchema).default([]),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const MilestoneSchema = z.object({
  id: z.string(),
  phase: z.string(), // e.g. "Days 1–7", "Phase 1"
  goal: z.string(),
  // id of the assumption this milestone is designed to validate (or null).
  validates: z.string().nullable(),
  tasks: z.array(z.string()),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const IdeaBriefSchema = z.object({
  problem: z.string(),
  targetUser: z.string(),
  riskiestAssumption: z.string(),
  definitionOfWin: z.string(),
});
export type IdeaBrief = z.infer<typeof IdeaBriefSchema>;

export const PlanSchema = z.object({
  brief: IdeaBriefSchema,
  assumptions: z.array(AssumptionSchema),
  milestones: z.array(MilestoneSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * One entry in the de-risking timeline. Stored in app state (z2h_state), NOT on
 * the Plan itself — the plan is sent to the model on every re-plan and we don't
 * want history bloating that payload or getting rewritten. Each event snapshots
 * the confidence at that moment so the trajectory can be drawn directly.
 */
export const PlanEventKind = z.enum(["created", "status", "evidence", "replan"]);
export type PlanEventKind = z.infer<typeof PlanEventKind>;

export const PlanEventSchema = z.object({
  at: z.string(),
  kind: PlanEventKind,
  confidence: z.number(),
  label: z.string(),
  assumptionId: z.string().nullable().default(null),
});
export type PlanEvent = z.infer<typeof PlanEventSchema>;
