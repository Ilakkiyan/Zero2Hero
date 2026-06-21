import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlanPanel from "@/components/PlanPanel";
import type { Plan, PlanEvent } from "@/lib/schema";
import { researchEvents, sampleEvidence, sampleHistory, validPlan } from "@/test/fixtures/plan";
import { ndjsonResponse } from "./stream";

const noop = () => {};

function renderPanel(
  props: Partial<{
    plan: Plan | null;
    history: PlanEvent[];
    onPlanChange: (p: Plan, m?: unknown) => void;
    onReplan: (n: string) => void;
    replanning: boolean;
  }> = {},
) {
  return render(
    <PlanPanel
      plan={"plan" in props ? (props.plan as Plan | null) : validPlan}
      history={props.history ?? []}
      onPlanChange={props.onPlanChange ?? noop}
      onReplan={props.onReplan ?? noop}
      replanning={props.replanning ?? false}
    />,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("PlanPanel", () => {
  it("shows the empty hint when there is no plan", () => {
    renderPanel({ plan: null });
    expect(screen.getByText(/your living plan appears here/i)).toBeInTheDocument();
  });

  it("renders the confidence dashboard from the plan", () => {
    renderPanel();
    // summarizeValidation(validPlan): confidence 62, 1/3 tested, 1 open high risk.
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("1/3 tested")).toBeInTheDocument();
  });

  it("renders the assumption tracker with status and risk", () => {
    renderPanel();
    // a2's claim is unique to its card (a1's also shows in the dashboard's "biggest unknown").
    expect(screen.getByText(validPlan.assumptions[1].claim)).toBeInTheDocument();
    // Its risk + cheap test render on the same line.
    expect(screen.getByText(/Time-box one team/)).toBeInTheDocument();
    // a2 is passed in the fixture — the status surfaces (badge + selected button).
    expect(screen.getAllByText("Passed").length).toBeGreaterThan(0);
  });

  it("renders the de-risking timeline when history is present", () => {
    renderPanel({ history: sampleHistory });
    expect(screen.getByText(/de-risking timeline/i)).toBeInTheDocument();
    // Net 50 → 71 = +21% overall.
    expect(screen.getByText(/\+21% overall/)).toBeInTheDocument();
  });

  it("marking an assumption failed reports status + timeline metadata", async () => {
    const onPlanChange = vi.fn();
    renderPanel({ onPlanChange });

    // First assumption card's status buttons; "Failed" is the 3rd of 4.
    await userEvent.click(screen.getAllByRole("button", { name: "Failed" })[0]);

    expect(onPlanChange).toHaveBeenCalledOnce();
    const [next, meta] = onPlanChange.mock.calls[0];
    expect(next.assumptions[0].status).toBe("failed");
    expect(typeof next.assumptions[0].updatedAt).toBe("string");
    expect(meta).toMatchObject({ kind: "status", assumptionId: "a1" });
  });

  it("commits the result note on blur, not per keystroke, and logs no timeline event", async () => {
    const onPlanChange = vi.fn();
    renderPanel({ onPlanChange });
    const input = screen.getAllByPlaceholderText(/what happened when you tested/i)[0];
    await userEvent.type(input, "people loved it");
    // Typing stays local — no workspace churn until the field is committed.
    expect(onPlanChange).not.toHaveBeenCalled();
    await userEvent.tab(); // blur → commit
    expect(onPlanChange).toHaveBeenCalledOnce();
    const [next, meta] = onPlanChange.mock.calls[0];
    expect(next.assumptions[0].resultNote).toBe("people loved it");
    expect(meta).toBeUndefined(); // no per-keystroke history spam
  });

  it("disables Replan-from-result for an untested assumption and fires it for a tested one", async () => {
    const onReplan = vi.fn();
    renderPanel({ onReplan });

    const replanButtons = screen.getAllByRole("button", { name: /replan from result/i });
    expect(replanButtons[0]).toBeDisabled(); // a1 untested
    expect(replanButtons[1]).toBeEnabled(); // a2 passed

    await userEvent.click(replanButtons[1]);
    expect(onReplan).toHaveBeenCalledOnce();
    expect(onReplan.mock.calls[0][0]).toMatch(/Assumption a2 was marked passed/);
  });

  it("submits a free-form reality update through onReplan", async () => {
    const onReplan = vi.fn();
    renderPanel({ onReplan });
    await userEvent.type(screen.getByPlaceholderText(/tried something/i), "users wanted X");
    await userEvent.click(screen.getByRole("button", { name: /update plan/i }));
    expect(onReplan).toHaveBeenCalledWith("users wanted X");
  });

  it("exposes the pitch export, pre-mortem and research entry points", () => {
    renderPanel();
    expect(screen.getByRole("link", { name: /export pitch/i })).toHaveAttribute("href", "/pitch");
    expect(screen.getByRole("button", { name: /pre-mortem/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /research/i })).toBeInTheDocument();
  });

  it("surfaces the decisive next move and drafts it on click", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse([{ type: "done" }])));
    renderPanel();
    expect(screen.getByText(/your next move/i)).toBeInTheDocument();
    // validPlan's riskiest open assumption drives the move (also shown in the
    // dashboard's "biggest unknown", so allow more than one match).
    expect(screen.getAllByText(/Students will interview strangers/).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /draft this step/i }));
    // The draft modal opens (StreamModal titled "Draft for").
    expect(await screen.findByText(/draft for/i)).toBeInTheDocument();
  });

  it("challenge → concede marks the assumption failed and re-plans", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse([{ type: "done" }])));
    const onPlanChange = vi.fn();
    const onReplan = vi.fn();
    renderPanel({ onPlanChange, onReplan });

    await userEvent.click(screen.getByRole("button", { name: /⚔️ challenge/i }));
    await screen.findByText(/adversarial cofounder/i);
    await userEvent.click(screen.getByRole("button", { name: /concede/i }));

    // The challenged assumption (a1, riskiest open) is marked failed + logged.
    const [next, meta] = onPlanChange.mock.calls.at(-1)!;
    const a1 = next.assumptions.find((a: { id: string }) => a.id === "a1");
    expect(a1.status).toBe("failed");
    expect(meta).toMatchObject({ kind: "status" });
    // And a re-plan is triggered from that concession.
    expect(onReplan).toHaveBeenCalledWith(expect.stringMatching(/Assumption a1 was marked failed/));
  });

  it("shows cited evidence on an assumption card", () => {
    const plan: Plan = {
      ...validPlan,
      assumptions: validPlan.assumptions.map((a) =>
        a.id === "a1" ? { ...a, evidence: sampleEvidence } : a,
      ),
    };
    renderPanel({ plan });
    expect(screen.getByText(/🔎 Evidence \(1\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Competitor A pricing/i })).toHaveAttribute(
      "href",
      "https://example.com/a",
    );
  });

  it("applies research evidence to the matching assumption and logs an evidence event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse(researchEvents)));
    const onPlanChange = vi.fn();
    renderPanel({ onPlanChange });

    await userEvent.click(screen.getByRole("button", { name: /🔎 research/i }));
    // The modal streams in the linked evidence.
    await screen.findByText(/evidence linked to your assumptions/i);
    await userEvent.click(screen.getByRole("button", { name: /apply 1 to plan/i }));

    const [next, meta] = onPlanChange.mock.calls.at(-1)!;
    const a1 = next.assumptions.find((a: { id: string }) => a.id === "a1");
    expect(a1.evidence).toHaveLength(1);
    expect(a1.evidence[0].source.uri).toBe("https://example.com/a");
    expect(a1.status).toBe("inconclusive"); // suggestedStatus from the link
    expect(meta).toMatchObject({ kind: "evidence" });
  });
});
