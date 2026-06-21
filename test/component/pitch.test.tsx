import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PitchPage from "@/app/pitch/page";
import { validPlan } from "@/test/fixtures/plan";

/** Legacy single-session shape (pre-workspace builds). */
function seedPlan(plan: unknown) {
  localStorage.setItem("z2h_state", JSON.stringify({ messages: [], plan, readyToPlan: true }));
}

/** Current shape: a multi-project workspace with `plan` on the active project. */
function seedWorkspace(plan: unknown, { active = true }: { active?: boolean } = {}) {
  const target = { id: "p2", name: "Idea", createdAt: "", messages: [], readyToPlan: true, plan, history: [] };
  const other = { id: "p1", name: "Other", createdAt: "", messages: [], readyToPlan: false, plan: null, history: [] };
  localStorage.setItem(
    "z2h_workspace",
    JSON.stringify({ projects: [other, target], activeId: active ? "p2" : "p1", sharedContext: "" }),
  );
}

beforeEach(() => localStorage.clear());

describe("Pitch page", () => {
  it("invites the user to build a plan when none is stored", async () => {
    render(<PitchPage />);
    expect(await screen.findByText(/no plan yet/i)).toBeInTheDocument();
  });

  it("renders the active project's plan from the workspace", async () => {
    seedWorkspace(validPlan);
    render(<PitchPage />);
    expect(await screen.findByText("62%")).toBeInTheDocument();
    expect(screen.getByText(validPlan.brief.riskiestAssumption)).toBeInTheDocument();
    expect(screen.getByText(validPlan.milestones[0].goal)).toBeInTheDocument();
  });

  it("shows no plan when the active project has none, even if another project does", async () => {
    seedWorkspace(validPlan, { active: false });
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
