"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import CalendarSetupModal from "@/components/CalendarSetupModal";
import {
  getModelOverride,
  getProviderPref,
  providerName,
  setModelOverride,
  setProviderPref,
  type ProviderPref,
} from "@/lib/apiClient";

const MODEL_PLACEHOLDER: Record<string, string> = {
  ollama: "qwen2.5:14b",
  azure: "your Azure deployment name",
};

// One-tap local model sizes. 7B is lighter/faster (good for trying it out on a
// modest machine); 14B is higher quality (the default).
const OLLAMA_SIZES: { model: string; label: string; hint: string }[] = [
  { model: "qwen2.5:7b", label: "7B", hint: "lighter · ~4.7 GB · faster" },
  { model: "qwen2.5:14b", label: "14B", hint: "better quality · ~9 GB · default" },
];

type CalState = "unknown" | "connected" | "disconnected";

export default function SettingsPage() {
  const [provider, setProvider] = useState<ProviderPref>("local");
  const [model, setModel] = useState("");
  const [cal, setCal] = useState<CalState>("unknown");
  const [calBusy, setCalBusy] = useState(false);
  const [showCalGuide, setShowCalGuide] = useState(false);

  const server = providerName(provider);

  // Hydrate from localStorage / server on mount.
  useEffect(() => {
    const p = getProviderPref();
    setProvider(p);
    setModel(getModelOverride(providerName(p)));
    refreshCalStatus();
  }, []);

  function changeProvider(p: ProviderPref) {
    setProviderPref(p);
    setProvider(p);
    setModel(getModelOverride(providerName(p))); // model override is per-provider
  }

  function saveModel(next: string) {
    setModel(next);
    setModelOverride(server, next);
  }

  async function refreshCalStatus() {
    try {
      const res = await fetch("/api/calendar/status");
      const data = (await res.json()) as { connected: boolean };
      setCal(data.connected ? "connected" : "disconnected");
    } catch {
      setCal("disconnected");
    }
  }

  async function disconnectCal() {
    setCalBusy(true);
    try {
      await fetch("/api/calendar/disconnect", { method: "POST" });
      setCal("disconnected");
    } finally {
      setCalBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
        >
          ← Back
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-text">Settings</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* Provider */}
      <Section title="Model provider" hint="Where generation runs. Local is private and free.">
        <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
          <button
            onClick={() => changeProvider("local")}
            className={pill(provider === "local")}
          >
            💻 Local (Ollama)
          </button>
          <button
            onClick={() => changeProvider("cloud")}
            className={pill(provider === "cloud")}
          >
            ☁ Cloud (Azure)
          </button>
        </div>
      </Section>

      {/* Model */}
      <Section
        title="Model"
        hint={`The model used for the ${provider === "local" ? "Local (Ollama)" : "Cloud (Azure)"} provider. Leave blank to use the server default.`}
      >
        {server === "ollama" && (
          <div className="mb-2 flex flex-wrap gap-2">
            {OLLAMA_SIZES.map((s) => {
              const active = model === s.model || (!model && s.model === "qwen2.5:14b");
              return (
                <button
                  key={s.model}
                  onClick={() => saveModel(s.model)}
                  className={
                    "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors " +
                    (active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface-2 hover:border-accent/50")
                  }
                >
                  <span className="text-sm font-medium text-text">qwen2.5 {s.label}</span>
                  <span className="text-[10px] text-muted">{s.hint}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={model}
            onChange={(e) => saveModel(e.target.value)}
            placeholder={MODEL_PLACEHOLDER[server] ?? "default"}
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
          />
          {model && (
            <button
              onClick={() => saveModel("")}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text transition-opacity hover:opacity-80"
            >
              Reset
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {server === "ollama"
            ? "Must be pulled in Ollama first (e.g. `ollama pull llama3.1`)."
            : "Use the deployment name from your Azure OpenAI resource."}
        </p>
      </Section>

      {/* Web research */}
      <Section
        title="Web research"
        hint="Research runs on a private, local SearxNG search engine — no API key, no third-party services."
      >
        <p className="text-xs leading-relaxed text-muted">
          The desktop app starts SearxNG automatically (it needs Docker running). Nothing to
          configure here.
        </p>
      </Section>

      {/* Google Calendar */}
      <Section
        title="Google Calendar"
        hint="Push plan milestones to your calendar. Needs a one-time Google OAuth client."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs " +
              (cal === "connected"
                ? "border-risk-low text-risk-low"
                : "border-border text-muted")
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${cal === "connected" ? "bg-risk-low" : "bg-muted"}`}
            />
            {cal === "connected" ? "Connected" : cal === "unknown" ? "Checking…" : "Not connected"}
          </span>

          {cal === "connected" ? (
            <button
              onClick={disconnectCal}
              disabled={calBusy}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-text transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {calBusy ? "…" : "Disconnect"}
            </button>
          ) : (
            <a
              href="/api/calendar/auth"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
            >
              Connect Google Calendar
            </a>
          )}

          <button
            onClick={() => setShowCalGuide(true)}
            className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            Setup guide
          </button>
        </div>
      </Section>

      <p className="text-xs text-muted">
        Per-idea interview context and the workspace-wide shared context live on the main screen
        (the <strong>Context</strong> button, top-right).
      </p>

      {showCalGuide && <CalendarSetupModal onClose={() => setShowCalGuide(false)} />}
    </main>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium text-text">{title}</h2>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-muted">{hint}</p>
      {children}
    </section>
  );
}

const pill = (active: boolean) =>
  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
  (active ? "bg-accent text-bg" : "text-muted hover:text-text");
