// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  draftUserMessage,
  premortemUserMessage,
  replanUserMessage,
  researchPlanMessage,
  researchSynthesisMessage,
} from "@/lib/prompts";
import { validPlan } from "@/test/fixtures/plan";

describe("prompt helpers", () => {
  it("draftUserMessage includes the brief and every milestone task", () => {
    const msg = draftUserMessage(validPlan.brief, validPlan.milestones[0]);
    expect(msg).toContain(validPlan.brief.problem);
    expect(msg).toContain(validPlan.brief.definitionOfWin);
    for (const task of validPlan.milestones[0].tasks) {
      expect(msg).toContain(task);
    }
  });

  it("replanUserMessage embeds the current plan JSON and the user's note", () => {
    const msg = replanUserMessage(validPlan, "the landing page got no signups");
    expect(msg).toContain("the landing page got no signups");
    expect(msg).toContain(validPlan.brief.problem);
    expect(msg).toContain('"id": "a1"');
  });

  it("premortemUserMessage embeds the full plan JSON", () => {
    const msg = premortemUserMessage(validPlan);
    expect(msg).toContain(validPlan.brief.riskiestAssumption);
    expect(msg).toContain('"milestones"');
  });

  it("researchPlanMessage asks for exactly 4 questions about this idea", () => {
    const msg = researchPlanMessage(validPlan.brief);
    expect(msg).toContain("exactly 4");
    expect(msg).toContain(validPlan.brief.problem);
    expect(msg).toContain(validPlan.brief.targetUser);
  });

  it("researchSynthesisMessage numbers each finding and keeps its text", () => {
    const msg = researchSynthesisMessage(validPlan.brief, [
      { question: "Who competes?", text: "Tool A, Tool B" },
      { question: "What's missing?", text: "Mobile support" },
    ]);
    expect(msg).toContain("### 1. Who competes?");
    expect(msg).toContain("Tool A, Tool B");
    expect(msg).toContain("### 2. What's missing?");
    expect(msg).toContain("## Bottom line");
  });
});
