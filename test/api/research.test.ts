// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { researchEvents, validPlan } from "@/test/fixtures/plan";
import { collectNdjson, jsonRequest } from "@/test/helpers";
import type { ResearchEvent } from "@/lib/research";

const runAgenticResearch = vi.fn();
vi.mock("@/lib/research", () => ({
  runAgenticResearch: (...args: unknown[]) => runAgenticResearch(...args),
}));

import { POST } from "@/app/api/research/route";

const req = (body: unknown, headers?: Record<string, string>) =>
  jsonRequest("http://localhost/api/research", body, headers);

async function* emit(events: unknown[]): AsyncGenerator<ResearchEvent> {
  for (const e of events) yield e as ResearchEvent;
}

afterEach(() => runAgenticResearch.mockReset());

describe("POST /api/research", () => {
  it("streams research events and appends a done event", async () => {
    // Drop the fixture's own trailing done; the route appends its own.
    runAgenticResearch.mockReturnValueOnce(emit(researchEvents.filter((e) => e.type !== "done")));
    const res = await POST(req({ brief: validPlan.brief }));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "plan")).toBeTruthy();
    expect(events.filter((e) => e.type === "step_done")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("returns 400 for an invalid brief", async () => {
    const res = await POST(req({ brief: { problem: "missing the rest" } }));
    expect(res.status).toBe(400);
    expect(runAgenticResearch).not.toHaveBeenCalled();
  });

  it("uses the local backend (no Gemini key) by default", async () => {
    runAgenticResearch.mockReturnValueOnce(emit([{ type: "meta", backend: "local" }]));
    await POST(req({ brief: validPlan.brief }));
    expect(runAgenticResearch).toHaveBeenCalledWith(
      validPlan.brief,
      expect.objectContaining({ geminiKey: undefined }),
    );
  });

  it("passes the Gemini key through for the cloud backend", async () => {
    runAgenticResearch.mockReturnValueOnce(emit([{ type: "meta", backend: "cloud" }]));
    await POST(req({ brief: validPlan.brief }, { "x-gemini-key": "g-key" }));
    expect(runAgenticResearch).toHaveBeenCalledWith(
      validPlan.brief,
      expect.objectContaining({ geminiKey: "g-key" }),
    );
  });

  it("forwards the plan's assumptions (id/claim/risk) for evidence linking", async () => {
    runAgenticResearch.mockReturnValueOnce(emit([{ type: "meta", backend: "local" }]));
    await POST(req({ brief: validPlan.brief, assumptions: validPlan.assumptions }));
    const opts = runAgenticResearch.mock.calls[0][1];
    expect(opts.assumptions).toEqual(
      validPlan.assumptions.map((a) => ({ id: a.id, claim: a.claim, risk: a.risk })),
    );
  });

  it("tolerates a missing/!array assumptions field (defaults to empty)", async () => {
    runAgenticResearch.mockReturnValueOnce(emit([{ type: "meta", backend: "local" }]));
    await POST(req({ brief: validPlan.brief, assumptions: "nope" }));
    expect(runAgenticResearch.mock.calls[0][1].assumptions).toEqual([]);
  });

  it("emits an error event when the research generator throws", async () => {
    async function* boom(): AsyncGenerator<ResearchEvent> {
      yield { type: "meta", backend: "local" };
      throw new Error("searx down");
    }
    runAgenticResearch.mockReturnValueOnce(boom());
    const res = await POST(req({ brief: validPlan.brief }));
    const events = await collectNdjson(res);
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "searx down" });
  });
});
