import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PitchPage from "@/app/pitch/page";
import { validPlan } from "@/test/fixtures/plan";

function seedPlan(plan: unknown) {
  localStorage.setItem("z2h_state", JSON.stringify({ messages: [], plan, readyToPlan: true }));
}

describe("Pitch page", () => {
  it("invites the user to build a plan when none is stored", async () => {
    render(<PitchPage />);
    expect(await screen.findByText(/no plan yet/i)).toBeInTheDocument();
  });

  it("renders the one-pager from the stored plan", async () => {
    seedPlan(validPlan);
    render(<PitchPage />);

    // Confidence + validation progress (summarizeValidation: 62%, 1/3 tested).
    expect(await screen.findByText("62%")).toBeInTheDocument();
    expect(screen.getByText(/1\/3 assumptions tested/i)).toBeInTheDocument();

    // Next validation action = highest-risk open assumption's cheap test.
    expect(screen.getByText(validPlan.assumptions[0].cheapTest)).toBeInTheDocument();

    // Riskiest assumption + a status + a result note all surface.
    expect(screen.getByText(validPlan.brief.riskiestAssumption)).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText(/Two teams shipped in under a day/)).toBeInTheDocument();

    // Milestones render.
    expect(screen.getByText(validPlan.milestones[0].goal)).toBeInTheDocument();
  });

  it("backfills a legacy stored plan and still renders", async () => {
    seedPlan({
      brief: validPlan.brief,
      assumptions: [{ id: "a1", claim: "legacy claim", risk: "high", cheapTest: "cheap test" }],
      milestones: [{ id: "m1", phase: "P1", goal: "legacy goal", validates: null, tasks: ["t"] }],
    });
    render(<PitchPage />);
    expect(await screen.findByText("legacy claim")).toBeInTheDocument();
    // No status field in storage → defaulted to Untested by the schema.
    expect(screen.getByText("Untested")).toBeInTheDocument();
  });
});
