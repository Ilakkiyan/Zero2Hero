import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StreamModal from "@/components/StreamModal";
import { errorResponse, ndjsonResponse } from "./stream";

afterEach(() => vi.unstubAllGlobals());

function renderModal(onClose = vi.fn()) {
  render(
    <StreamModal
      title="Draft for"
      subtitle="Run five interviews"
      endpoint="/api/draft"
      body={{ foo: "bar" }}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("StreamModal", () => {
  it("streams tokens into a copyable panel", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "token", value: "**Interview script**\n" },
          { type: "token", value: "1. Tell me about..." },
          { type: "done" },
        ]),
      ),
    );

    renderModal();
    expect(await screen.findByText(/Interview script/)).toBeInTheDocument();

    const copyBtn = await screen.findByRole("button", { name: /^copy$/i });
    await waitFor(() => expect(copyBtn).toBeEnabled());
    await userEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Interview script"));
  });

  it("renders an error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse("draft failed", 500)));
    renderModal();
    expect(await screen.findByText("draft failed")).toBeInTheDocument();
  });

  it("closes on the Close button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse([{ type: "done" }])));
    const onClose = renderModal();
    // Two controls expose the name "Close" (the ✕ icon's aria-label and the
    // footer button); click the footer button.
    const footerClose = screen
      .getAllByRole("button", { name: /^close$/i })
      .find((b) => b.textContent?.trim() === "Close");
    await userEvent.click(footerClose!);
    expect(onClose).toHaveBeenCalled();
  });
});
