"use client";

import { useEffect, useState } from "react";
import { getGeminiKey, setGeminiKey, clearGeminiKey } from "@/lib/apiClient";

/**
 * Header control for bring-your-own-key. Shows whether a key is set; the modal
 * lets the user paste/save/clear their own Gemini key (stored in localStorage).
 */
type Status = "idle" | "checking" | "invalid";

export default function ApiKeyButton() {
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setHasKey(!!getGeminiKey());
  }, []);

  function openModal() {
    setValue(getGeminiKey());
    setStatus("idle");
    setErrorMsg(null);
    setOpen(true);
  }

  // Verify the key with Google before saving; an empty value clears the key.
  async function save() {
    const k = value.trim();
    setErrorMsg(null);

    if (!k) {
      clear();
      setOpen(false);
      return;
    }

    setStatus("checking");
    try {
      const res = await fetch("/api/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-key": k },
      });
      const data = (await res.json()) as { valid: boolean; error?: string };
      if (data.valid) {
        setGeminiKey(k);
        setHasKey(true);
        setStatus("idle");
        setOpen(false);
      } else {
        setStatus("invalid");
        setErrorMsg(data.error || "That key didn't work.");
      }
    } catch {
      setStatus("invalid");
      setErrorMsg("Couldn't verify the key — check your connection.");
    }
  }

  function clear() {
    clearGeminiKey();
    setHasKey(false);
    setValue("");
    setStatus("idle");
    setErrorMsg(null);
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
            <p className="text-sm font-medium text-text">Gemini key — for web research (optional)</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              The app runs fully locally; this key only enables the web-research feature (Google
              Search grounding). Stored only in this browser, sent per request, never saved on the
              server.{" "}
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
              onChange={(e) => {
                setValue(e.target.value);
                if (status === "invalid") {
                  setStatus("idle");
                  setErrorMsg(null);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="AIza… or AQ.…"
              className="mt-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
            />

            {errorMsg && <p className="mt-2 text-xs text-risk-high">{errorMsg}</p>}

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={save}
                disabled={status === "checking"}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {status === "checking" ? "Verifying…" : "Verify & save"}
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
