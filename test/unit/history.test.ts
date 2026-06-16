// @vitest-environment node
import { describe, expect, it } from "vitest";
import { appendEvent, confidenceSeries, deltaAt, makeEvent, netDelta } from "@/lib/history";
import { sampleHistory } from "@/test/fixtures/plan";

describe("history helpers", () => {
  it("makeEvent stamps a timestamp and the given fields", () => {
    const e = makeEvent("status", 64, "Marked a1 failed", "a1");
    expect(e).toMatchObject({ kind: "status", confidence: 64, label: "Marked a1 failed", assumptionId: "a1" });
    expect(typeof e.at).toBe("string");
    expect(Number.isNaN(Date.parse(e.at))).toBe(false);
  });

  it("makeEvent defaults assumptionId to null", () => {
    expect(makeEvent("created", 50, "Plan generated").assumptionId).toBeNull();
  });

  it("appendEvent adds to the end and caps the log length", () => {
    let h = sampleHistory;
    for (let i = 0; i < 200; i++) h = appendEvent(h, makeEvent("status", i % 100, `e${i}`));
    expect(h.length).toBeLessThanOrEqual(100);
    expect(h[h.length - 1].label).toBe("e199");
  });

  it("confidenceSeries returns just the confidence numbers", () => {
    expect(confidenceSeries(sampleHistory)).toEqual([50, 38, 55, 71]);
  });

  it("deltaAt is the signed step from the previous event (0 at the start)", () => {
    expect(deltaAt(sampleHistory, 0)).toBe(0);
    expect(deltaAt(sampleHistory, 1)).toBe(-12);
    expect(deltaAt(sampleHistory, 2)).toBe(17);
  });

  it("netDelta is first → last, and 0 for <2 events", () => {
    expect(netDelta(sampleHistory)).toBe(21);
    expect(netDelta([])).toBe(0);
    expect(netDelta([sampleHistory[0]])).toBe(0);
  });
});
