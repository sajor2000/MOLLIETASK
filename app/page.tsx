"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useWorkspace } from "@/hooks/useWorkspace";

const KanbanBoard = dynamic(
  () => import("@/components/kanban/KanbanBoard").then((m) => ({ default: m.KanbanBoard })),
  { ssr: false },
);
const TaskOverlays = dynamic(
  () => import("@/components/task/TaskOverlays").then((m) => ({ default: m.TaskOverlays })),
  { ssr: false },
);
const AiCaptureBar = dynamic(
  () => import("@/components/task/AiCaptureBar").then((m) => ({ default: m.AiCaptureBar })),
  { ssr: false },
);
const TemplateLibrary = dynamic(
  () => import("@/components/task/TemplateLibrary").then((m) => ({ default: m.TemplateLibrary })),
  { ssr: false },
);

export default function KanbanPage() {
  const { isOwner, isMember } = useWorkspace();
  const tasks = useQuery(api.tasks.getTasksByStatus, {});
  const staffList = useQuery(api.staff.listStaff, isOwner ? {} : "skip");
  const {
    editingTask,
    setEditingTask,
    isCreating,
    setIsCreating,
    handleSave,
    handleDelete,
    handleComplete,
    handleReorder,
    handleClearCompleted,
    handleUndo,
    undoAction,
    clearUndo,
    errorMessage,
    clearError,
  } = useTaskActions(tasks);

  // Kanban-specific state
  const [prefillData, setPrefillData] = useState<Partial<TaskFormData> | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const filteredTasks = useMemo(() => {
    if (!tasks || !searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, searchQuery]);

  const staffKey = staffList?.map((s) => s._id).join(",") ?? "";
  const staffById = useMemo(() => {
    const m = new Map<string, Doc<"staffMembers">>();
    for (const s of staffList ?? []) m.set(s._id, s);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffKey]);

  const handleAiAddTask = (prefill: Partial<TaskFormData>) => {
    setPrefillData(prefill);
    setIsCreating(true);
  };

  const handleAiEditTask = (task: Doc<"tasks">, changes: Partial<TaskFormData>) => {
    setEditingTask(task);
    setPrefillData(changes);
  };

  const handleCloseModal = () => {
    setEditingTask(null);
    setIsCreating(false);
    setPrefillData(undefined);
  };

  // Keyboard shortcut: press N to open new task (owner only, not while typing)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isOwner) return;
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      if (isCreating || editingTask) return;
      e.preventDefault();
      setIsCreating(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOwner, isCreating, editingTask, setIsCreating]);

  if (tasks === undefined) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <p className="text-[13px] text-text-muted">Loading...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      onAddTask={isOwner ? () => setIsCreating(true) : undefined}
      onOpenTemplates={isOwner ? () => setShowTemplates(true) : undefined}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      topBarExtra={
        isOwner ? (
          <AiCaptureBar
            tasks={tasks}
            staffMembers={staffList ?? []}
            onAddTask={handleAiAddTask}
            onEditTask={handleAiEditTask}
            onCompleteTask={handleComplete}
            onDeleteTask={handleDelete}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Mobile-only AI capture bar (desktop version lives in the top bar) */}
        {isOwner && (
          <div className="md:hidden shrink-0 px-4 py-2 border-b border-border/50">
            <AiCaptureBar
              tasks={tasks}
              staffMembers={staffList ?? []}
              onAddTask={handleAiAddTask}
              onEditTask={handleAiEditTask}
              onCompleteTask={handleComplete}
              onDeleteTask={handleDelete}
              fullWidth
            />
          </div>
        )}
        <div className="flex-1 min-h-0">
          <KanbanBoard
            tasks={filteredTasks ?? []}
            staffById={staffById}
            onMoveTask={isOwner ? handleReorder : undefined}
            onEditTask={setEditingTask}
            onCompleteTask={handleComplete}
            onClearCompleted={isOwner ? handleClearCompleted : undefined}
          />
        </div>
      </div>

      <TaskOverlays
        editingTask={editingTask}
        isCreating={isCreating}
        prefill={isCreating ? prefillData : undefined}
        staffMembers={staffList ?? []}
        isOwner={isOwner}
        isMember={isMember}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={handleCloseModal}
        undoAction={undoAction}
        onUndo={handleUndo}
        onUndoExpire={clearUndo}
        errorMessage={errorMessage}
        onErrorDismiss={clearError}
      />

      {showTemplates && isOwner && (
        <TemplateLibrary
          onClose={() => setShowTemplates(false)}
          onEditTask={(task) => {
            setShowTemplates(false);
            setEditingTask(task);
          }}
        />
      )}
    </AppShell>
  );
}
