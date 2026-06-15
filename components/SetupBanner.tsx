"use client";

import { useCallback, useEffect, useState } from "react";

interface Health {
  provider: string;
  local: boolean;
  ready: boolean;
  running?: boolean;
  modelPulled?: boolean;
  model: string;
}

/**
 * First-page setup guide for the fully-local model. Shows whether Ollama is
 * running and the model is pulled; if not, gives one-click download links and
 * the exact commands. Collapses to a small status chip once everything's ready.
 */
export default function SetupBanner() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth(await res.json());
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // Non-local provider, or everything ready → just a small status chip.
  if (health && (health.ready || !health.local)) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-surface px-6 py-1.5 text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-risk-low" />
        {health.local ? `Local model ready · ${health.model}` : `Provider: ${health.provider}`}
        <span className="ml-1">· runs fully on your machine, no API key</span>
      </div>
    );
  }

  const model = health?.model || "qwen2.5:7b";
  const running = health?.running ?? false;

  return (
    <div className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-risk-med" />
          <h2 className="text-sm font-semibold text-text">
            {checking
              ? "Checking local model…"
              : running
                ? `Almost there — pull the model`
                : "Run Zero2Hero fully locally (no API key needed)"}
          </h2>
        </div>

        <p className="mt-1 text-xs leading-relaxed text-muted">
          Zero2Hero runs on a local model via <span className="text-text">Ollama</span> — private,
          free, no quota. Two quick steps:
        </p>

        <ol className="mt-3 space-y-3 text-sm">
          {!running && (
            <li>
              <p className="font-medium text-text">1. Install &amp; start Ollama</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <a href="https://ollama.com/download/mac" target="_blank" rel="noopener noreferrer" className={linkBtn}>
                  macOS
                </a>
                <a href="https://ollama.com/download/windows" target="_blank" rel="noopener noreferrer" className={linkBtn}>
                  Windows
                </a>
                <a href="https://ollama.com/download/linux" target="_blank" rel="noopener noreferrer" className={linkBtn}>
                  Linux
                </a>
                <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className={linkBtn}>
                  All downloads ↗
                </a>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Linux one-liner: <Cmd>curl -fsSL https://ollama.com/install.sh | sh</Cmd>
              </p>
            </li>
          )}

          <li>
            <p className="font-medium text-text">{running ? "1." : "2."} Pull the model</p>
            <p className="mt-1.5 text-xs text-muted">
              <Cmd>{`ollama pull ${model}`}</Cmd>
            </p>
          </li>
        </ol>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={check}
            disabled={checking}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Re-check"}
          </button>
          <span className="text-xs text-muted">
            {running ? "Ollama is running ✓" : "Ollama not detected on localhost:11434"}
          </span>
        </div>
      </div>
    </div>
  );
}

const linkBtn =
  "rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-opacity hover:opacity-80";

function Cmd({ children }: { children: string }) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text">
      {children}
    </code>
  );
}
