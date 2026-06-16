import type { ChatMessage } from "@/lib/llm";
import type { Plan, PlanEvent } from "@/lib/schema";

/**
 * Multi-project workspace. Each project is a fully isolated session (its own
 * interview transcript, plan, and de-risking timeline) so different ideas never
 * trip over each other. A single `sharedContext` string sits above all of them
 * — facts about the founder/company that should inform every project's
 * interview and plan, without being re-typed each time.
 */

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  messages: ChatMessage[];
  readyToPlan: boolean;
  plan: Plan | null;
  history: PlanEvent[];
}

export interface Workspace {
  projects: Project[];
  activeId: string;
  sharedContext: string;
}

export const DEFAULT_PROJECT_NAME = "Untitled idea";

let fallbackCounter = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackCounter += 1;
  return `p_${Date.now()}_${fallbackCounter}`;
}

export function makeProject(name: string = DEFAULT_PROJECT_NAME, id?: string): Project {
  return {
    id: id ?? newId(),
    name: name.trim() || DEFAULT_PROJECT_NAME,
    createdAt: new Date().toISOString(),
    messages: [],
    readyToPlan: false,
    plan: null,
    history: [],
  };
}

/**
 * A deterministic starter workspace. The first project uses a fixed id so the
 * server and the first client render agree (no hydration mismatch); only
 * user-created projects get random ids.
 */
export function emptyWorkspace(): Workspace {
  const first = makeProject(DEFAULT_PROJECT_NAME, "default");
  return { projects: [first], activeId: first.id, sharedContext: "" };
}

export function activeProject(ws: Workspace): Project {
  return ws.projects.find((p) => p.id === ws.activeId) ?? ws.projects[0];
}

export function updateProject(ws: Workspace, id: string, patch: Partial<Project>): Workspace {
  return { ...ws, projects: ws.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function renameProject(ws: Workspace, id: string, name: string): Workspace {
  return updateProject(ws, id, { name: name.trim() || DEFAULT_PROJECT_NAME });
}

/** Add a fresh project and make it active. */
export function addProject(ws: Workspace, name?: string): Workspace {
  const p = makeProject(name);
  return { ...ws, projects: [...ws.projects, p], activeId: p.id };
}

export function setActive(ws: Workspace, id: string): Workspace {
  return ws.projects.some((p) => p.id === id) ? { ...ws, activeId: id } : ws;
}

/** Restart from scratch: wipe a project's content but keep its tab and name. */
export function resetProject(ws: Workspace, id: string): Workspace {
  return updateProject(ws, id, { messages: [], readyToPlan: false, plan: null, history: [] });
}

/** Close a tab. The workspace is never left empty — a fresh project replaces the last one. */
export function closeProject(ws: Workspace, id: string): Workspace {
  const idx = ws.projects.findIndex((p) => p.id === id);
  if (idx === -1) return ws;
  const remaining = ws.projects.filter((p) => p.id !== id);
  if (remaining.length === 0) return emptyWorkspace();
  let activeId = ws.activeId;
  if (activeId === id) {
    activeId = (remaining[idx] ?? remaining[idx - 1] ?? remaining[0]).id;
  }
  return { ...ws, projects: remaining, activeId };
}

export function setSharedContext(ws: Workspace, text: string): Workspace {
  return { ...ws, sharedContext: text };
}

/** Derive a short tab name from the first thing the user typed. */
export function deriveName(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content?.trim();
  if (!first) return DEFAULT_PROJECT_NAME;
  const oneLine = first.replace(/\s+/g, " ");
  return oneLine.length > 32 ? oneLine.slice(0, 32).trimEnd() + "…" : oneLine;
}

/** Wrap the old single-session shape into a one-project workspace. */
export interface LegacyState {
  messages?: ChatMessage[];
  plan?: Plan | null;
  readyToPlan?: boolean;
  history?: PlanEvent[];
}
export function fromLegacy(legacy: LegacyState): Workspace {
  const first = makeProject(DEFAULT_PROJECT_NAME, "default");
  first.messages = Array.isArray(legacy.messages) ? legacy.messages : [];
  if (first.messages.length) first.name = deriveName(first.messages);
  first.plan = legacy.plan ?? null;
  first.readyToPlan = !!legacy.readyToPlan;
  first.history = Array.isArray(legacy.history) ? legacy.history : [];
  return { projects: [first], activeId: first.id, sharedContext: "" };
}
