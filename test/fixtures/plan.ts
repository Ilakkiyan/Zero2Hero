import type { ChatMessage } from "@/lib/llm";
import type { Evidence, Plan, PlanEvent } from "@/lib/schema";

/**
 * Canonical fixtures shared across the suite. Keep these realistic — they double
 * as the deterministic stand-ins for what the LLM would return in CI.
 */

/** A short, already-de-risked interview transcript ending in READY_TO_PLAN. */
export const sampleTranscript: ChatMessage[] = [
  {
    role: "user",
    content:
      "I want to build an app that helps college students turn vague startup ideas into validated weekend projects.",
  },
  {
    role: "assistant",
    content:
      "The hidden assumption is that students want validation help more than motivation. Which specific student uses this first?",
  },
  {
    role: "user",
    content:
      "First-time student founders in hackathon clubs. By Sunday night they want a clear idea, a tiny prototype, and proof a few people care.",
  },
];

/** A fully-formed, schema-valid plan with assumption status fields present. */
export const validPlan: Plan = {
  brief: {
    problem: "Student founders overbuild before validating demand.",
    targetUser: "First-time student founders in hackathon clubs.",
    riskiestAssumption: "Students will do uncomfortable validation tasks.",
    definitionOfWin: "Five students validate with real users in one weekend.",
  },
  assumptions: [
    {
      id: "a1",
      claim: "Students will interview strangers if prompted.",
      risk: "high",
      cheapTest: "Ask 5 students to each run one user interview this week.",
      status: "untested",
      resultNote: "",
      updatedAt: null,
      evidence: [],
    },
    {
      id: "a2",
      claim: "A weekend is enough time to ship a tiny prototype.",
      risk: "med",
      cheapTest: "Time-box one team to a 48h prototype and observe.",
      status: "passed",
      resultNote: "Two teams shipped in under a day.",
      updatedAt: "2026-01-02T00:00:00.000Z",
      evidence: [],
    },
    {
      id: "a3",
      claim: "Clubs will adopt a new tool mid-semester.",
      risk: "low",
      cheapTest: "Pitch one club lead and see if they invite you to a meeting.",
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
      goal: "Run five real validation interviews.",
      validates: "a1",
      tasks: ["Recruit 5 students", "Write the interview script", "Run the interviews"],
      status: "todo",
    },
    {
      id: "m2",
      phase: "Days 3-5",
      goal: "Ship a clickable prototype.",
      validates: "a2",
      tasks: ["Sketch the core flow", "Build a clickable mock"],
      status: "todo",
    },
  ],
};

/**
 * A legacy plan from before assumption status tracking existed: no `status`,
 * `resultNote`, or `updatedAt` on assumptions; no `status` on milestones. The
 * schema's defaults must backfill these so old localStorage state still loads.
 */
export const legacyPlan = {
  brief: {
    problem: "Student founders overbuild before validating demand.",
    targetUser: "First-time student founders in hackathon clubs.",
    riskiestAssumption: "Students will do uncomfortable validation tasks.",
    definitionOfWin: "Five students validate with real users in one weekend.",
  },
  assumptions: [
    {
      id: "a1",
      claim: "Students will interview strangers if prompted.",
      risk: "high",
      cheapTest: "Ask 5 students to each run one user interview this week.",
    },
  ],
  milestones: [
    {
      id: "m1",
      phase: "Days 1-2",
      goal: "Run five real validation interviews.",
      validates: "a1",
      tasks: ["Recruit 5 students", "Run the interviews"],
    },
  ],
};

/** A plan whose assumptions are all high-risk and untested (worst-case scoring). */
export const riskyPlan: Plan = {
  ...validPlan,
  assumptions: validPlan.assumptions.map((a) => ({
    ...a,
    risk: "high",
    status: "untested",
    resultNote: "",
    updatedAt: null,
  })),
};

/** Raw NDJSON research events, as the /api/research route would emit them. */
export const researchEvents = [
  { type: "meta", backend: "local" as const },
  {
    type: "plan",
    questions: [
      "Who are the direct competitors for student validation tools?",
      "What do student founders dislike about existing tools?",
    ],
  },
  { type: "step", index: 0, question: "Who are the direct competitors for student validation tools?" },
  { type: "step_done", index: 0, sourceCount: 2 },
  { type: "step", index: 1, question: "What do student founders dislike about existing tools?" },
  { type: "step_done", index: 1, sourceCount: 1 },
  { type: "token", value: "## Similar products\n- Tool A\n" },
  { type: "token", value: "## Bottom line\nThe space is crowded but niche-open.\n" },
  {
    type: "evidence",
    links: [
      {
        assumptionId: "a1",
        stance: "undermines",
        snippet: "Three incumbents already bundle this for free.",
        source: { title: "Competitor A pricing", uri: "https://example.com/a" },
        suggestedStatus: "inconclusive",
      },
    ],
  },
  {
    type: "sources",
    value: [
      { title: "Competitor A", uri: "https://example.com/a" },
      { title: "Competitor B", uri: "https://example.com/b" },
    ],
  },
  { type: "done" },
];

/** Evidence links as the research stream emits them, for apply-flow tests. */
export const sampleEvidenceLinks = [
  {
    assumptionId: "a1",
    stance: "undermines" as const,
    snippet: "Three incumbents already bundle this for free.",
    source: { title: "Competitor A pricing", uri: "https://example.com/a" },
    suggestedStatus: "inconclusive" as const,
  },
  {
    assumptionId: "a3",
    stance: "supports" as const,
    snippet: "Clubs adopted two similar tools last semester.",
    source: { title: "Campus trends", uri: "https://example.com/c" },
    suggestedStatus: null,
  },
];

/** Created calendar events, as the Google Calendar API would return after sync. */
export const calendarMilestones = validPlan.milestones.map((m, i) => ({
  goal: m.goal,
  link: `https://calendar.google.com/event?id=evt${i + 1}`,
}));

/** A confidence trajectory for timeline tests: created → dipped → recovered. */
export const sampleHistory: PlanEvent[] = [
  { at: "2026-01-01T00:00:00.000Z", kind: "created", confidence: 50, label: "Plan generated", assumptionId: null },
  { at: "2026-01-01T01:00:00.000Z", kind: "status", confidence: 38, label: "Marked “a1” failed", assumptionId: "a1" },
  { at: "2026-01-01T02:00:00.000Z", kind: "replan", confidence: 55, label: "Re-planned from new evidence", assumptionId: null },
  { at: "2026-01-01T03:00:00.000Z", kind: "evidence", confidence: 71, label: "2 citations added to “a3”", assumptionId: "a3" },
];

/** A piece of cited evidence, as the Evidence Engine attaches it. */
export const sampleEvidence: Evidence[] = [
  {
    id: "e1",
    source: { title: "Competitor A pricing", uri: "https://example.com/a" },
    snippet: "Three incumbents already bundle this for free.",
    stance: "undermines",
    createdAt: "2026-01-01T03:00:00.000Z",
  },
];
