"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import CalendarSetupModal from "@/components/CalendarSetupModal";
import {
  getAzureConfig,
  getModelOverride,
  getProviderPref,
  providerName,
  setAzureApiKey,
  setAzureEndpoint,
  setModelOverride,
  setProviderPref,
  type ProviderPref,
} from "@/lib/apiClient";

const MODEL_PLACEHOLDER: Record<string, string> = {
  ollama: "qwen2.5:14b",
  azure: "your Azure deployment name",
};

const OLLAMA_DEFAULT = "qwen2.5:14b";

// One-tap local model sizes. 14B is higher quality and the default (best for the
// strict judgment steps); 7B is lighter/faster for a modest machine.
const OLLAMA_SIZES: { model: string; label: string; hint: string }[] = [
  { model: "qwen2.5:14b", label: "14B", hint: "better quality · ~9 GB · default" },
  { model: "qwen2.5:7b", label: "7B", hint: "lighter · ~4.7 GB · faster" },
];

type CalState = "unknown" | "connected" | "disconnected";

export default function SettingsPage() {
  const [provider, setProvider] = useState<ProviderPref>("local");
  const [model, setModel] = useState("");
  const [azureEndpoint, setEndpoint] = useState("");
  const [azureKey, setKey] = useState("");
  const [cal, setCal] = useState<CalState>("unknown");
  const [calBusy, setCalBusy] = useState(false);
  const [showCalGuide, setShowCalGuide] = useState(false);

  const server = providerName(provider);

  // Hydrate from localStorage / server on mount.
  useEffect(() => {
    const p = getProviderPref();
    setProvider(p);
    setModel(getModelOverride(providerName(p)));
    const az = getAzureConfig();
    setEndpoint(az.endpoint);
    setKey(az.apiKey);
    refreshCalStatus();
  }, []);

  function saveEndpoint(next: string) {
    setEndpoint(next);
    setAzureEndpoint(next);
  }
  function saveKey(next: string) {
    setKey(next);
    setAzureApiKey(next);
  }

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

      {/* Azure connection (cloud only) — endpoint + key live on this machine and
          ride along as request headers, so the desktop app needs no env files. */}
      {provider === "cloud" && (
        <Section
          title="Azure connection"
          hint="Your Azure OpenAI endpoint and key, stored only on this device. Set the deployment name under Model below."
        >
          <label className="text-[10px] uppercase tracking-wide text-muted">Endpoint</label>
          <input
            value={azureEndpoint}
            onChange={(e) => saveEndpoint(e.target.value)}
            placeholder="https://<resource>.openai.azure.com"
            className="mb-3 mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
          />
          <label className="text-[10px] uppercase tracking-wide text-muted">API key</label>
          <input
            value={azureKey}
            onChange={(e) => saveKey(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder="your Azure OpenAI key"
            className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
          />
          <p className="mt-1.5 text-xs text-muted">
            Stored locally and sent only to your own machine, which forwards requests to Azure.
          </p>
        </Section>
      )}

      {/* Model */}
      <Section
        title="Model"
        hint={`The ${provider === "local" ? "model" : "deployment name"} used for the ${provider === "local" ? "Local (Ollama)" : "Cloud (Azure)"} provider. Leave blank to use the server default.`}
      >
        {server === "ollama" && (
          <div className="mb-2 flex flex-wrap gap-2">
            {OLLAMA_SIZES.map((s) => {
              const active = model === s.model || (!model && s.model === OLLAMA_DEFAULT);
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
        hint="Research works out of the box — no setup or API key. Add a private SearxNG for fully local search."
      >
        <p className="text-xs leading-relaxed text-muted">
          By default, research searches the web via <span className="text-text">DuckDuckGo</span>{" "}
          (keyless, nothing to install). For fully private, self-hosted search, run a local{" "}
          <span className="text-text">SearxNG</span> and the app will prefer it automatically:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-relaxed text-text">{`# needs Docker installed and running
docker compose -f docker-compose.searxng.yml up -d`}</pre>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
          <li>• The desktop app runs this for you on launch if Docker is available.</li>
          <li>
            • It listens on <Cmd>http://localhost:8080</Cmd>; point elsewhere with the{" "}
            <Cmd>SEARXNG_URL</Cmd> env var.
          </li>
          <li>• If SearxNG isn&apos;t reachable, research silently falls back to DuckDuckGo.</li>
        </ul>
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

function Cmd({ children }: { children: string }) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text">
      {children}
    </code>
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
