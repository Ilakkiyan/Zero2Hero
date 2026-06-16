"use client";

import { useEffect, useState } from "react";
import InterviewPanel from "@/components/InterviewPanel";
import PlanPanel from "@/components/PlanPanel";
import ThemeToggle from "@/components/ThemeToggle";
import ApiKeyButton from "@/components/ApiKeyButton";
import SetupBanner from "@/components/SetupBanner";
import ProviderToggle from "@/components/ProviderToggle";
import { apiHeaders, getProviderPref, type ProviderPref } from "@/lib/apiClient";
import type { ChatMessage } from "@/lib/llm";
import { PlanSchema, PlanEventSchema, type Plan, type PlanEvent } from "@/lib/schema";
import { summarizeValidation } from "@/lib/validation";
import { appendEvent, makeEvent, type PlanChangeMeta } from "@/lib/history";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readyToPlan, setReadyToPlan] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [history, setHistory] = useState<PlanEvent[]>([]);
  const [planning, setPlanning] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [providerPref, setProviderPref] = useState<ProviderPref>("local");

  useEffect(() => {
    setProviderPref(getProviderPref());
  }, []);

  // Persist session so a reload (or the Google OAuth redirect) doesn't wipe it.
  const STORAGE_KEY = "z2h_state";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.messages)) setMessages(s.messages);
        if (s.plan) {
          const parsed = PlanSchema.safeParse(s.plan);
          if (parsed.success) setPlan(parsed.data);
        }
        if (Array.isArray(s.history)) {
          const parsed = PlanEventSchema.array().safeParse(s.history);
          if (parsed.success) setHistory(parsed.data);
        }
        if (s.readyToPlan) setReadyToPlan(true);
      }
    } catch {
      /* ignore corrupt/blocked storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't overwrite storage with empty initial state
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, plan, readyToPlan, history }));
    } catch {
      /* storage full/blocked — non-fatal */
    }
  }, [hydrated, messages, plan, readyToPlan, history]);

  /**
   * Single funnel for plan changes so the de-risking timeline stays in sync.
   * `meta` (when present) logs why the plan changed, snapshotting the confidence
   * that results from the change.
   */
  function applyPlan(next: Plan, meta?: PlanChangeMeta) {
    setPlan(next);
    if (meta) {
      const confidence = summarizeValidation(next).confidence;
      setHistory((h) => appendEvent(h, makeEvent(meta.kind, confidence, meta.label, meta.assumptionId ?? null)));
    }
  }

  async function generatePlan() {
    setPlanning(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (res.ok) {
        setPlan(data.plan);
        // A fresh plan starts a fresh trajectory.
        setHistory([makeEvent("created", summarizeValidation(data.plan).confidence, "Plan generated")]);
      } else console.error("Plan error:", data);
    } finally {
      setPlanning(false);
    }
  }

  async function replan(note: string) {
    if (!plan) return;
    setReplanning(true);
    try {
      const res = await fetch("/api/replan", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ plan, note }),
      });
      const data = await res.json();
      if (res.ok) {
        setPlan(data.plan);
        setHistory((h) =>
          appendEvent(h, makeEvent("replan", summarizeValidation(data.plan).confidence, "Re-planned from new evidence")),
        );
      } else console.error("Replan error:", data);
    } finally {
      setReplanning(false);
    }
  }

  function loadSampleIdea() {
    setMessages(sampleMessages);
    setReadyToPlan(true);
    setPlan(null);
    setHistory([]);
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-base font-semibold tracking-tight text-text">Zero2Hero</h1>
        <span className="text-sm text-muted">idea → execution plan</span>
        <div className="ml-auto flex items-center gap-2">
          <ProviderToggle value={providerPref} onChange={setProviderPref} />
          <ApiKeyButton />
          <ThemeToggle />
        </div>
      </header>

      <SetupBanner provider={providerPref} />

      <div className="grid flex-1 grid-cols-2 overflow-hidden">
        <section className="border-r border-border">
          <InterviewPanel
            messages={messages}
            setMessages={setMessages}
            readyToPlan={readyToPlan}
            setReadyToPlan={setReadyToPlan}
            onGeneratePlan={generatePlan}
            onLoadSample={loadSampleIdea}
            planning={planning}
          />
        </section>
        <section>
          <PlanPanel
            plan={plan}
            history={history}
            onPlanChange={applyPlan}
            onReplan={replan}
            replanning={replanning}
          />
        </section>
      </div>
    </main>
  );
}

const sampleMessages: ChatMessage[] = [
  {
    role: "user",
    content:
      "I want to build an app that helps college students turn vague startup ideas into validated weekend projects.",
  },
  {
    role: "assistant",
    content:
      "The hidden assumption is that students want validation help more than they want motivation or coding help. What specific student would use this first, and what are they trying to finish by Sunday night?",
  },
  {
    role: "user",
    content:
      "First-time student founders in hackathon clubs. By Sunday night they want a clear idea, a tiny prototype, and proof that at least a few real people care.",
  },
  {
    role: "assistant",
    content:
      "Good. The riskiest part is whether they will actually do uncomfortable validation tasks. What would count as a win in the first week?",
  },
  {
    role: "user",
    content:
      "Five students use it during a weekend, at least three interview potential users, and two say it changed what they built.",
  },
  {
    role: "assistant",
    content:
      "READY_TO_PLAN\nZero2Hero should help first-time student founders convert vague ideas into weekend validation plans that force real user evidence before overbuilding.",
  },
];
