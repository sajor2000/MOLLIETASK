"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDetailView } from "@/components/task/TaskDetailView";
import { UndoToast } from "@/components/ui/UndoToast";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TaskStatus } from "@/lib/constants";

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
  const [undoAction, setUndoAction] = useState<{
    taskId: Id<"tasks">;
    previousStatus: TaskStatus;
  } | null>(null);

  // Use ref to avoid tasks in useCallback dep array (prevents KanbanBoard re-renders)
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const handleMoveTask = useCallback(
    (taskId: string, newStatus: TaskStatus, newSortOrder: number) => {
      void reorderTask({
        taskId: taskId as Id<"tasks">,
        newStatus,
        newSortOrder,
      });
    },
    [reorderTask],
  );

  const handleCompleteTask = useCallback(
    (taskId: string) => {
      const task = tasksRef.current?.find((t) => t._id === taskId);
      if (!task || task.status === "done") return;

      setUndoAction({ taskId: taskId as Id<"tasks">, previousStatus: task.status });
      void completeTask({ taskId: taskId as Id<"tasks"> });
    },
    [completeTask],
  );

  const handleUndo = useCallback(() => {
    if (!undoAction) return;
    void uncompleteTask({ taskId: undoAction.taskId });
    setUndoAction(null);
  }, [undoAction, uncompleteTask]);

  const handleSaveTask = useCallback(
    (taskData: {
      title: string;
      workstream: "practice" | "personal" | "family";
      priority: "high" | "normal";
      status: "todo" | "inprogress" | "done";
      dueDate?: number;
      dueTime?: string;
      notes?: string;
    }) => {
      if (editingTask) {
        void updateTask({ taskId: editingTask._id, ...taskData });
        setEditingTask(null);
      } else {
        void addTask(taskData);
        setIsCreating(false);
      }
    },
    [editingTask, updateTask, addTask],
  );

  const handleDeleteTask = useCallback(
    (taskId: Id<"tasks">) => {
      void deleteTask({ taskId });
      setEditingTask(null);
    },
    [deleteTask],
  );

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
    <AppShell onAddTask={() => setIsCreating(true)}>
      <div className="h-[calc(100dvh-64px-56px)] md:h-[calc(100dvh-64px)]">
        <KanbanBoard
          tasks={tasks}
          onMoveTask={handleMoveTask}
          onEditTask={setEditingTask}
          onCompleteTask={handleCompleteTask}
        />
      </div>

      {(editingTask || isCreating) && (
        <TaskDetailView
          task={editingTask}
          onSave={handleSaveTask}
          onDelete={
            editingTask
              ? () => handleDeleteTask(editingTask._id)
              : undefined
          }
          onClose={() => {
            setEditingTask(null);
            setIsCreating(false);
          }}
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
