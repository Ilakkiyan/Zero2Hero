import { z } from "zod";

/**
 * Field Test — the "past the plan" primitive. A planner stops at telling you
 * what to test; a cofounder helps you actually run the cheapest REAL-WORLD test
 * and turns what happened into primary evidence.
 *
 * Critically, the test method is chosen to fit the idea's nature and scale — it
 * is NOT assumed to be software. For a solo founder doing something small, the
 * right test is often offline: a few real conversations, a flyer, a sign-up
 * sheet, a pre-order/deposit, a manual concierge run. The model picks; this
 * module just types and validates its output.
 */

/** How the founder reaches real people to run the test. */
export const FieldTestChannel = z.enum([
  "in-person",
  "online",
  "phone",
  "message",
  "manual",
]);
export type FieldTestChannel = z.infer<typeof FieldTestChannel>;

/** The tailored kit for running one real-world test of one assumption. */
export const FieldTestDesignSchema = z.object({
  // Short name of the method, e.g. "Door-to-door flyer + sign-up sheet",
  // "10 DMs to target users", "Pre-order deposit", "Concierge for one user".
  method: z.string(),
  channel: FieldTestChannel,
  // Honest scale for a solo founder this week, e.g. "Talk to 8–10 people".
  scale: z.string(),
  // Why this is the cheapest test that yields real evidence for THIS claim.
  why: z.string(),
  // 2–5 concrete steps to run it.
  steps: z.array(z.string()).min(1),
  // The ready-to-use artifact: the actual script / flyer copy / DM / post text.
  artifact: z.string(),
  // The observable result that would prove the assumption.
  proveIf: z.string(),
  // The observable result that would kill it.
  killIf: z.string(),
});
export type FieldTestDesign = z.infer<typeof FieldTestDesignSchema>;

const STATUS = z.enum(["passed", "failed", "inconclusive"]).nullable();

/** The model's read on what the real-world result means for the assumption. */
export const FieldTestResultSchema = z.object({
  stance: z.enum(["supports", "undermines", "neutral"]),
  // One line for the evidence log, e.g. "8 of 10 neighbors wanted it; 2 prepaid".
  summary: z.string(),
  suggestedStatus: STATUS.default(null),
});
export type FieldTestResult = z.infer<typeof FieldTestResultSchema>;

/** Validate raw model JSON into a design, or null if it doesn't fit. */
export function parseFieldTestDesign(raw: unknown): FieldTestDesign | null {
  const r = FieldTestDesignSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Validate raw model JSON into a captured result, or null if it doesn't fit. */
export function parseFieldTestResult(raw: unknown): FieldTestResult | null {
  const r = FieldTestResultSchema.safeParse(raw);
  return r.success ? r.data : null;
}
