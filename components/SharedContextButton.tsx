"use client";

import { useState } from "react";

interface Props {
  value: string;
  onSave: (text: string) => void;
}

/**
 * Workspace-wide shared context. Facts the user sets once — who they are, the
 * company, hard constraints — that get fed into every project's interview and
 * plan, so separate ideas share a foundation without re-typing it each time.
 */
export default function SharedContextButton({ value, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function openModal() {
    setDraft(value);
    setOpen(true);
  }
  function save() {
    onSave(draft.trim());
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${value.trim() ? "bg-accent" : "bg-muted"}`} />
        Context
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-text">Shared context (applies to every idea)</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Background that&apos;s true across all your projects — who you are, your company,
              budget, timeline, hard constraints. The interview and plan for every tab use this, so
              you don&apos;t repeat yourself, and your ideas don&apos;t trip over each other&apos;s
              assumptions.
            </p>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder="e.g. Solo non-technical founder, $2k budget, want a paying customer within 6 weeks…"
              className="mt-3 w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
            />

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={save}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
              >
                Save
              </button>
              {value.trim() && (
                <button
                  onClick={() => {
                    setDraft("");
                    onSave("");
                    setOpen(false);
                  }}
                  className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-text transition-opacity hover:opacity-80"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
