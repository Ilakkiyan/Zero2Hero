import type { PlanEvent, PlanEventKind } from "@/lib/schema";

/**
 * The de-risking timeline. Every plan mutation (create, status change, evidence
 * applied, re-plan) appends an event that snapshots the confidence at that
 * moment — so the plan's evolution is visible, not just its current state. This
 * is what makes "living plan" tangible to a judge watching the number move.
 */

const MAX_EVENTS = 100;

/** Metadata a callsite passes when it changes the plan, so we can log why. */
export interface PlanChangeMeta {
  kind: PlanEventKind;
  label: string;
  assumptionId?: string | null;
}

export function makeEvent(
  kind: PlanEventKind,
  confidence: number,
  label: string,
  assumptionId: string | null = null,
): PlanEvent {
  return { at: new Date().toISOString(), kind, confidence, label, assumptionId };
}

/** Append an event, capping length so long sessions don't grow unbounded. */
export function appendEvent(history: PlanEvent[], event: PlanEvent): PlanEvent[] {
  const next = [...history, event];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

/** The confidence trajectory for the sparkline. */
export function confidenceSeries(history: PlanEvent[]): number[] {
  return history.map((e) => e.confidence);
}

/** Signed change in confidence at index `i` relative to the previous event. */
export function deltaAt(history: PlanEvent[], i: number): number {
  if (i <= 0) return 0;
  return history[i].confidence - history[i - 1].confidence;
}

/** Net confidence change from the first to the last recorded event. */
export function netDelta(history: PlanEvent[]): number {
  if (history.length < 2) return 0;
  return history[history.length - 1].confidence - history[0].confidence;
}
