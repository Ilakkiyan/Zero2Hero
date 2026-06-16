import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end demo flow with every API route mocked so CI stays deterministic
 * and offline. Exercises: load sample → generate plan → mark assumption failed
 * → replan from result → persist across reload → open the pitch one-pager.
 */

const planV1 = {
  brief: {
    problem: "Student founders overbuild before validating demand.",
    targetUser: "First-time student founders in hackathon clubs.",
    riskiestAssumption: "Students will do uncomfortable validation work.",
    definitionOfWin: "Five students validate with real users in one weekend.",
  },
  assumptions: [
    {
      id: "a1",
      claim: "Users will pay for weekend validation help.",
      risk: "high",
      cheapTest: "Run five paid pilots this week.",
      status: "untested",
      resultNote: "",
      updatedAt: null,
      evidence: [],
    },
    {
      id: "a2",
      claim: "A weekend is enough time to ship a tiny prototype.",
      risk: "med",
      cheapTest: "Time-box one team to a 48h build.",
      status: "untested",
      resultNote: "",
      updatedAt: null,
      evidence: [],
    },
  ],
  milestones: [
    {
      id: "m1",
      phase: "Days 1-2",
      goal: "Run five validation interviews.",
      validates: "a1",
      tasks: ["Recruit five students", "Run the interviews"],
      status: "todo",
    },
  ],
};

const planV2 = {
  ...planV1,
  brief: { ...planV1.brief, riskiestAssumption: "Pricing is the real blocker." },
  assumptions: [
    { ...planV1.assumptions[0], status: "failed", resultNote: "Nobody paid.", updatedAt: "2026-01-01T00:00:00.000Z" },
    planV1.assumptions[1],
  ],
  milestones: [
    { ...planV1.milestones[0], goal: "Recruit three paying design partners." },
  ],
};

/** Serialise objects as an NDJSON stream body (what the streaming routes emit). */
function ndjson(events: unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

async function mockApi(page: Page) {
  await page.route("**/api/health**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ provider: "ollama", local: true, ready: true, model: "qwen2.5:7b" }),
    }),
  );
  await page.route("**/api/plan", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ plan: planV1 }) }),
  );
  await page.route("**/api/replan", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ plan: planV2 }) }),
  );
  await page.route("**/api/challenge", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson([
        { type: "token", value: "Incumbents already bundle this for free — why would anyone pay?" },
        { type: "done" },
      ]),
    }),
  );
  await page.route("**/api/research", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson([
        { type: "meta", backend: "local" },
        { type: "plan", questions: ["Who competes?"] },
        { type: "step", index: 0, question: "Who competes?" },
        { type: "step_done", index: 0, sourceCount: 1 },
        { type: "token", value: "## Bottom line\nNiche is open.\n" },
        {
          type: "evidence",
          links: [
            {
              assumptionId: "a2",
              stance: "supports",
              snippet: "Two teams shipped working prototypes in a weekend.",
              source: { title: "Hackathon recap", uri: "https://example.com/recap" },
              suggestedStatus: "passed",
            },
          ],
        },
        { type: "sources", value: [{ title: "Hackathon recap", uri: "https://example.com/recap" }] },
        { type: "done" },
      ]),
    }),
  );
}

test("idea → plan → validate → replan → persist → pitch", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  // 1. Load the sample idea, then generate the (mocked) plan.
  await page.getByRole("button", { name: /load sample idea/i }).click();
  await page.getByRole("button", { name: /generate execution plan/i }).click();

  // 2. Plan renders: confidence dashboard + first assumption (the claim also
  // appears in the dashboard's "biggest unknown", so scope to the first match).
  await expect(page.getByText("Confidence").first()).toBeVisible();
  await expect(page.getByText("Users will pay for weekend validation help.").first()).toBeVisible();

  // 3. Mark the first assumption failed → its "Replan from result" enables.
  await page.getByRole("button", { name: "Failed" }).first().click();
  const replanBtn = page.getByRole("button", { name: /replan from result/i }).first();
  await expect(replanBtn).toBeEnabled();

  // 4. Replan from that result → the plan updates to V2.
  await replanBtn.click();
  await expect(page.getByText("Recruit three paying design partners.")).toBeVisible();

  // 5. Persist across reload — the revised plan rehydrates from localStorage.
  await page.reload();
  await expect(page.getByText("Recruit three paying design partners.")).toBeVisible();

  // 6. Open the pitch one-pager — confidence + validation progress show.
  await page.goto("/pitch");
  await expect(page.getByText("Pricing is the real blocker.")).toBeVisible();
  await expect(page.getByText(/assumptions tested/i)).toBeVisible();
});

test("WOW arc: next move → challenge → concede → research evidence → timeline", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /load sample idea/i }).click();
  await page.getByRole("button", { name: /generate execution plan/i }).click();

  // Decisive next move surfaces.
  await expect(page.getByText(/your next move/i)).toBeVisible();

  // Adversarial cofounder argues, then we concede → it re-plans to V2.
  await page.getByRole("button", { name: /⚔️ challenge/i }).click();
  await expect(page.getByText(/adversarial cofounder/i)).toBeVisible();
  await expect(page.getByText(/Incumbents already bundle this for free/)).toBeVisible();
  await page.getByRole("button", { name: /concede/i }).click();
  await expect(page.getByText("Recruit three paying design partners.")).toBeVisible();

  // The de-risking timeline is now live (created → concede → re-plan).
  await expect(page.getByText(/de-risking timeline/i)).toBeVisible();
  await expect(page.getByText(/overall/)).toBeVisible();

  // Research links cited evidence back onto an assumption; apply it.
  await page.getByRole("button", { name: /🔎 research/i }).click();
  await expect(page.getByText(/evidence linked to your assumptions/i)).toBeVisible();
  await page.getByRole("button", { name: /apply 1 to plan/i }).click();
  await expect(page.getByRole("button", { name: /applied to plan/i })).toBeVisible();
  await page.keyboard.press("Escape"); // close the research modal

  // The citation now lives on the assumption card.
  await expect(page.getByText(/🔎 Evidence \(1\)/).first()).toBeVisible();

  // Pitch one-pager carries the trajectory.
  await page.goto("/pitch");
  await expect(page.getByText(/de-risking timeline/i)).toBeVisible();
});

test("validation progress and confidence appear on the plan dashboard", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /load sample idea/i }).click();
  await page.getByRole("button", { name: /generate execution plan/i }).click();

  // The confidence percentage and the tested-count progress are both visible.
  await expect(page.getByText(/%$/).first()).toBeVisible();
  await expect(page.getByText(/\d+\/\d+ tested/).first()).toBeVisible();
});
