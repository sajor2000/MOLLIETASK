"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { UndoToast } from "@/components/ui/UndoToast";
import { ErrorToast } from "@/components/ui/ErrorToast";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useWorkspace } from "@/hooks/useWorkspace";

const KanbanBoard = dynamic(
  () => import("@/components/kanban/KanbanBoard").then((m) => ({ default: m.KanbanBoard })),
  { ssr: false },
);
const TaskDetailView = dynamic(
  () => import("@/components/task/TaskDetailView").then((m) => ({ default: m.TaskDetailView })),
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
          />
        ) : undefined
      }
    >
      <div className="h-[calc(100dvh-64px-56px)] md:h-[calc(100dvh-64px)]">
        <KanbanBoard
          tasks={filteredTasks ?? []}
          staffById={staffById}
          onMoveTask={isOwner ? handleReorder : undefined}
          onEditTask={setEditingTask}
          onCompleteTask={handleComplete}
          onClearCompleted={isOwner ? handleClearCompleted : undefined}
        />
      </div>

      {(editingTask || isCreating) && (
        <TaskDetailView
          task={editingTask}
          prefill={isCreating ? prefillData : undefined}
          staffMembers={staffList ?? []}
          onSave={isOwner ? handleSave : undefined}
          onDelete={
            isOwner && editingTask
              ? () => handleDelete(editingTask._id)
              : undefined
          }
          onClose={handleCloseModal}
          readOnly={isMember}
        />
      )}

      {undoAction && (
        <UndoToast
          message="Task completed"
          onUndo={handleUndo}
          onExpire={clearUndo}
        />
      )}

      {errorMessage && !undoAction && (
        <ErrorToast message={errorMessage} onDismiss={clearError} />
      )}

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
