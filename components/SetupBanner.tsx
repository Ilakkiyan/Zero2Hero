"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { isAzureConfigured, type ProviderPref } from "@/lib/apiClient";

interface Health {
  provider: string;
  local: boolean;
  ready: boolean;
  running?: boolean;
  modelPulled?: boolean;
  configured?: boolean;
  model?: string;
  deployment?: string | null;
}

/**
 * First-page setup guide, scoped to the selected provider (the header toggle).
 * - Local (Ollama): download links + `ollama pull` + live status.
 * - Cloud (Azure): whether AZURE_OPENAI_* is configured.
 * Collapses to a small status chip once the backend is ready.
 */
export default function SetupBanner({ provider }: { provider: ProviderPref }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);
  // Azure can be configured client-side (Settings) — read on mount/re-check, not
  // during render, to avoid an SSR/hydration mismatch on localStorage.
  const [clientAzure, setClientAzure] = useState(false);

  const backend = provider === "cloud" ? "azure" : "ollama";

  const check = useCallback(async () => {
    setChecking(true);
    setHealth(null);
    setClientAzure(isAzureConfigured());
    try {
      const res = await fetch(`/api/health?provider=${backend}`, { cache: "no-store" });
      setHealth(await res.json());
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }, [backend]);

  useEffect(() => {
    check();
  }, [check]);

  // Cloud is ready if the server has env creds OR the user configured it in Settings.
  const ready = health?.ready || (provider === "cloud" && clientAzure);

  // Ready → slim status chip.
  if (ready) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-surface px-6 py-1.5 text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-risk-low" />
        {provider === "cloud"
          ? `Cloud · Azure ready · ${health?.deployment ?? "deployment"}`
          : `Local model ready · ${health?.model ?? "ollama"} · private, no key`}
      </div>
    );
  }

  // ── Cloud (Azure) not configured ───────────────────────────────────
  if (provider === "cloud") {
    return (
      <div className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-risk-med" />
            <h2 className="text-sm font-semibold text-text">
              {checking ? "Checking Azure…" : "Connect Azure OpenAI (your $100 credit)"}
            </h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Add your Azure endpoint, API key, and deployment name in{" "}
            <strong className="text-text">Settings</strong> — they stay on this device, no env
            files or restart needed.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Link
              href="/settings"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
            >
              Open Settings →
            </Link>
            <button
              onClick={check}
              disabled={checking}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-text transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {checking ? "Checking…" : "Re-check"}
            </button>
            <span className="text-xs text-muted">Or switch to 💻 Local (top-right) to run offline.</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Local (Ollama) setup ───────────────────────────────────────────
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
                ? "Almost there — pull the model"
                : "Run Zero2Hero fully locally (no API key)"}
          </h2>
        </div>

        <p className="mt-1 text-xs leading-relaxed text-muted">
          Local mode runs on <span className="text-text">Ollama</span> — private, free, no quota.
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
