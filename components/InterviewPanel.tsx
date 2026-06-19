"use client";

import { useRef, useState } from "react";
import type { ChatMessage } from "@/lib/llm";
import { readTokenStream } from "@/lib/streamClient";
import { useSpeechToText } from "@/lib/useSpeechToText";
import { apiHeaders } from "@/lib/apiClient";
import { PERSONA_PRESETS } from "@/lib/personas";

interface Props {
  messages: ChatMessage[];
  setMessages: (m: ChatMessage[]) => void;
  readyToPlan: boolean;
  setReadyToPlan: (v: boolean) => void;
  onGeneratePlan: () => void;
  onLoadSample: () => void;
  planning: boolean;
  /** True once a plan exists — chat then refines the plan instead of interviewing. */
  hasPlan: boolean;
  /** Revise the existing plan from a chat message; resolves true on success. */
  onRefine: (note: string) => Promise<boolean>;
  refining: boolean;
  /** Workspace-wide context injected into the interview for every project. */
  sharedContext: string;
  /** Seed the shared context from a one-tap persona pick (first-run nudge). */
  onSetSharedContext: (text: string) => void;
}

export default function InterviewPanel({
  messages,
  setMessages,
  readyToPlan,
  setReadyToPlan,
  onGeneratePlan,
  onLoadSample,
  planning,
  hasPlan,
  onRefine,
  refining,
  sharedContext,
  onSetSharedContext,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice dictation: base holds committed text; interim previews live on top.
  const baseRef = useRef("");
  const { supported: micSupported, listening, toggle } = useSpeechToText((text, isFinal) => {
    if (isFinal) {
      baseRef.current = (baseRef.current ? baseRef.current + " " : "") + text.trim();
      setInput(baseRef.current);
    } else {
      setInput((baseRef.current ? baseRef.current + " " : "") + text.trim());
    }
  });

  function toggleMic() {
    if (!listening) baseRef.current = input.trim();
    toggle();
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || refining) return;
    setError(null);

    const base: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(base);
    setInput("");

    // Once a plan exists, chat refines that plan rather than re-interviewing.
    if (hasPlan) {
      const ok = await onRefine(text);
      setMessages([
        ...base,
        {
          role: "assistant",
          content: ok
            ? "Done — I updated the execution plan from that. Take a look on the right →"
            : "I couldn't revise the plan from that. Try rephrasing the change you want.",
        },
      ]);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ messages: base, sharedContext }),
      });

      // Stream tokens and grow the assistant bubble live.
      let assistant = "";
      const { readyToPlan } = await readTokenStream(res, (text) => {
        assistant += text;
        setMessages([...base, { role: "assistant", content: assistant }]);
      });
      if (readyToPlan) setReadyToPlan(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <h2 className="text-sm font-medium text-text">Interview</h2>
        <span className="ml-auto text-xs text-muted">your honest cofounder</span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted">
              What&apos;s the idea you can&apos;t stop thinking about? Tell me in a sentence — even a
              rough one. I&apos;m the cofounder who pushes back: I&apos;ll find the riskiest
              assumption you haven&apos;t spotted, then turn it into a real plan you can start this
              week.
            </p>
            {!sharedContext.trim() && (
              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-xs font-medium text-text">First, who are you?</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  One tap tailors every question and plan to your situation. (Change it anytime via{" "}
                  <span className="text-text">Context</span> in the header.)
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PERSONA_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => onSetSharedContext(p.text)}
                      className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text transition-opacity hover:opacity-80"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onLoadSample}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80"
            >
              Load sample idea
            </button>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
                (m.role === "user"
                  ? "bg-surface-2 text-text"
                  : "bg-transparent text-text")
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {(loading || refining) &&
          (messages.length === 0 || messages[messages.length - 1].role === "user") && (
            <p className="text-sm text-muted">{refining ? "Revising the plan…" : "Thinking…"}</p>
          )}
        {error && <p className="text-sm text-risk-high">{error}</p>}
      </div>

      {readyToPlan && !hasPlan && (
        <div className="px-5 pb-2">
          <button
            onClick={onGeneratePlan}
            disabled={planning}
            className="w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {planning ? "Building plan…" : "Generate execution plan →"}
          </button>
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl bg-surface-2 p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={
              listening
                ? "Listening…"
                : hasPlan
                  ? "Ask for a change to the plan…"
                  : "Type your idea or answer…"
            }
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted"
          />
          {micSupported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? "Stop dictation" : "Start dictation"}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                listening
                  ? "animate-pulse bg-risk-high text-white"
                  : "bg-surface text-muted hover:text-text"
              }`}
            >
              {listening ? "● Rec" : "🎤"}
            </button>
          )}
          <button
            onClick={send}
            disabled={loading || refining || !input.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
