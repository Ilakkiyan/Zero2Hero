import { afterEach, describe, expect, it } from "vitest";
import { apiHeaders, getProviderPref, setProviderPref } from "@/lib/apiClient";

afterEach(() => localStorage.clear());

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

  it("never sends a third-party key header", () => {
    setProviderPref("local");
    expect(apiHeaders()).not.toHaveProperty("x-gemini-key");
  });
});
