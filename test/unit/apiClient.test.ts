import { afterEach, describe, expect, it } from "vitest";
import {
  apiHeaders,
  getProviderPref,
  isAzureConfigured,
  setAzureApiKey,
  setAzureEndpoint,
  setModelOverride,
  setProviderPref,
} from "@/lib/apiClient";

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

  it("forwards Azure endpoint + key headers only on the cloud preference", () => {
    setAzureEndpoint("https://x.openai.azure.com");
    setAzureApiKey("secret-key");

    setProviderPref("local");
    expect(apiHeaders()).not.toHaveProperty("x-azure-endpoint");

    setProviderPref("cloud");
    expect(apiHeaders()).toMatchObject({
      "x-llm-provider": "azure",
      "x-azure-endpoint": "https://x.openai.azure.com",
      "x-azure-key": "secret-key",
    });
  });
});

describe("isAzureConfigured", () => {
  it("is true only once endpoint, key, and deployment are all set", () => {
    expect(isAzureConfigured()).toBe(false);
    setAzureEndpoint("https://x.openai.azure.com");
    setAzureApiKey("k");
    expect(isAzureConfigured()).toBe(false); // deployment (model override) still missing
    setModelOverride("azure", "gpt-4o-mini");
    expect(isAzureConfigured()).toBe(true);
  });
});
