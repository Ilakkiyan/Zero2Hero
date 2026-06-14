"use client";

import { useEffect, useRef, useState } from "react";
import type { IdeaBrief } from "@/lib/schema";

interface Source {
  title: string;
  uri: string;
}
type StepState = "pending" | "searching" | "done";

type ResearchEvent =
  | { type: "plan"; questions: string[] }
  | { type: "step"; index: number; question: string }
  | { type: "step_done"; index: number; sourceCount: number }
  | { type: "token"; value: string }
  | { type: "sources"; value: Source[] }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Agentic research view: shows the research plan, each grounded search lighting
 * up as it runs, then the streamed synthesis and cited sources.
 */
export default function ResearchModal({ brief, onClose }: { brief: IdeaBrief; onClose: () => void }) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [stepCounts, setStepCounts] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // guard double-invoke (StrictMode in dev)
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief }),
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            const ev = JSON.parse(line) as ResearchEvent;

            if (ev.type === "plan") {
              setQuestions(ev.questions);
              setSteps(ev.questions.map(() => "pending"));
              setStepCounts(ev.questions.map(() => 0));
            } else if (ev.type === "step") {
              setSteps((s) => s.map((v, idx) => (idx === ev.index ? "searching" : v)));
            } else if (ev.type === "step_done") {
              setSteps((s) => s.map((v, idx) => (idx === ev.index ? "done" : v)));
              setStepCounts((c) => c.map((v, idx) => (idx === ev.index ? ev.sourceCount : v)));
            } else if (ev.type === "token") {
              setText((p) => p + ev.value);
            } else if (ev.type === "sources") {
              setSources(ev.value);
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setFinished(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const icon = (s: StepState) => (s === "done" ? "✓" : s === "searching" ? "⟳" : "•");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted">Live research</p>
            <p className="truncate text-sm font-medium text-text">plan → search → synthesize</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-risk-high">{error}</p>}

          {questions.length === 0 && !error && (
            <p className="text-sm text-muted">Planning research…</p>
          )}

          {/* Research plan + live progress */}
          {questions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted">Research plan</p>
              <ul className="space-y-1.5">
                {questions.map((q, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span
                      className={
                        "mt-0.5 w-4 shrink-0 text-center " +
                        (steps[idx] === "done"
                          ? "text-risk-low"
                          : steps[idx] === "searching"
                            ? "animate-spin text-accent"
                            : "text-muted")
                      }
                    >
                      {icon(steps[idx])}
                    </span>
                    <span className={steps[idx] === "pending" ? "text-muted" : "text-text"}>
                      {q}
                      {steps[idx] === "done" && stepCounts[idx] > 0 && (
                        <span className="text-muted"> · {stepCounts[idx]} sources</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Synthesized brief */}
          {text && (
            <div className="border-t border-border pt-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text">
                {text}
                {!finished && <span className="text-muted">▍</span>}
              </pre>
            </div>
          )}

          {/* Sources */}
          {sources.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-muted">Sources</p>
              <ul className="space-y-1">
                {sources.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent underline-offset-2 hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
