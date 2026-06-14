"use client";

import { useEffect, useRef, useState } from "react";
import type { IdeaBrief, Milestone } from "@/lib/schema";
import { readTokenStream } from "@/lib/streamClient";

interface Props {
  brief: IdeaBrief;
  milestone: Milestone;
  onClose: () => void;
}

export default function DraftModal({ brief, milestone, onClose }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // guard double-invoke (React StrictMode in dev)
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief, milestone }),
        });
        await readTokenStream(res, (t) => setText((prev) => prev + t));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [brief, milestone]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted">Draft for</p>
            <p className="truncate text-sm font-medium text-text">{milestone.goal}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-risk-high">{error}</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text">
              {text}
              {loading && <span className="text-muted">▍</span>}
            </pre>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={copy}
            disabled={!text}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-text transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
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
