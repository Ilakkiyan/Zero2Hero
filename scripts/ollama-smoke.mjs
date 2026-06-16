const shouldRun = process.env.RUN_LOCAL_LLM === "1";
const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";

if (!shouldRun) {
  console.log("Skipping local LLM smoke. Set RUN_LOCAL_LLM=1 to run it.");
  process.exit(0);
}

const tags = await fetch(`${base.replace(/\/$/, "")}/api/tags`).catch((err) => {
  throw new Error(`Ollama is not reachable at ${base}: ${err.message}`);
});

if (!tags.ok) {
  throw new Error(`Ollama tags check failed: ${tags.status} ${await tags.text()}`);
}

const data = await tags.json();
const names = (data.models || []).map((m) => m.name);
const baseName = model.split(":")[0];
const hasModel = names.some((name) => name === model || name.split(":")[0] === baseName);

if (!hasModel) {
  throw new Error(`Model ${model} is not pulled. Run: ollama pull ${model}`);
}

const res = await fetch(`${base.replace(/\/$/, "")}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    stream: false,
    messages: [{ role: "user", content: "Reply with exactly: Zero2Hero local OK" }],
    options: { temperature: 0 },
  }),
});

if (!res.ok) {
  throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
}

const body = await res.json();
const text = String(body.message?.content || "").trim();
if (!text) {
  throw new Error("Ollama returned an empty response.");
}

console.log(`Local LLM smoke passed with ${model}: ${text}`);
