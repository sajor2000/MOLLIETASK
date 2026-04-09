"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDetailView } from "@/components/task/TaskDetailView";
import { AiCaptureBar } from "@/components/task/AiCaptureBar";
import { UndoToast } from "@/components/ui/UndoToast";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TaskStatus, TaskFormData } from "@/lib/constants";

export default function KanbanPage() {
  const tasks = useQuery(api.tasks.getTasksByStatus);
  const addTask = useMutation(api.tasks.addTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const uncompleteTask = useMutation(api.tasks.uncompleteTask);
  const reorderTask = useMutation(api.tasks.reorderTask);

  const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [prefillData, setPrefillData] = useState<Partial<TaskFormData> | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [undoAction, setUndoAction] = useState<{
    taskId: Id<"tasks">;
    previousStatus: TaskStatus;
  } | null>(null);

  const filteredTasks = useMemo(() => {
    if (!tasks || !searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, searchQuery]);

  // Use ref to avoid tasks in useCallback dep array (prevents KanbanBoard re-renders)
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const handleMoveTask = useCallback(
    (taskId: Id<"tasks">, newStatus: TaskStatus, newSortOrder: number) => {
      reorderTask({ taskId, newStatus, newSortOrder }).catch(() => {
        // Convex optimistic update will snap back; error logged for debugging
        console.error("Failed to reorder task");
      });
    },
    [reorderTask],
  );

  const handleCompleteTask = useCallback(
    (taskId: Id<"tasks">) => {
      const task = tasksRef.current?.find((t: Doc<"tasks">) => t._id === taskId);
      if (!task || task.status === "done") return;

      setUndoAction({ taskId, previousStatus: task.status });
      completeTask({ taskId }).catch(() => {
        setUndoAction(null);
        console.error("Failed to complete task");
      });
    },
    [completeTask],
  );

  const handleUndo = useCallback(() => {
    if (!undoAction) return;
    uncompleteTask({
      taskId: undoAction.taskId,
      previousStatus: undoAction.previousStatus,
    }).catch(() => {
      console.error("Failed to undo completion");
    });
    setUndoAction(null);
  }, [undoAction, uncompleteTask]);

  const handleSaveTask = useCallback(
    (taskData: TaskFormData) => {
      if (editingTask) {
        updateTask({ taskId: editingTask._id, ...taskData }).catch(() => {
          console.error("Failed to update task");
        });
        setEditingTask(null);
      } else {
        addTask(taskData).catch(() => {
          console.error("Failed to add task");
        });
        setIsCreating(false);
      }
    },
    [editingTask, updateTask, addTask],
  );

  const handleDeleteTask = useCallback(
    (taskId: Id<"tasks">) => {
      deleteTask({ taskId }).catch(() => {
        console.error("Failed to delete task");
      });
      setEditingTask(null);
    },
    [deleteTask],
  );

  const handleAiAddTask = useCallback((prefill: Partial<TaskFormData>) => {
    setPrefillData(prefill);
    setIsCreating(true);
  }, []);

  const handleAiEditTask = useCallback(
    (task: Doc<"tasks">, changes: Partial<TaskFormData>) => {
      setEditingTask(task);
      setPrefillData(changes);
    },
    [],
  );

  const handleCloseModal = useCallback(() => {
    setEditingTask(null);
    setIsCreating(false);
    setPrefillData(undefined);
  }, []);

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
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      topBarExtra={
        <AiCaptureBar
          tasks={tasks}
          onAddTask={handleAiAddTask}
          onEditTask={handleAiEditTask}
          onCompleteTask={handleCompleteTask}
        />
      }
    >
      <div className="h-[calc(100dvh-64px-56px)] md:h-[calc(100dvh-64px)]">
        <KanbanBoard
          tasks={filteredTasks ?? []}
          onMoveTask={handleMoveTask}
          onEditTask={setEditingTask}
          onCompleteTask={handleCompleteTask}
        />
      </div>

      {(editingTask || isCreating) && (
        <TaskDetailView
          task={editingTask}
          prefill={isCreating ? prefillData : undefined}
          onSave={handleSaveTask}
          onDelete={
            editingTask
              ? () => handleDeleteTask(editingTask._id)
              : undefined
          }
          onClose={handleCloseModal}
        />
      )}

      {undoAction && (
        <UndoToast
          message="Task completed"
          onUndo={handleUndo}
          onExpire={() => setUndoAction(null)}
        />
      )}
    </AppShell>
  );
}
