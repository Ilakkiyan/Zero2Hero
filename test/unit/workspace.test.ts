import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_NAME,
  activeProject,
  addProject,
  closeProject,
  deriveName,
  emptyWorkspace,
  fromLegacy,
  makeProject,
  renameProject,
  resetProject,
  setActive,
  setSharedContext,
  updateProject,
} from "@/lib/workspace";
import type { ChatMessage } from "@/lib/llm";

const userMsg = (content: string): ChatMessage => ({ role: "user", content });

describe("workspace", () => {
  it("starts with one project, a stable id, and empty shared context", () => {
    const ws = emptyWorkspace();
    expect(ws.projects).toHaveLength(1);
    expect(ws.projects[0].id).toBe("default");
    expect(ws.activeId).toBe("default");
    expect(ws.sharedContext).toBe("");
    expect(activeProject(ws)).toBe(ws.projects[0]);
  });

  it("makeProject falls back to the default name and a non-empty id", () => {
    expect(makeProject("  ").name).toBe(DEFAULT_PROJECT_NAME);
    expect(makeProject("Idea X").name).toBe("Idea X");
    expect(makeProject().id).toBeTruthy();
  });

  it("addProject appends a project and makes it active", () => {
    const ws = addProject(emptyWorkspace(), "Second");
    expect(ws.projects).toHaveLength(2);
    expect(activeProject(ws).name).toBe("Second");
    expect(ws.activeId).toBe(ws.projects[1].id);
  });

  it("updateProject patches only the targeted project immutably", () => {
    const ws = addProject(emptyWorkspace());
    const next = updateProject(ws, "default", { readyToPlan: true });
    expect(next.projects[0].readyToPlan).toBe(true);
    expect(next.projects[1].readyToPlan).toBe(false);
    expect(ws.projects[0].readyToPlan).toBe(false); // original untouched
  });

  it("renameProject trims and guards against blank names", () => {
    const ws = renameProject(emptyWorkspace(), "default", "  My Idea  ");
    expect(ws.projects[0].name).toBe("My Idea");
    expect(renameProject(ws, "default", "   ").projects[0].name).toBe(DEFAULT_PROJECT_NAME);
  });

  it("setActive ignores unknown ids", () => {
    const ws = emptyWorkspace();
    expect(setActive(ws, "nope").activeId).toBe("default");
  });

  it("resetProject clears content but keeps the tab and name", () => {
    let ws = renameProject(emptyWorkspace(), "default", "Keep me");
    ws = updateProject(ws, "default", { messages: [userMsg("hi")], readyToPlan: true });
    const reset = resetProject(ws, "default");
    expect(reset.projects[0].name).toBe("Keep me");
    expect(reset.projects[0].messages).toEqual([]);
    expect(reset.projects[0].readyToPlan).toBe(false);
    expect(reset.projects[0].plan).toBeNull();
  });

  it("closeProject removes a tab and picks a neighbor when the active one closes", () => {
    let ws = addProject(addProject(emptyWorkspace(), "B"), "C"); // default, B, C; active C
    ws = setActive(ws, "default");
    const bId = ws.projects[1].id;
    const afterClose = closeProject(ws, "default");
    expect(afterClose.projects.map((p) => p.name)).toEqual(["B", "C"]);
    expect(afterClose.activeId).toBe(bId); // neighbor that took the slot
  });

  it("closeProject never leaves the workspace empty", () => {
    const ws = closeProject(emptyWorkspace(), "default");
    expect(ws.projects).toHaveLength(1);
    expect(ws.activeId).toBe(ws.projects[0].id);
  });

  it("setSharedContext stores the shared string without touching projects", () => {
    const ws = setSharedContext(emptyWorkspace(), "Solo founder, B2B SaaS");
    expect(ws.sharedContext).toBe("Solo founder, B2B SaaS");
    expect(ws.projects).toHaveLength(1);
  });

  it("deriveName uses the first user message, collapsed and truncated", () => {
    expect(deriveName([])).toBe(DEFAULT_PROJECT_NAME);
    expect(deriveName([{ role: "assistant", content: "hi" }])).toBe(DEFAULT_PROJECT_NAME);
    expect(deriveName([userMsg("  smart   paperclips  ")])).toBe("smart paperclips");
    const long = deriveName([userMsg("a".repeat(50))]);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(33);
  });

  it("fromLegacy wraps the old single-session shape into one project", () => {
    const ws = fromLegacy({ messages: [userMsg("sell smart paperclips")], readyToPlan: true });
    expect(ws.projects).toHaveLength(1);
    expect(ws.activeId).toBe("default");
    expect(ws.projects[0].readyToPlan).toBe(true);
    expect(ws.projects[0].name).toBe("sell smart paperclips");
    expect(ws.sharedContext).toBe("");
  });
});
