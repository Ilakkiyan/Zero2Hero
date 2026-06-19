"use client";

import { useEffect, useRef, useState } from "react";
import type { Assumption, IdeaBrief } from "@/lib/schema";
import type { FieldTestDesign, FieldTestResult } from "@/lib/fieldtest";
import { apiHeaders } from "@/lib/apiClient";

/**
 * Field Test — "past the plan". Designs the cheapest REAL-WORLD test for one
 * assumption (method/scale fit to the idea — offline/manual is first-class, not
 * assumed software), then captures what actually happened as PRIMARY evidence
 * that moves confidence. The honest counterpart to web research.
 */
export interface FieldEvidence {
  stance: FieldTestResult["stance"];
  summary: string;
  method: string;
  suggestedStatus: FieldTestResult["suggestedStatus"];
}

const channelLabel: Record<FieldTestDesign["channel"], string> = {
  "in-person": "In person",
  online: "Online",
  phone: "Phone",
  message: "Message / DM",
  manual: "By hand",
};

export default function FieldTestModal({
  brief,
  assumption,
  onApply,
  onClose,
}: {
  brief: IdeaBrief;
  assumption: Assumption;
  onApply: (ev: FieldEvidence) => void;
  onClose: () => void;
}) {
  const [design, setDesign] = useState<FieldTestDesign | null>(null);
  const [designing, setDesigning] = useState(true);
  const [result, setResult] = useState<FieldTestResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  function payload() {
    return {
      brief,
      assumption: {
        id: assumption.id,
        claim: assumption.claim,
        risk: assumption.risk,
        cheapTest: assumption.cheapTest,
      },
    };
  }

  // Design the test on open.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/fieldtest", {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({ mode: "design", ...payload() }),
        });
        const data = await res.json();
        if (res.ok) setDesign(data.design);
        else setError(data.error || "Could not design a test");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setDesigning(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function capture() {
    const text = raw.trim();
    if (!text || capturing) return;
    setError(null);
    setCapturing(true);
    try {
      const res = await fetch("/api/fieldtest", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          mode: "capture",
          ...payload(),
          method: design?.method ?? "Field test",
          proveIf: design?.proveIf ?? "",
          killIf: design?.killIf ?? "",
          result: text,
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(data.result);
      else setError(data.error || "Could not read the result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCapturing(false);
    }
  }

  const stanceTone: Record<FieldTestResult["stance"], string> = {
    supports: "text-risk-low",
    undermines: "text-risk-high",
    neutral: "text-muted",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted">🧪 Field test · real evidence</p>
            <p className="truncate text-sm font-medium text-text">Testing: {assumption.claim}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-risk-high">{error}</p>}
          {designing && (
            <p className="text-sm text-muted">Designing the cheapest real-world test for this…</p>
          )}

          {design && (
            <>
              <section className="space-y-2 rounded-xl border border-accent/40 bg-accent/[0.06] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text">{design.method}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                    {channelLabel[design.channel]}
                  </span>
                  <span className="text-xs text-muted">· {design.scale}</span>
                </div>
                <p className="text-xs text-muted">{design.why}</p>
              </section>

              <section className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Steps</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-text">
                  {design.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </section>

              <section className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Use this verbatim
                  </p>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(design.artifact)}
                    className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted transition-colors hover:text-text"
                  >
                    Copy
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-3 text-sm text-text">
                  {design.artifact}
                </pre>
              </section>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <p className="rounded-lg border border-risk-low/40 bg-risk-low/[0.06] p-2.5 text-xs text-text">
                  <span className="font-semibold text-risk-low">Proves it if:</span> {design.proveIf}
                </p>
                <p className="rounded-lg border border-risk-high/40 bg-risk-high/[0.06] p-2.5 text-xs text-text">
                  <span className="font-semibold text-risk-high">Kills it if:</span> {design.killIf}
                </p>
              </div>

              {result && (
                <section className="space-y-2 rounded-xl border border-border bg-surface-2 p-4">
                  <p className="text-sm">
                    <span className={`font-semibold uppercase ${stanceTone[result.stance]}`}>
                      {result.stance}
                    </span>
                    {result.suggestedStatus && (
                      <span className="text-muted"> · suggests marking it {result.suggestedStatus}</span>
                    )}
                  </p>
                  <p className="text-sm text-text">{result.summary}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onApply({
                        stance: result.stance,
                        summary: result.summary,
                        method: design.method,
                        suggestedStatus: result.suggestedStatus,
                      });
                      onClose();
                    }}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
                  >
                    Apply as evidence →
                  </button>
                </section>
              )}
            </>
          )}
        </div>

        {design && !result && (
          <div className="space-y-2 border-t border-border p-3">
            <p className="px-1 text-xs text-muted">Ran it? Log what actually happened — real numbers and quotes.</p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={3}
              placeholder="e.g. Knocked on 10 doors. 6 were interested, 2 prepaid $20, 2 said too expensive."
              className="w-full resize-y rounded-xl bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
            />
            <button
              onClick={capture}
              disabled={capturing || !raw.trim()}
              className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {capturing ? "Reading the result…" : "Log result → get evidence"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
