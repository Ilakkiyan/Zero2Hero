"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/llm";
import { readTokenStream } from "@/lib/streamClient";

interface Props {
  messages: ChatMessage[];
  setMessages: (m: ChatMessage[]) => void;
  readyToPlan: boolean;
  setReadyToPlan: (v: boolean) => void;
  onGeneratePlan: () => void;
  planning: boolean;
}

export default function InterviewPanel({
  messages,
  setMessages,
  readyToPlan,
  setReadyToPlan,
  onGeneratePlan,
  planning,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);

    const base: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(base);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: base }),
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
        <span className="ml-auto text-xs text-muted">de-risk the idea</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <p className="text-sm leading-relaxed text-muted">
            Describe your idea in a sentence — even a vague one. I&apos;ll ask the questions that
            matter and surface the assumptions you haven&apos;t spotted yet.
          </p>
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

        {loading &&
          (messages.length === 0 || messages[messages.length - 1].role === "user") && (
            <p className="text-sm text-muted">Thinking…</p>
          )}
        {error && <p className="text-sm text-risk-high">{error}</p>}
      </div>

      {readyToPlan && (
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
            placeholder="Type your idea or answer…"
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
