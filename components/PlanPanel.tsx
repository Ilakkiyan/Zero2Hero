"use client";

import { useEffect, useState } from "react";
import type {
  Assumption,
  AssumptionStatus,
  Evidence,
  EvidenceStance,
  Milestone,
  Plan,
  PlanEvent,
  RiskLevel,
} from "@/lib/schema";
import StreamModal from "@/components/StreamModal";
import ResearchModal from "@/components/ResearchModal";
import ChallengeModal from "@/components/ChallengeModal";
import FieldTestModal, { type FieldEvidence } from "@/components/FieldTestModal";
import CalendarSetupModal from "@/components/CalendarSetupModal";
import ConfidenceTimeline from "@/components/ConfidenceTimeline";
import { summarizeValidation } from "@/lib/validation";
import { nextMove } from "@/lib/nextMove";
import { verdict, type VerdictCall } from "@/lib/verdict";
import type { PlanChangeMeta } from "@/lib/history";
import type { EvidenceLink, SuggestedStatus } from "@/lib/research";

const stanceChip: Record<EvidenceStance, string> = {
  supports: "border-risk-low text-risk-low",
  undermines: "border-risk-high text-risk-high",
  neutral: "border-border text-muted",
};

/** When several findings suggest a status, the most de-risking one wins. */
function pickStatus(list: SuggestedStatus[]): Exclude<SuggestedStatus, null> | null {
  if (list.includes("failed")) return "failed";
  if (list.includes("inconclusive")) return "inconclusive";
  if (list.includes("passed")) return "passed";
  return null;
}

const verdictStyle: Record<VerdictCall, { box: string; label: string; tag: string }> = {
  build: { box: "border-risk-low/50 bg-risk-low/[0.08]", label: "text-risk-low", tag: "✅ Verdict" },
  kill: { box: "border-risk-high/50 bg-risk-high/[0.08]", label: "text-risk-high", tag: "🛑 Verdict" },
  "keep-testing": { box: "border-accent/40 bg-accent/[0.06]", label: "text-accent", tag: "🧭 Verdict" },
};

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
  history: PlanEvent[];
  onPlanChange: (plan: Plan, meta?: PlanChangeMeta) => void;
  onReplan: (note: string) => void;
  replanning: boolean;
}

const statusLabels: Record<AssumptionStatus, string> = {
  untested: "Untested",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  inconclusive: "Inconclusive",
};

const statusTone: Record<AssumptionStatus, string> = {
  untested: "border-border text-muted",
  running: "border-accent text-accent",
  passed: "border-risk-low text-risk-low",
  failed: "border-risk-high text-risk-high",
  inconclusive: "border-risk-med text-risk-med",
};

