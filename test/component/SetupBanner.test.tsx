import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SetupBanner from "@/components/SetupBanner";

function mockHealth(payload: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("SetupBanner", () => {
  it("collapses to a ready chip when the local model is ready", async () => {
    mockHealth({ provider: "ollama", local: true, ready: true, model: "qwen2.5:7b" });
    render(<SetupBanner provider="local" />);
    expect(await screen.findByText(/local model ready/i)).toBeInTheDocument();
    expect(screen.getByText(/qwen2\.5:7b/)).toBeInTheDocument();
  });

  it("shows Ollama install + pull steps when not running", async () => {
    mockHealth({ provider: "ollama", local: true, ready: false, running: false, model: "qwen2.5:7b" });
    render(<SetupBanner provider="local" />);
    expect(await screen.findByText(/run zero2hero fully locally/i)).toBeInTheDocument();
    expect(screen.getByText(/install & start ollama/i)).toBeInTheDocument();
    expect(screen.getByText(/ollama pull qwen2\.5:7b/i)).toBeInTheDocument();
  });

  it("points to Settings to configure Azure when cloud is not configured", async () => {
    mockHealth({ provider: "azure", local: false, ready: false, configured: false });
    render(<SetupBanner provider="cloud" />);
    expect(await screen.findByText(/connect azure openai/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open settings/i })).toHaveAttribute("href", "/settings");
  });

  it("shows the Azure ready chip with the deployment name", async () => {
    mockHealth({ provider: "azure", local: false, ready: true, configured: true, deployment: "gpt-4o-mini" });
    render(<SetupBanner provider="cloud" />);
    await waitFor(() => expect(screen.getByText(/azure ready/i)).toBeInTheDocument());
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument();
  });
});
