"use client";

import type { Plan, RiskLevel } from "@/lib/schema";

const riskColor: Record<RiskLevel, string> = {
  high: "text-risk-high",
  med: "text-risk-med",
  low: "text-risk-low",
};

const riskDot: Record<RiskLevel, string> = {
  high: "bg-risk-high",
  med: "bg-risk-med",
  low: "bg-risk-low",
};

export default function PlanPanel({ plan }: { plan: Plan | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <span className="h-2 w-2 rounded-full bg-text/40" />
        <h2 className="text-sm font-medium text-text">Execution plan</h2>
        <span className="ml-auto text-xs text-muted">milestones &amp; risks</span>
      </div>

      {!plan ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            Your living plan appears here — the riskiest assumptions and the milestones that test
            them — once the interview is ready.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Idea brief */}
          <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
            <Field label="Problem" value={plan.brief.problem} />
            <Field label="Target user" value={plan.brief.targetUser} />
            <Field label="Riskiest assumption" value={plan.brief.riskiestAssumption} highlight />
            <Field label="Definition of win" value={plan.brief.definitionOfWin} />
          </section>

          {/* Assumptions */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Riskiest assumptions
            </h3>
            {plan.assumptions.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${riskDot[a.risk]}`} />
                  <div className="space-y-1">
                    <p className="text-sm text-text">{a.claim}</p>
                    <p className="text-xs text-muted">
                      <span className={`font-medium uppercase ${riskColor[a.risk]}`}>
                        {a.risk} risk
                      </span>{" "}
                      · Test: {a.cheapTest}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* Milestones */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Milestones</h3>
            {plan.milestones.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-accent">{m.phase}</span>
                  {m.validates && (
                    <span className="text-[10px] uppercase tracking-wide text-muted">
                      validates {m.validates}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-text">{m.goal}</p>
                <ul className="mt-2 space-y-1">
                  {m.tasks.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted">
                      <span className="text-border">—</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={"text-sm " + (highlight ? "text-accent" : "text-text")}>{value}</p>
    </div>
  );
}
