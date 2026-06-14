"use client";

import { useEffect, useState } from "react";
import InterviewPanel from "@/components/InterviewPanel";
import PlanPanel from "@/components/PlanPanel";
import ThemeToggle from "@/components/ThemeToggle";
import type { ChatMessage } from "@/lib/llm";
import type { Plan } from "@/lib/schema";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readyToPlan, setReadyToPlan] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Persist session so a reload (or the Google OAuth redirect) doesn't wipe it.
  const STORAGE_KEY = "z2h_state";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.messages)) setMessages(s.messages);
        if (s.plan) setPlan(s.plan);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, plan, readyToPlan }));
    } catch {
      /* storage full/blocked — non-fatal */
    }
  }, [hydrated, messages, plan, readyToPlan]);

  async function generatePlan() {
    setPlanning(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (res.ok) setPlan(data.plan);
      else console.error("Plan error:", data);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, note }),
      });
      const data = await res.json();
      if (res.ok) setPlan(data.plan);
      else console.error("Replan error:", data);
    } finally {
      setReplanning(false);
    }
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-base font-semibold tracking-tight text-text">Zero2Hero</h1>
        <span className="text-sm text-muted">idea → execution plan</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-2 overflow-hidden">
        <section className="border-r border-border">
          <InterviewPanel
            messages={messages}
            setMessages={setMessages}
            readyToPlan={readyToPlan}
            setReadyToPlan={setReadyToPlan}
            onGeneratePlan={generatePlan}
            planning={planning}
          />
        </section>
        <section>
          <PlanPanel plan={plan} onReplan={replan} replanning={replanning} />
        </section>
      </div>
    </main>
  );
}
