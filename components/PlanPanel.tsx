"use client";

import { useState } from "react";
import type { Milestone, Plan, RiskLevel } from "@/lib/schema";
import DraftModal from "@/components/DraftModal";

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

interface Props {
  plan: Plan | null;
  onReplan: (note: string) => void;
  replanning: boolean;
}

export default function PlanPanel({ plan, onReplan, replanning }: Props) {
  const [draftFor, setDraftFor] = useState<Milestone | null>(null);
  const [note, setNote] = useState("");

  function submitReplan() {
    const t = note.trim();
    if (!t || replanning) return;
    onReplan(t);
    setNote("");
  }

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
                <button
                  onClick={() => setDraftFor(m)}
                  className="mt-3 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80"
                >
                  Draft this →
                </button>
              </div>
            ))}
          </section>
        </div>
      )}

      {plan && (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitReplan();
              }}
              placeholder="Tried something? e.g. “users wanted X, not Y”…"
              className="flex-1 bg-transparent px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted"
            />
            <button
              onClick={submitReplan}
              disabled={replanning || !note.trim()}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {replanning ? "Updating…" : "Update plan"}
            </button>
          </div>
        </div>
      )}

      {draftFor && plan && (
        <DraftModal brief={plan.brief} milestone={draftFor} onClose={() => setDraftFor(null)} />
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
