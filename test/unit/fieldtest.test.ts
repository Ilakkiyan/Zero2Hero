import { describe, expect, it } from "vitest";
import { parseFieldTestDesign, parseFieldTestResult } from "@/lib/fieldtest";

describe("parseFieldTestDesign", () => {
  const valid = {
    method: "10 DMs to target users",
    channel: "message",
    scale: "Message 10 people this week",
    why: "Direct read on demand at zero cost.",
    steps: ["Write the DM", "Send to 10", "Tally replies"],
    artifact: "Hey — building X for people like you. Would you use it? Why/why not?",
    proveIf: "4+ say yes with a concrete reason.",
    killIf: "Nobody bites.",
  };

  it("accepts a well-formed kit", () => {
    expect(parseFieldTestDesign(valid)?.channel).toBe("message");
  });

  it("rejects an unknown channel", () => {
    expect(parseFieldTestDesign({ ...valid, channel: "telepathy" })).toBeNull();
  });

  it("rejects a kit with no steps", () => {
    expect(parseFieldTestDesign({ ...valid, steps: [] })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseFieldTestDesign("nope")).toBeNull();
  });
});

describe("parseFieldTestResult", () => {
  it("accepts a result and defaults suggestedStatus to null", () => {
    const r = parseFieldTestResult({ stance: "neutral", summary: "mixed signals" });
    expect(r?.stance).toBe("neutral");
    expect(r?.suggestedStatus).toBeNull();
  });

  it("keeps an explicit suggested status", () => {
    const r = parseFieldTestResult({
      stance: "undermines",
      summary: "0 of 10 cared",
      suggestedStatus: "failed",
    });
    expect(r?.suggestedStatus).toBe("failed");
  });

  it("rejects an invalid stance", () => {
    expect(parseFieldTestResult({ stance: "maybe", summary: "x" })).toBeNull();
  });
});
