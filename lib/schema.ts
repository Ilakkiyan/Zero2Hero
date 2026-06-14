import { z } from "zod";

/**
 * The plan data model. The model emits JSON matching `PlanSchema`; the right-
 * hand panel renders directly off it. Keeping this typed (and zod-validated at
 * the API boundary) is what makes Zero2Hero an AI *system*, not a chat wrapper.
 */

export const RiskLevel = z.enum(["high", "med", "low"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const AssumptionSchema = z.object({
  id: z.string(),
  claim: z.string(),
  risk: RiskLevel,
  // The cheap experiment that would prove/kill this assumption.
  cheapTest: z.string(),
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
