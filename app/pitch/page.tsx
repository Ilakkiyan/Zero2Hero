"use client";

import { useEffect, useState } from "react";
import {
  PlanSchema,
  PlanEventSchema,
  type AssumptionStatus,
  type Plan,
  type PlanEvent,
  type RiskLevel,
} from "@/lib/schema";
import { summarizeValidation } from "@/lib/validation";
import ConfidenceTimeline from "@/components/ConfidenceTimeline";

/**
 * Print-ready one-pager. Reads the persisted plan from localStorage (same
 * z2h_state key page.tsx writes) and renders a clean editorial layout. Always
 * light (wrapped in data-theme="light") so it looks right on paper / PDF
 * regardless of the app's theme. "Print / Save as PDF" uses the browser's
 * native print → no PDF dependency.
 */

const riskChip: Record<RiskLevel, string> = {
  high: "text-risk-high border-risk-high",
  med: "text-risk-med border-risk-med",
  low: "text-risk-low border-risk-low",
};

const statusLabel: Record<AssumptionStatus, string> = {
  untested: "Untested",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  inconclusive: "Inconclusive",
};

export default function PitchPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [history, setHistory] = useState<PlanEvent[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("z2h_state");
      if (raw) {
        const state = JSON.parse(raw);
        const parsed = PlanSchema.safeParse(state.plan);
        if (parsed.success) setPlan(parsed.data);
        const hist = PlanEventSchema.array().safeParse(state.history);
        if (hist.success) setHistory(hist.data);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  return (
    <div data-theme="light" className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="no-print mb-8 flex items-center gap-3">
          <a href="/" className="text-sm text-muted transition-colors hover:text-text">
            ← Back
          </a>
          <button
            onClick={() => window.print()}
            disabled={!plan}
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Print / Save as PDF
          </button>
        </div>

        {!ready ? null : !plan ? (
          <p className="text-sm text-muted">
            No plan yet.{" "}
            <a href="/" className="text-accent underline">
              Build one first →
            </a>
          </p>
        ) : (
          <PitchSheet plan={plan} history={history} />
        )}
      </div>
    </div>
  );
}

function PitchSheet({ plan, history }: { plan: Plan; history: PlanEvent[] }) {
  const summary = summarizeValidation(plan);
  return (
    <article className="pitch-sheet space-y-8">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Zero2Hero · Execution Plan
              </p>
              <h1 className="text-2xl font-semibold leading-snug text-text">{plan.brief.problem}</h1>
            </header>

            <div className="grid grid-cols-2 gap-4">
              <Meta label="Target user" value={plan.brief.targetUser} />
              <Meta label="Definition of win" value={plan.brief.definitionOfWin} />
            </div>

            <section className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-surface p-4">
              <Meta label="Confidence" value={`${summary.confidence}%`} compact />
              <Meta
                label="Validation progress"
                value={`${summary.testedCount}/${summary.totalCount} assumptions tested`}
                compact
              />
              <Meta
                label="Open high risk"
                value={String(summary.unresolvedHighRisk)}
                compact
              />
              <div className="col-span-3">
                <p className="text-[10px] uppercase tracking-wide text-muted">Next validation action</p>
                <p className="mt-1 text-sm text-text">{summary.nextTest}</p>
              </div>
            </section>

            {history.length > 1 && <ConfidenceTimeline history={history} />}

            <div className="rounded-xl border-2 border-accent bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                Riskiest assumption
              </p>
              <p className="mt-1 text-sm text-text">{plan.brief.riskiestAssumption}</p>
            </div>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Key assumptions
              </h2>
              <ul className="space-y-2">
                {plan.assumptions.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex shrink-0 flex-col gap-1">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold uppercase ${riskChip[a.risk]}`}
                      >
                        {a.risk}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-center text-[10px] font-semibold uppercase text-muted">
                        {statusLabel[a.status]}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-text">{a.claim}</p>
                      <p className="text-xs text-muted">Test: {a.cheapTest}</p>
                      {a.resultNote && (
                        <p className="mt-1 text-xs text-text">Result: {a.resultNote}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Milestones</h2>
              <ol className="space-y-3 border-l border-border pl-5">
                {plan.milestones.map((m) => (
                  <li key={m.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                    <p className="text-xs font-medium text-accent">{m.phase}</p>
                    <p className="text-sm font-medium text-text">{m.goal}</p>
                    <ul className="mt-1 space-y-0.5">
                      {m.tasks.map((t, i) => (
                        <li key={i} className="text-xs text-muted">
                          — {t}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>

            <footer className="border-t border-border pt-4 text-xs text-muted">
              Generated by Zero2Hero · {new Date().toLocaleDateString()}
            </footer>
          </article>
  );
}

function Meta({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "rounded-xl border border-border bg-surface p-4"}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm text-text">{value}</p>
    </div>
  );
}
