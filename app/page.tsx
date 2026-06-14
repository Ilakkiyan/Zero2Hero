"use client";

import { useState } from "react";
import InterviewPanel from "@/components/InterviewPanel";
import PlanPanel from "@/components/PlanPanel";
import type { ChatMessage } from "@/lib/llm";
import type { Plan } from "@/lib/schema";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readyToPlan, setReadyToPlan] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);

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

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-base font-semibold tracking-tight text-text">Zero2Hero</h1>
        <span className="text-sm text-muted">idea → execution plan</span>
        {/* Light-mode toggle slots in here later. */}
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
          <PlanPanel plan={plan} />
        </section>
      </div>
    </main>
  );
}
