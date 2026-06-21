// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

const get = (provider?: string) =>
  GET(new NextRequest(`http://localhost/api/health${provider ? `?provider=${provider}` : ""}`));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports Azure as not configured when env vars are absent", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "");
    const data = await (await get("azure")).json();
    expect(data).toMatchObject({ provider: "azure", local: false, ready: false, configured: false });
  });

  it("reports Azure as ready when all credentials are present", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://x.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "key");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini");
    const data = await (await get("azure")).json();
    expect(data).toMatchObject({ provider: "azure", ready: true, deployment: "gpt-4o-mini" });
  });

  it("reports Ollama not running when /api/tags is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const data = await (await get("ollama")).json();
    expect(data).toMatchObject({ provider: "ollama", local: true, ready: false, running: false });
  });

  it("reports the model as pulled when Ollama lists it", async () => {
    vi.stubEnv("OLLAMA_MODEL", "qwen2.5:7b");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: "qwen2.5:7b" }] }),
      }),
    );
    const data = await (await get("ollama")).json();
    expect(data).toMatchObject({ provider: "ollama", running: true, modelPulled: true, ready: true });
  });

  it("reports the model as missing when Ollama is up but the model is absent", async () => {
    vi.stubEnv("OLLAMA_MODEL", "qwen2.5:7b");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: "llama3:8b" }] }) }),
    );
    const data = await (await get("ollama")).json();
    expect(data).toMatchObject({ running: true, modelPulled: false, ready: false });
  });

  it("autodetects the installed model when none is explicitly chosen", async () => {
    vi.stubEnv("OLLAMA_MODEL", ""); // no configured default → falls back to qwen2.5:7b
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: "qwen2.5:14b" }] }) }),
    );
    const data = await (await get("ollama")).json();
    // 7b isn't installed but a qwen2.5 variant is → report the installed one, ready.
    expect(data).toMatchObject({ modelPulled: true, ready: true, model: "qwen2.5:14b" });
  });

  it("honours an explicit ?model= choice and marks it unpulled if absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: "qwen2.5:7b" }] }) }),
    );
    const res = await GET(
      new NextRequest("http://localhost/api/health?provider=ollama&model=qwen2.5:14b"),
    );
    const data = await res.json();
    // Explicit 14b chosen but only 7b installed → show 14b, not ready.
    expect(data).toMatchObject({ model: "qwen2.5:14b", modelPulled: false, ready: false });
  });
});
