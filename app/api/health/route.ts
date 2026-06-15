import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Reports whether the local model backend is ready, so the first page can guide
 * setup. For Ollama: distinguishes "not running" from "running but model not
 * pulled" so the UI can show the right next step.
 */
export async function GET() {
  const provider = (process.env.LLM_PROVIDER || "ollama").toLowerCase();
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";

  // Non-local providers (gemini/azure) are always "ready" from a setup view.
  if (provider !== "ollama") {
    return NextResponse.json({ provider, local: false, ready: true, model });
  }

  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/tags`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ provider, local: true, ready: false, running: false, model });
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    // Match exact tag or same base name (qwen2.5:7b ↔ qwen2.5).
    const base0 = model.split(":")[0];
    const modelPulled = names.some((n) => n === model || n.split(":")[0] === base0);
    return NextResponse.json({
      provider,
      local: true,
      ready: modelPulled,
      running: true,
      modelPulled,
      model,
      models: names,
    });
  } catch {
    return NextResponse.json({ provider, local: true, ready: false, running: false, model });
  }
}
