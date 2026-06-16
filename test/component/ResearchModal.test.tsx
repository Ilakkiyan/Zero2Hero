import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResearchModal from "@/components/ResearchModal";
import { researchEvents, validPlan } from "@/test/fixtures/plan";
import { errorResponse, ndjsonResponse } from "./stream";

afterEach(() => vi.unstubAllGlobals());

describe("ResearchModal", () => {
  it("renders the research plan, synthesized brief, sources, and backend label", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse(researchEvents)));
    render(<ResearchModal brief={validPlan.brief} onClose={() => {}} />);

    // Research plan questions appear.
    expect(
      await screen.findByText(/Who are the direct competitors for student validation tools\?/i),
    ).toBeInTheDocument();
    // Local backend label.
    expect(screen.getByText(/local · SearxNG/i)).toBeInTheDocument();
    // Synthesized brief text streamed in.
    expect(screen.getByText(/Bottom line/i)).toBeInTheDocument();
    // Sources rendered as links.
    const link = await screen.findByRole("link", { name: "Competitor A" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
  });

  it("shows the cloud backend label when grounding is used", async () => {
    const events = [{ type: "meta", backend: "cloud" }, { type: "plan", questions: ["q1"] }, { type: "done" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse(events)));
    render(<ResearchModal brief={validPlan.brief} onClose={() => {}} />);
    expect(await screen.findByText(/cloud · Gemini/i)).toBeInTheDocument();
  });

  it("surfaces an error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse("searx down", 500)));
    render(<ResearchModal brief={validPlan.brief} onClose={() => {}} />);
    expect(await screen.findByText("searx down")).toBeInTheDocument();
  });

  it("renders linked evidence and applies it to the plan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse(researchEvents)));
    const onApplyEvidence = vi.fn();
    render(
      <ResearchModal
        brief={validPlan.brief}
        assumptions={validPlan.assumptions.map((a) => ({ id: a.id, claim: a.claim, risk: a.risk }))}
        onApplyEvidence={onApplyEvidence}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByText(/evidence linked to your assumptions/i)).toBeInTheDocument();
    expect(screen.getByText(/Three incumbents already bundle this for free/)).toBeInTheDocument();
    expect(screen.getByText(/suggests/i)).toHaveTextContent(/inconclusive/i);

    await userEvent.click(screen.getByRole("button", { name: /apply 1 to plan/i }));
    expect(onApplyEvidence).toHaveBeenCalledOnce();
    expect(onApplyEvidence.mock.calls[0][0][0]).toMatchObject({ assumptionId: "a1", stance: "undermines" });
    expect(screen.getByRole("button", { name: /applied to plan/i })).toBeInTheDocument();
  });
});
