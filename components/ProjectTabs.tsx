"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/workspace";

interface Props {
  projects: Project[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRestart: () => void;
}

/**
 * Browser-style project tabs. Each tab is an isolated idea; double-click to
 * rename, × to close. "New idea" opens a fresh tab, "Restart" wipes the active
 * one back to a blank slate.
 */
export default function ProjectTabs({
  projects,
  activeId,
  onSelect,
  onAdd,
  onClose,
  onRename,
  onRestart,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  function startEdit(p: Project) {
    setEditingId(p.id);
    setDraft(p.name);
  }
  function commitEdit() {
    if (editingId) onRename(editingId, draft);
    setEditingId(null);
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-1.5">
      {projects.map((p) => {
        const active = p.id === activeId;
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            onDoubleClick={() => startEdit(p)}
            title={p.name}
            className={
              "group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors " +
              (active
                ? "bg-surface-2 text-text"
                : "text-muted hover:bg-surface hover:text-text")
            }
          >
            {editingId === p.id ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="w-32 bg-transparent text-xs text-text outline-none"
              />
            ) : (
              <span className="max-w-[14rem] truncate">{p.name}</span>
            )}

            {projects.length > 1 && editingId !== p.id && (
              <button
                type="button"
                aria-label={`Close ${p.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(p.id);
                }}
                className="rounded text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        aria-label="New idea"
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-text"
      >
        + New idea
      </button>

      <button
        type="button"
        onClick={onRestart}
        className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-text"
      >
        ↺ Restart
      </button>
    </div>
  );
}
