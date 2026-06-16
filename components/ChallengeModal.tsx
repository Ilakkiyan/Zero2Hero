"use client";

import { useEffect, useRef, useState } from "react";
import type { Assumption } from "@/lib/schema";
import type { ChatMessage } from "@/lib/llm";
import { readTokenStream } from "@/lib/streamClient";
import { apiHeaders } from "@/lib/apiClient";

/**
 * Adversarial cofounder, interactive: the AI argues against your weakest
 * assumption; you defend (it pushes back) or concede. Conceding marks the
 * assumption failed and re-plans — the "pushes back, not a yes-man" moment.
 */
export default function ChallengeModal({
  assumption,
  onConcede,
  onClose,
}: {
  assumption: Assumption;
  onConcede: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function send(userText?: string) {
    setError(null);
    let convo = messages;
    if (userText) {
      convo = [...messages, { role: "user", content: userText }];
      setMessages(convo);
      setInput("");
    }
    setLoading(true);
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          assumption: { claim: assumption.claim, risk: assumption.risk, cheapTest: assumption.cheapTest },
          messages: convo,
        }),
      });
      let assistant = "";
      await readTokenStream(res, (t) => {
        assistant += t;
        setMessages([...convo, { role: "assistant", content: assistant }]);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Open with the adversary's first argument.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const awaitingOpening = loading && messages.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted">⚔️ Adversarial cofounder</p>
            <p className="truncate text-sm font-medium text-text">Challenging: {assumption.claim}</p>
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
          {awaitingOpening && <p className="text-sm text-muted">Building the case against this…</p>}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
                  (m.role === "user" ? "bg-surface-2 text-text" : "bg-transparent text-text")
                }
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-xl bg-surface-2 p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !loading) send(input.trim());
                }
              }}
              rows={1}
              placeholder="Defend it — why is the assumption still sound?"
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted"
            />
            <button
              onClick={() => input.trim() && !loading && send(input.trim())}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Defend
            </button>
          </div>
          <button
            onClick={() => {
              onConcede();
              onClose();
            }}
            className="w-full rounded-lg border border-risk-high/50 bg-risk-high/10 py-2 text-sm font-medium text-risk-high transition-opacity hover:opacity-90"
          >
            Concede → mark failed &amp; re-plan
          </button>
        </div>
      </div>
    </div>
  );
}
