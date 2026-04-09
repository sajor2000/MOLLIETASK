"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDetailView } from "@/components/task/TaskDetailView";
import { AiCaptureBar } from "@/components/task/AiCaptureBar";
import { TemplateLibrary } from "@/components/task/TemplateLibrary";
import { UndoToast } from "@/components/ui/UndoToast";
import { ErrorToast } from "@/components/ui/ErrorToast";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";
import { useTaskActions } from "@/hooks/useTaskActions";

export default function KanbanPage() {
  const tasks = useQuery(api.tasks.getTasksByStatus, {});
  const staffList = useQuery(api.staff.listStaff);
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
      onAddTask={() => setIsCreating(true)}
      onOpenTemplates={() => setShowTemplates(true)}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      topBarExtra={
        <AiCaptureBar
          tasks={tasks}
          staffMembers={staffList ?? []}
          onAddTask={handleAiAddTask}
          onEditTask={handleAiEditTask}
          onCompleteTask={handleComplete}
        />
      }
    >
      <div className="h-[calc(100dvh-64px-56px)] md:h-[calc(100dvh-64px)]">
        <KanbanBoard
          tasks={filteredTasks ?? []}
          staffById={staffById}
          onMoveTask={handleReorder}
          onEditTask={setEditingTask}
          onCompleteTask={handleComplete}
          onClearCompleted={handleClearCompleted}
        />
      </div>

      {(editingTask || isCreating) && (
        <TaskDetailView
          task={editingTask}
          prefill={isCreating ? prefillData : undefined}
          staffMembers={staffList ?? []}
          onSave={handleSave}
          onDelete={
            editingTask
              ? () => handleDelete(editingTask._id)
              : undefined
          }
          onClose={handleCloseModal}
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

      {showTemplates && (
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
