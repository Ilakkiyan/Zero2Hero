"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import InterviewPanel from "@/components/InterviewPanel";
import PlanPanel from "@/components/PlanPanel";
import ProjectTabs from "@/components/ProjectTabs";
import SharedContextButton from "@/components/SharedContextButton";
import ThemeToggle from "@/components/ThemeToggle";
import SetupBanner from "@/components/SetupBanner";
import ProviderToggle from "@/components/ProviderToggle";
import { apiHeaders, getProviderPref, type ProviderPref } from "@/lib/apiClient";
import type { ChatMessage } from "@/lib/llm";
import { PlanSchema, PlanEventSchema, type Plan, type PlanEvent } from "@/lib/schema";
import { summarizeValidation } from "@/lib/validation";
import { appendEvent, makeEvent, type PlanChangeMeta } from "@/lib/history";
import {
  DEFAULT_PROJECT_NAME,
  activeProject,
  addProject,
  closeProject,
  deriveName,
  emptyWorkspace,
  fromLegacy,
  renameProject,
  resetProject,
  setActive,
  setSharedContext,
  updateProject,
  type Project,
  type Workspace,
} from "@/lib/workspace";

const WS_KEY = "z2h_workspace";
const LEGACY_KEY = "z2h_state";

function validPlan(raw: unknown): Plan | null {
  const r = PlanSchema.safeParse(raw);
  return r.success ? r.data : null;
}
function validHistory(raw: unknown): PlanEvent[] {
  const r = PlanEventSchema.array().safeParse(raw);
  return r.success ? r.data : [];
}

/** Parse + sanitize a persisted workspace, validating each project's plan/history. */
function parseWorkspace(obj: unknown): Workspace | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.projects) || o.projects.length === 0) return null;

  const projects: Project[] = o.projects.map((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    return {
      id: typeof p.id === "string" ? p.id : "default",
      name: typeof p.name === "string" ? p.name : DEFAULT_PROJECT_NAME,
      createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
      messages: (Array.isArray(p.messages) ? p.messages : []) as ChatMessage[],
      readyToPlan: !!p.readyToPlan,
      plan: validPlan(p.plan),
      history: validHistory(p.history),
    };
  });

  const activeId = projects.some((p) => p.id === o.activeId)
    ? (o.activeId as string)
    : projects[0].id;
  const sharedContext = typeof o.sharedContext === "string" ? o.sharedContext : "";
  return { projects, activeId, sharedContext };
}

