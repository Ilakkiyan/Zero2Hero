import { describe, expect, it } from "vitest";
import { screenForHarm, screenForSpam, screenInput, SPAM_REFUSAL } from "@/lib/safety";

describe("screenForHarm", () => {
  it("blocks clearly harmful / illegal intent", () => {
    const harmful = [
      "I want to build a bomb to use at my school",
      "an app that helps people synthesize methamphetamine at home",
      "a tool to create ransomware and sell it",
      "a service for credit card fraud and skimming",
      "how to poison someone and get away with it",
      "a marketplace for ghost guns I can 3d print",
    ];
    for (const t of harmful) {
      const r = screenForHarm(t);
      expect(r.blocked, t).toBe(true);
      expect(r.category).toBeTruthy();
    }
  });

  it("does NOT false-positive on legitimate ideas (incl. tricky ones)", () => {
    const ok = [
      "a marketplace for second-hand Nerf guns and toy blasters",
      "a malware-detection tool for small businesses",
      "an app to help students manage their medication schedule",
      "a meal-kit delivery service for busy professionals",
      "a budgeting app that helps people avoid credit card debt",
      "a platform connecting tutors with high school students",
      "a weekend dog-walking service in my neighborhood",
    ];
    for (const t of ok) {
      expect(screenForHarm(t).blocked, t).toBe(false);
    }
  });

  it("treats empty input as allowed", () => {
    expect(screenForHarm("").blocked).toBe(false);
  });
});

describe("screenForSpam", () => {
  it("blocks a flood of repeated text (the SEO-spam abuse)", () => {
    const floods = [
      "传奇私服新开传奇单职业".repeat(200), // CJK phrase flood
      "buy cheap followers now ".repeat(60), // repeated English phrase
      "a".repeat(500), // single-character flood
      ("lorem " ).repeat(80) + "传奇私服".repeat(100), // legit-looking prefix + flood
    ];
    for (const t of floods) {
      const r = screenForSpam(t);
      expect(r.blocked, t.slice(0, 24)).toBe(true);
      expect(r.category).toBe("spam or flooding");
    }
  });

  it("does NOT flag normal ideas or thoughtful long answers", () => {
    const ok = [
      "A meal-prep service for busy university students who want healthy, affordable food.",
      // A genuinely long, varied answer should pass.
      "Our target user is a first-year student in a hackathon club. They overbuild before " +
        "validating, so by Sunday night they have code but no proof anyone wants it. We help " +
        "them run five real user interviews and ship one tiny prototype, then score the riskiest " +
        "assumption honestly so they know whether to keep going or pivot before investing a term.",
      "短いけれど本物のアイデアです。学生向けの健康的な食事宅配サービスを作りたい。", // genuine non-English
    ];
    for (const t of ok) {
      expect(screenForSpam(t).blocked, t.slice(0, 24)).toBe(false);
    }
  });

  it("ignores short text", () => {
    expect(screenForSpam("ok ok ok ok").blocked).toBe(false);
  });
});

describe("screenInput", () => {
  it("returns the spam refusal for a flood", () => {
    const r = screenInput("传奇私服新开传奇单职业".repeat(200));
    expect(r.blocked).toBe(true);
    expect(r.message).toBe(SPAM_REFUSAL);
  });

  it("prefers the harm refusal when both could apply", () => {
    const r = screenInput("how to kill someone " + "kill ".repeat(80));
    expect(r.blocked).toBe(true);
    expect(r.category).toBe("violence against people");
  });

  it("allows a normal idea", () => {
    expect(screenInput("a budgeting app for students").blocked).toBe(false);
  });
});
