"use client";

import { useEffect, useRef, useState } from "react";
import type { IdeaBrief } from "@/lib/schema";

interface Source {
  title: string;
  uri: string;
}

/**
 * Streams a grounded research brief from /api/research and renders it live,
 * followed by the cited source links. Has its own stream reader (vs the shared
 * one) because it also handles the "sources" event.
 */
export default function ResearchModal({ brief, onClose }: { brief: IdeaBrief; onClose: () => void }) {
  const [text, setText] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
            const ev = JSON.parse(line) as
              | { type: "token"; value: string }
              | { type: "sources"; value: Source[] }
              | { type: "done" }
              | { type: "error"; message: string };
            if (ev.type === "token") setText((p) => p + ev.value);
            else if (ev.type === "sources") setSources(ev.value);
            else if (ev.type === "error") throw new Error(ev.message);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            <p className="truncate text-sm font-medium text-text">
              competitors · skills · market signals
            </p>
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
            <>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text">
                {text}
                {loading && <span className="text-muted">▍</span>}
              </pre>

              {sources.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
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
            </>
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