export default function PlanPanel({ plan, history, onPlanChange, onReplan, replanning }: Props) {
  const [draftFor, setDraftFor] = useState<Milestone | null>(null);
  const [showPremortem, setShowPremortem] = useState(false);
  const [showFirstVersion, setShowFirstVersion] = useState(false);
  const [showLaunchKit, setShowLaunchKit] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [fieldTestFor, setFieldTestFor] = useState<Assumption | null>(null);
  const [showCalSetup, setShowCalSetup] = useState(false);
  const [note, setNote] = useState("");

  function submitReplan() {
    const t = note.trim();
    if (!t || replanning) return;
    onReplan(t);
    setNote("");
  }

  function updateAssumption(id: string, patch: Partial<Assumption>, meta?: PlanChangeMeta) {
    if (!plan) return;
    onPlanChange(
      {
        ...plan,
        assumptions: plan.assumptions.map((a) =>
          a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a,
        ),
      },
      meta,
    );
  }

  /**
   * Evidence Engine sink: attach research-linked citations to the matching
   * assumptions, apply any suggested status change, and log one timeline event.
   * This is the moment research stops being a brief and starts de-risking the plan.
   */
  function applyEvidence(links: EvidenceLink[]) {
    if (!plan || !links.length) return;
    const byId = new Map<string, EvidenceLink[]>();
    for (const l of links) byId.set(l.assumptionId, [...(byId.get(l.assumptionId) ?? []), l]);

    const now = new Date().toISOString();
    const assumptions = plan.assumptions.map((a) => {
      const ls = byId.get(a.id);
      if (!ls) return a;
      const existing = a.evidence ?? [];
      const newEvidence: Evidence[] = ls.map((l, i) => ({
        id: `${a.id}-ev-${existing.length + i + 1}`,
        kind: "web",
        source: l.source,
        snippet: l.snippet,
        stance: l.stance,
        createdAt: now,
      }));
      const suggested = pickStatus(ls.map((l) => l.suggestedStatus));
      return {
        ...a,
        evidence: [...existing, ...newEvidence],
        ...(suggested ? { status: suggested, updatedAt: now } : {}),
      };
    });

    const n = links.length;
    onPlanChange(
      { ...plan, assumptions },
      { kind: "evidence", label: `${n} citation${n === 1 ? "" : "s"} linked from research` },
    );
  }

  /**
   * Field Test sink: a real-world test result becomes PRIMARY evidence on the
   * assumption (no URL — it's something the founder actually did), applies any
   * suggested status, and logs one timeline event. Same shape as the research
   * sink, so confidence moves the same way — just from real data, not the web.
   */
  function applyFieldEvidence(assumptionId: string, ev: FieldEvidence) {
    if (!plan) return;
    const now = new Date().toISOString();
    const assumptions = plan.assumptions.map((a) => {
      if (a.id !== assumptionId) return a;
      const existing = a.evidence ?? [];
      const evidence: Evidence[] = [
        ...existing,
        {
          id: `${a.id}-ft-${existing.length + 1}`,
          kind: "field",
          source: { title: `Field test — ${ev.method}`, uri: "" },
          snippet: ev.summary,
          stance: ev.stance,
          createdAt: now,
        },
      ];
      return {
        ...a,
        evidence,
        ...(ev.suggestedStatus ? { status: ev.suggestedStatus, updatedAt: now } : {}),
      };
    });
    onPlanChange(
      { ...plan, assumptions },
      { kind: "evidence", label: `Field test result on “${assumptionId}”`, assumptionId },
    );
  }

  function replanFromAssumption(assumption: Assumption) {
    const status = statusLabels[assumption.status].toLowerCase();
    const result = assumption.resultNote.trim() || "No result note provided.";
    onReplan(
      `Assumption ${assumption.id} was marked ${status}. Claim: ${assumption.claim}. Test: ${assumption.cheapTest}. Result: ${result}`,
    );
  }

  // ── Google Calendar sync ──────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);

  async function syncCalendar() {
    if (!plan) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) {
        // Not connected (or token expired) → start the OAuth flow; we'll
        // auto-sync on return via the ?gcal=connected handler below.
        window.location.href = "/api/calendar/auth";
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`Added ${data.count} milestone${data.count === 1 ? "" : "s"} to Google Calendar ✓`);
      } else {
        setSyncMsg(data.error || "Sync failed");
      }
    } catch {
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Detect the OAuth return and clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gcal");
    if (status === "connected") setPendingSync(true);
    else if (status === "error") setSyncMsg("Google connection failed");
    if (status) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Once back from OAuth AND the plan has hydrated, sync automatically.
  useEffect(() => {
    if (pendingSync && plan) {
      setPendingSync(false);
      syncCalendar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSync, plan]);

  const move = plan ? nextMove(plan) : null;
  const theVerdict = plan ? verdict(plan) : null;
  // The weakest assumption to red-team: the riskiest open one, else the first.
  const challengeTarget = plan
    ? summarizeValidation(plan).highestRiskOpen ?? plan.assumptions[0] ?? null
    : null;

  /** Conceding a challenge marks the assumption failed and re-plans from it. */
  function concede(a: Assumption) {
    const failNote = a.resultNote.trim() || "Conceded after an adversarial challenge.";
    updateAssumption(
      a.id,
      { status: "failed", resultNote: failNote },
      { kind: "status", label: `Conceded “${a.id}” after challenge`, assumptionId: a.id },
    );
    replanFromAssumption({ ...a, status: "failed", resultNote: failNote });
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
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Toolbar laid out as the journey: de-risk → build & launch → share. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* De-risk the idea */}
            <button
              onClick={() => setShowChallenge(true)}
              disabled={!challengeTarget}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              ⚔️ Challenge
            </button>
            <button
              onClick={() => setShowResearch(true)}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80"
            >
              🔎 Research
            </button>
            <button
              onClick={() => setShowPremortem(true)}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80"
            >
              ⚠️ Pre-mortem
            </button>

            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

            {/* Build & launch the first version */}
            <button
              onClick={() => setShowFirstVersion(true)}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80"
            >
              🚀 First version
            </button>
            <button
              onClick={() => setShowLaunchKit(true)}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80"
            >
              📣 Launch kit
            </button>

            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

            {/* Share & schedule */}
            <a
              href="/pitch"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80"
            >
              📄 Export pitch
            </a>
            <button
              onClick={syncCalendar}
              disabled={syncing}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "📅 Add to Google Calendar"}
            </button>
            <button
              onClick={() => setShowCalSetup(true)}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
              title="How to connect Google Calendar"
            >
              Setup guide
            </button>
            {syncMsg && <span className="text-xs text-muted">{syncMsg}</span>}
          </div>

          {/* The go/no-go call — the decision the founder came for. */}
          {theVerdict && (
            <section className={`rounded-xl border p-4 ${verdictStyle[theVerdict.call].box}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${verdictStyle[theVerdict.call].label}`}>
                {verdictStyle[theVerdict.call].tag}
              </p>
              <p className="mt-1 text-base font-semibold text-text">{theVerdict.headline}</p>
              <p className="mt-0.5 text-xs text-muted">{theVerdict.reason}</p>
              <p className="mt-2 text-xs text-text">
                <span className={`font-semibold ${verdictStyle[theVerdict.call].label}`}>Do this:</span>{" "}
                {theVerdict.action}
              </p>
            </section>
          )}

          {/* The one decisive action right now. */}
          {move && (
            <section className="rounded-xl border border-accent/40 bg-accent/[0.06] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                ▶ Your next move
              </p>
              <p className="mt-1 text-sm font-medium text-text">{move.title}</p>
              <p className="mt-0.5 text-xs text-muted">{move.rationale}</p>
              <p className="mt-2 text-xs text-text">
                <span className="font-semibold text-accent">Start this weekend:</span>{" "}
                {move.firstStep}
              </p>
              <button
                onClick={() => setDraftFor(move.milestone)}
                className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg transition-opacity hover:opacity-90"
              >
                Draft this step →
              </button>
            </section>
          )}

          <ValidationDashboard plan={plan} />

          <ConfidenceTimeline history={history} />

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
              Assumption tests
            </h3>
            {plan.assumptions.map((a) => (
              <div key={a.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${riskDot[a.risk]}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-text">{a.claim}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone[a.status]}`}
                      >
                        {statusLabels[a.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      <span className={`font-medium uppercase ${riskColor[a.risk]}`}>
                        {a.risk} risk
                      </span>{" "}
                      · Test: {a.cheapTest}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["running", "passed", "failed", "inconclusive"] as AssumptionStatus[]).map(
                    (status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() =>
                          updateAssumption(
                            a.id,
                            { status },
                            {
                              kind: "status",
                              label: `Marked “${a.id}” ${statusLabels[status].toLowerCase()}`,
                              assumptionId: a.id,
                            },
                          )
                        }
                        className={
                          "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors " +
                          (a.status === status
                            ? "border-accent bg-accent text-bg"
                            : "border-border bg-surface-2 text-muted hover:text-text")
                        }
                      >
                        {statusLabels[status]}
                      </button>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setFieldTestFor(a)}
                  className="rounded-lg border border-accent/50 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-opacity hover:opacity-80"
                >
                  🧪 Test it for real
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={a.resultNote}
                    onChange={(e) => updateAssumption(a.id, { resultNote: e.target.value })}
                    placeholder="What happened when you tested it?"
                    className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
                  />
                  <button
                    type="button"
                    onClick={() => replanFromAssumption(a)}
                    disabled={replanning || a.status === "untested"}
                    className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {replanning ? "Updating…" : "Replan from result"}
                  </button>
                </div>

                {(a.evidence ?? []).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer select-none text-muted hover:text-text">
                      🔎 Evidence ({(a.evidence ?? []).length})
                    </summary>
                    <ul className="mt-2 space-y-2 border-l border-border pl-3">
                      {(a.evidence ?? []).map((e) => (
                        <li key={e.id} className="flex items-start gap-2">
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${stanceChip[e.stance]}`}
                          >
                            {e.stance}
                          </span>
                          <span className="min-w-0">
                            {e.kind === "field" || !e.source.uri ? (
                              <span className="text-text">{e.source.title}</span>
                            ) : (
                              <a
                                href={e.source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent underline-offset-2 hover:underline"
                              >
                                {e.source.title}
                              </a>
                            )}
                            {e.snippet && <span className="block text-muted">{e.snippet}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
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
        <StreamModal
          key={draftFor.id}
          title="Draft for"
          subtitle={draftFor.goal}
          endpoint="/api/draft"
          body={{ brief: plan.brief, milestone: draftFor }}
          onClose={() => setDraftFor(null)}
        />
      )}

      {showPremortem && plan && (
        <StreamModal
          title="Pre-mortem"
          subtitle="What could kill this in 30 days"
          endpoint="/api/premortem"
          body={{ plan }}
          onClose={() => setShowPremortem(false)}
        />
      )}

      {showFirstVersion && plan && (
        <StreamModal
          title="Your first version"
          subtitle="The cheapest thing you can put in front of a user this week"
          endpoint="/api/firstversion"
          body={{ plan }}
          onClose={() => setShowFirstVersion(false)}
        />
      )}

      {showLaunchKit && plan && (
        <StreamModal
          title="Launch kit"
          subtitle="Get your first version in front of its first real users"
          endpoint="/api/launchkit"
          body={{ plan }}
          onClose={() => setShowLaunchKit(false)}
        />
      )}

      {showResearch && plan && (
        <ResearchModal
          brief={plan.brief}
          assumptions={plan.assumptions.map((a) => ({ id: a.id, claim: a.claim, risk: a.risk }))}
          onApplyEvidence={applyEvidence}
          onClose={() => setShowResearch(false)}
        />
      )}

      {showChallenge && challengeTarget && (
        <ChallengeModal
          assumption={challengeTarget}
          onConcede={() => concede(challengeTarget)}
          onClose={() => setShowChallenge(false)}
        />
      )}

      {fieldTestFor && plan && (
        <FieldTestModal
          brief={plan.brief}
          assumption={fieldTestFor}
          onApply={(ev) => applyFieldEvidence(fieldTestFor.id, ev)}
          onClose={() => setFieldTestFor(null)}
        />
      )}

      {showCalSetup && <CalendarSetupModal onClose={() => setShowCalSetup(false)} />}
    </div>
  );
}

function ValidationDashboard({ plan }: { plan: Plan }) {
  const summary = summarizeValidation(plan);
  return (
    <section className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[110px_1fr]">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted">Confidence</p>
        <p className="mt-1 text-3xl font-semibold text-text">{summary.confidence}%</p>
        <p className="text-xs text-muted">
          {summary.testedCount}/{summary.totalCount} tested
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Open high risk"
          value={String(summary.unresolvedHighRisk)}
          tone={summary.unresolvedHighRisk > 0 ? "text-risk-high" : "text-risk-low"}
        />
        <Metric
          label="Biggest unknown"
          value={summary.highestRiskOpen?.claim ?? "All assumptions have passed"}
        />
        <Metric label="Next cheapest test" value={summary.nextTest} />
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "text-text" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 line-clamp-3 text-sm leading-snug ${tone}`}>{value}</p>
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
