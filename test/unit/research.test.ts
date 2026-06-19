// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { validPlan } from "@/test/fixtures/plan";
import type { ResearchEvent } from "@/lib/research";

const chatJSON = vi.fn();
const chatStream = vi.fn();
const fetchWithRetry = vi.fn();
vi.mock("@/lib/llm", () => ({
  chatJSON: (...a: unknown[]) => chatJSON(...a),
  chatStream: (...a: unknown[]) => chatStream(...a),
  fetchWithRetry: (...a: unknown[]) => fetchWithRetry(...a),
}));

import { runAgenticResearch } from "@/lib/research";

async function* synth(chunks: string[]): AsyncGenerator<string> {
  for (const c of chunks) yield c;
}

async function collect(gen: AsyncGenerator<ResearchEvent>): Promise<ResearchEvent[]> {
  const out: ResearchEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

afterEach(() => {
  chatJSON.mockReset();
  chatStream.mockReset();
  fetchWithRetry.mockReset();
});

describe("runAgenticResearch — local (SearxNG)", () => {
  it("plans, searches SearxNG, and synthesizes with local sources", async () => {
    chatJSON.mockResolvedValueOnce({ questions: ["q1", "q2"] });
    fetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: "https://a.com", title: "A", content: "about a" }],
      }),
    });
    chatStream.mockReturnValueOnce(synth(["## Bottom line\nopen niche\n"]));

    const events = await collect(runAgenticResearch(validPlan.brief));

    expect(events[0]).toEqual({ type: "meta", backend: "local" });
    expect(events.find((e) => e.type === "plan")).toMatchObject({ questions: ["q1", "q2"] });
    expect(events.filter((e) => e.type === "step_done")).toHaveLength(2);
    const text = events.filter((e) => e.type === "token").map((e: any) => e.value).join("");
    expect(text).toContain("Bottom line");
    const sources = events.find((e) => e.type === "sources") as any;
    expect(sources.value[0].uri).toBe("https://a.com");
    // The SearxNG JSON search endpoint was hit.
    expect(fetchWithRetry.mock.calls[0][0]).toContain("/search?q=");
  });

  it("falls back to default questions when planning fails", async () => {
    chatJSON.mockRejectedValueOnce(new Error("bad json"));
    fetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    chatStream.mockReturnValueOnce(synth(["done"]));

    const events = await collect(runAgenticResearch(validPlan.brief));
    const plan = events.find((e) => e.type === "plan") as any;
    expect(plan.questions).toHaveLength(4);
  });

  it("throws when the very first search fails (backend down)", async () => {
    chatJSON.mockResolvedValueOnce({ questions: ["q1"] });
    fetchWithRetry.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(collect(runAgenticResearch(validPlan.brief))).rejects.toThrow(/SearxNG not reachable/);
  });
});

describe("runAgenticResearch — Evidence Engine", () => {
  const assumptions = [{ id: "a1", claim: "Users will pay", risk: "high" }];

  it("maps findings onto assumptions and emits an evidence event", async () => {
    chatJSON
      .mockResolvedValueOnce({ questions: ["q1"] }) // plan
      .mockResolvedValueOnce({
        links: [
          {
            assumptionId: "a1",
            stance: "undermines",
            snippet: "incumbents bundle it free",
            sourceTitle: "Comp A",
            sourceUri: "https://comp.example/a",
            suggestedStatus: "inconclusive",
          },
        ],
      }); // evidence map
    fetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ url: "https://a.com", title: "A", content: "x" }] }),
    });
    chatStream.mockReturnValueOnce(synth(["brief"]));

    const events = await collect(runAgenticResearch(validPlan.brief, { assumptions }));
    const evidence = events.find((e) => e.type === "evidence") as any;
    expect(evidence.links).toHaveLength(1);
    expect(evidence.links[0]).toMatchObject({
      assumptionId: "a1",
      stance: "undermines",
      suggestedStatus: "inconclusive",
      source: { uri: "https://comp.example/a" },
    });
  });

  it("drops links with unknown ids, bad stances, or non-URL sources", async () => {
    chatJSON
      .mockResolvedValueOnce({ questions: ["q1"] })
      .mockResolvedValueOnce({
        links: [
          { assumptionId: "ghost", stance: "undermines", sourceUri: "https://x.com" }, // unknown id
          { assumptionId: "a1", stance: "maybe", sourceUri: "https://x.com" }, // bad stance
          { assumptionId: "a1", stance: "supports", sourceUri: "not-a-url" }, // bad uri
          { assumptionId: "a1", stance: "supports", snippet: "ok", sourceUri: "https://ok.com" }, // keeper
        ],
      });
    fetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    chatStream.mockReturnValueOnce(synth(["brief"]));

    const events = await collect(runAgenticResearch(validPlan.brief, { assumptions }));
    const evidence = events.find((e) => e.type === "evidence") as any;
    expect(evidence.links).toHaveLength(1);
    expect(evidence.links[0].source.uri).toBe("https://ok.com");
    expect(evidence.links[0].suggestedStatus).toBeNull();
  });

  it("emits no evidence event when no assumptions are passed", async () => {
    chatJSON.mockResolvedValueOnce({ questions: ["q1"] });
    fetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    chatStream.mockReturnValueOnce(synth(["brief"]));

    const events = await collect(runAgenticResearch(validPlan.brief));
    expect(events.find((e) => e.type === "evidence")).toBeUndefined();
  });
});
