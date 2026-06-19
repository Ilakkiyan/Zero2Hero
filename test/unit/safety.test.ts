import { describe, expect, it } from "vitest";
import { screenForHarm } from "@/lib/safety";

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