export default function Home() {
  const [ws, setWs] = useState<Workspace>(() => emptyWorkspace());
  const [planning, setPlanning] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [providerPref, setProviderPref] = useState<ProviderPref>("local");

  useEffect(() => {
    setProviderPref(getProviderPref());
  }, []);

  // Hydrate the workspace, migrating the old single-session shape if present.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WS_KEY);
      if (raw) {
        const parsed = parseWorkspace(JSON.parse(raw));
        if (parsed) setWs(parsed);
      } else {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const s = JSON.parse(legacy);
          setWs(
            fromLegacy({
              messages: Array.isArray(s.messages) ? s.messages : [],
              plan: validPlan(s.plan),
              readyToPlan: !!s.readyToPlan,
              history: validHistory(s.history),
            }),
          );
        }
      }
    } catch {
      /* ignore corrupt/blocked storage */
    }
    setHydrated(true);
  }, []);

  // Persist the whole workspace (survives reload + the Google OAuth redirect).
  useEffect(() => {
    if (!hydrated) return; // don't overwrite storage with the empty initial state
    try {
      localStorage.setItem(WS_KEY, JSON.stringify(ws));
    } catch {
      /* storage full/blocked — non-fatal */
    }
  }, [hydrated, ws]);

  const project = activeProject(ws);
  const sharedContext = ws.sharedContext;

  // ── Setters scoped to the active project ───────────────────────────
  function setMessages(messages: ChatMessage[]) {
    setWs((w) => {
      const p = activeProject(w);
      // Auto-name a still-untitled tab from its first message.
      const name = p.name === DEFAULT_PROJECT_NAME && messages.length ? deriveName(messages) : p.name;
      return updateProject(w, w.activeId, { messages, name });
    });
  }
  function setReadyToPlan(v: boolean) {
    setWs((w) => updateProject(w, w.activeId, { readyToPlan: v }));
  }

  /**
   * Single funnel for plan changes so the de-risking timeline stays in sync.
   * `meta` (when present) logs why the plan changed, snapshotting the confidence
   * that results from the change — on the active project only.
   */
  function applyPlan(next: Plan, meta?: PlanChangeMeta) {
    setWs((w) => {
      const p = activeProject(w);
      const history = meta
        ? appendEvent(
            p.history,
            makeEvent(meta.kind, summarizeValidation(next).confidence, meta.label, meta.assumptionId ?? null),
          )
        : p.history;
      return updateProject(w, w.activeId, { plan: next, history });
    });
  }

  async function generatePlan() {
    const targetId = ws.activeId;
    setPlanning(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ messages: project.messages, sharedContext }),
      });
      const data = await res.json();
      if (res.ok) {
        // A fresh plan starts a fresh trajectory.
        setWs((w) =>
          updateProject(w, targetId, {
            plan: data.plan,
            history: [makeEvent("created", summarizeValidation(data.plan).confidence, "Plan generated")],
          }),
        );
      } else console.error("Plan error:", data);
    } finally {
      setPlanning(false);
    }
  }

  async function replan(note: string): Promise<boolean> {
    const target = activeProject(ws);
    if (!target.plan) return false;
    const targetId = ws.activeId;
    setReplanning(true);
    try {
      const res = await fetch("/api/replan", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ plan: target.plan, note, sharedContext }),
      });
      const data = await res.json();
      if (res.ok) {
        setWs((w) => {
          const p = w.projects.find((x) => x.id === targetId);
          const history = p
            ? appendEvent(
                p.history,
                makeEvent("replan", summarizeValidation(data.plan).confidence, "Re-planned from new evidence"),
              )
            : [];
          return updateProject(w, targetId, { plan: data.plan, history });
        });
        return true;
      }
      console.error("Replan error:", data);
      return false;
    } catch (err) {
      console.error("Replan error:", err);
      return false;
    } finally {
      setReplanning(false);
    }
  }

  function loadSampleIdea() {
    setWs((w) =>
      updateProject(w, w.activeId, {
        messages: sampleMessages,
        readyToPlan: true,
        plan: null,
        history: [],
        name: "Weekend validation app",
      }),
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-base font-semibold tracking-tight text-text">Zero2Hero</h1>
        <span className="text-sm text-muted">your AI cofounder · idea → execution plan</span>
        <div className="ml-auto flex items-center gap-2">
          <SharedContextButton
            value={ws.sharedContext}
            onSave={(text) => setWs((w) => setSharedContext(w, text))}
          />
          <ProviderToggle value={providerPref} onChange={setProviderPref} />
          <ThemeToggle />
          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            ⚙
          </Link>
        </div>
      </header>

      <SetupBanner provider={providerPref} />

      <ProjectTabs
        projects={ws.projects}
        activeId={ws.activeId}
        onSelect={(id) => setWs((w) => setActive(w, id))}
        onAdd={() => setWs((w) => addProject(w))}
        onClose={(id) => setWs((w) => closeProject(w, id))}
        onRename={(id, name) => setWs((w) => renameProject(w, id, name))}
        onRestart={() => setWs((w) => resetProject(w, w.activeId))}
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1 overflow-hidden">
        <section className="min-h-0 overflow-hidden border-r border-border">
          {/* key per project so transient UI (input text, open modals) resets on tab switch */}
          <InterviewPanel
            key={project.id}
            messages={project.messages}
            setMessages={setMessages}
            readyToPlan={project.readyToPlan}
            setReadyToPlan={setReadyToPlan}
            onGeneratePlan={generatePlan}
            onLoadSample={loadSampleIdea}
            planning={planning}
            hasPlan={!!project.plan}
            onRefine={replan}
            refining={replanning}
            sharedContext={sharedContext}
            onSetSharedContext={(text) => setWs((w) => setSharedContext(w, text))}
          />
        </section>
        <section className="min-h-0 overflow-hidden">
          <PlanPanel
            key={project.id}
            plan={project.plan}
            history={project.history}
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
