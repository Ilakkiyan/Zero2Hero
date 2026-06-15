"use client";

import { setProviderPref, type ProviderPref } from "@/lib/apiClient";

/**
 * Header toggle between Cloud (Azure OpenAI) and Local (Ollama). Writes the
 * preference to localStorage (read by apiHeaders on every request) and lifts
 * the change up so the setup banner can react.
 */
export default function ProviderToggle({
  value,
  onChange,
}: {
  value: ProviderPref;
  onChange: (v: ProviderPref) => void;
}) {
  function set(v: ProviderPref) {
    setProviderPref(v);
    onChange(v);
  }

  const pill = (active: boolean) =>
    "rounded-md px-2 py-1 text-xs font-medium transition-colors " +
    (active ? "bg-accent text-bg" : "text-muted hover:text-text");

  return (
    <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
      <button onClick={() => set("cloud")} className={pill(value === "cloud")}>
        ☁ Cloud
      </button>
      <button onClick={() => set("local")} className={pill(value === "local")}>
        💻 Local
      </button>
    </div>
  );
}
