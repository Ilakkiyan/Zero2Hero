import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Reports whether the selected model backend is ready, so the first page can
 * guide setup. Pass ?provider=azure|ollama to check a specific one (the UI
 * toggle does this). Ollama: distinguishes "not running" from "model not
 * pulled". Azure: reports whether the credentials are configured.
 */
export async function GET(req: NextRequest) {
  const want = (
    new URL(req.url).searchParams.get("provider") ||
    process.env.LLM_PROVIDER ||
    "ollama"
  ).toLowerCase();

  if (want === "azure") {
    const configured = !!(
      process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY &&
      process.env.AZURE_OPENAI_DEPLOYMENT
    );
    return NextResponse.json({
      provider: "azure",
      local: false,
      ready: configured,
      configured,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || null,
    });
  }

  if (want !== "ollama") {
    // gemini or anything else — treat as a configured remote provider.
    return NextResponse.json({ provider: want, local: false, ready: true });
  }

  const model = process.env.OLLAMA_MODEL || "qwen3:30b-a3b";
  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/tags`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ provider: "ollama", local: true, ready: false, running: false, model });
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    const base0 = model.split(":")[0];
    const modelPulled = names.some((n) => n === model || n.split(":")[0] === base0);
    return NextResponse.json({
      provider: "ollama",
      local: true,
      ready: modelPulled,
      running: true,
      modelPulled,
      model,
      models: names,
    });
  } catch {
    return NextResponse.json({ provider: "ollama", local: true, ready: false, running: false, model });
  }
}
