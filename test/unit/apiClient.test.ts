import { afterEach, describe, expect, it } from "vitest";
import {
  apiHeaders,
  clearGeminiKey,
  getGeminiKey,
  getProviderPref,
  setGeminiKey,
  setProviderPref,
} from "@/lib/apiClient";

afterEach(() => localStorage.clear());

describe("Gemini key storage", () => {
  it("round-trips and clears the key", () => {
    expect(getGeminiKey()).toBe("");
    setGeminiKey("g-abc");
    expect(getGeminiKey()).toBe("g-abc");
    clearGeminiKey();
    expect(getGeminiKey()).toBe("");
  });
});

describe("provider preference", () => {
  it("defaults to local", () => {
    expect(getProviderPref()).toBe("local");
  });

  it("persists a cloud preference", () => {
    setProviderPref("cloud");
    expect(getProviderPref()).toBe("cloud");
  });

  it("treats any non-cloud value as local", () => {
    localStorage.setItem("z2h_provider", "garbage");
    expect(getProviderPref()).toBe("local");
  });
});

describe("apiHeaders", () => {
  it("sends x-llm-provider: ollama for the local preference", () => {
    setProviderPref("local");
    expect(apiHeaders()).toMatchObject({
      "Content-Type": "application/json",
      "x-llm-provider": "ollama",
    });
  });

  it("sends x-llm-provider: azure for the cloud preference", () => {
    setProviderPref("cloud");
    expect(apiHeaders()).toMatchObject({ "x-llm-provider": "azure" });
  });

  it("omits x-gemini-key when no key is set, includes it when set", () => {
    setProviderPref("local");
    expect(apiHeaders()).not.toHaveProperty("x-gemini-key");
    setGeminiKey("g-xyz");
    expect(apiHeaders()).toMatchObject({ "x-gemini-key": "g-xyz" });
  });
});
