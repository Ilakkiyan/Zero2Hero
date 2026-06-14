"use client";

import { useEffect, useState } from "react";
import { getGeminiKey, setGeminiKey, clearGeminiKey } from "@/lib/apiClient";

/**
 * Header control for bring-your-own-key. Shows whether a key is set; the modal
 * lets the user paste/save/clear their own Gemini key (stored in localStorage).
 */
export default function ApiKeyButton() {
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    setHasKey(!!getGeminiKey());
  }, []);

  function openModal() {
    setValue(getGeminiKey());
    setOpen(true);
  }

  function save() {
    const k = value.trim();
    setGeminiKey(k);
    setHasKey(!!k);
    setOpen(false);
  }

  function clear() {
    clearGeminiKey();
    setHasKey(false);
    setValue("");
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${hasKey ? "bg-risk-low" : "bg-risk-med"}`}
        />
        Key
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
            <p className="text-sm font-medium text-text">Your Gemini API key</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Bring your own key so the app runs on your free quota. Stored only in this browser
              and sent with your requests — never saved on the server.{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                Get a free key →
              </a>
            </p>

            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="AIza… or AQ.…"
              className="mt-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
            />

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={save}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
              >
                Save
              </button>
              {hasKey && (
                <button
                  onClick={clear}
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
