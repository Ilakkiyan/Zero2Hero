// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatJSON, fetchWithRetry, getProvider } from "@/lib/llm";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getProvider", () => {
  it("honours an explicit valid provider name (case-insensitive)", () => {
    expect(getProvider("azure").name).toBe("azure");
    expect(getProvider("OLLAMA").name).toBe("ollama");
  });

  it("falls back to the env default for an unknown name", () => {
    vi.stubEnv("LLM_PROVIDER", "azure");
    expect(getProvider("nonsense").name).toBe("azure");
  });

  it("defaults to ollama when nothing is configured", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    expect(getProvider(undefined).name).toBe("ollama");
  });
});

describe("chatJSON", () => {
  it("strips ```json fences before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: '```json\n{"x":1,"y":"z"}\n```' } }),
      }),
    );
    const out = await chatJSON<{ x: number; y: string }>([{ role: "user", content: "hi" }], {
      provider: "ollama",
    });
    expect(out).toEqual({ x: 1, y: "z" });
  });
});

describe("fetchWithRetry", () => {
  it("returns immediately on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("http://x", {});
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, headers: new Headers(), body: undefined })
      .mockResolvedValueOnce({ status: 200, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("http://x", {}, 3);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable statuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 400, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("http://x", {});
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
