"use client";

import { useCallback, useRef, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TaskFormData, TaskStatus } from "@/lib/constants";

export function useTaskActions(tasks?: Doc<"tasks">[]) {
  const convex = useConvex();
  const addTask = useMutation(api.tasks.addTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const uncompleteTask = useMutation(api.tasks.uncompleteTask);
  const reorderTask = useMutation(api.tasks.reorderTask).withOptimisticUpdate(
    (localStore, args) => {
      const currentTasks = localStore.getQuery(api.tasks.getTasksByStatus, {});
      if (currentTasks === undefined) return;

      // Skip optimistic update for drag-to-done (complex server side effects)
      const task = currentTasks.find((t) => t._id === args.taskId);
      if (!task) return;
      if (args.newStatus === "done" && task.status !== "done") return;

      const updatedTasks = currentTasks.map((t) =>
        t._id === args.taskId
          ? { ...t, status: args.newStatus, sortOrder: args.newSortOrder }
          : t,
      );
      localStore.setQuery(api.tasks.getTasksByStatus, {}, updatedTasks);
    },
  );
  const deleteCompletedTasks = useMutation(api.tasks.deleteCompletedTasks);

  // Stable ref for tasks to avoid re-renders in callbacks
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Modal/form state
  const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Undo state
  const [undoAction, setUndoAction] = useState<{
    taskId: Id<"tasks">;
    previousStatus: TaskStatus;
    spawnedTaskId?: Id<"tasks">;
  } | null>(null);

  // Error feedback state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = useCallback(
    async (data: TaskFormData) => {
      if (editingTask) {
        try {
          await updateTask({ taskId: editingTask._id, ...data });
          setEditingTask(null);
        } catch {
          setErrorMessage("Failed to update task");
        }
      } else {
        try {
          const taskId = await addTask(data);
          const doc = await convex.query(api.tasks.getTask, { taskId });
          if (doc) {
            setEditingTask(doc);
            setIsCreating(false);
          } else {
            setIsCreating(false);
          }
        } catch {
          setErrorMessage("Failed to add task");
          setIsCreating(false);
        }
      }
    },
    [editingTask, updateTask, addTask, convex],
  );

  const handleDelete = useCallback(
    (taskId: Id<"tasks">) => {
      deleteTask({ taskId }).catch(() => setErrorMessage("Failed to delete task"));
      setEditingTask(null);
    },
    [deleteTask],
  );

  const handleComplete = useCallback(
    async (taskId: Id<"tasks">) => {
      const task = tasksRef.current?.find((t) => t._id === taskId);
      if (!task || task.status === "done") return;

      try {
        const nextTaskId = await completeTask({ taskId });
        setUndoAction({
          taskId,
          previousStatus: task.status,
          spawnedTaskId: nextTaskId ?? undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to complete task";
        setErrorMessage(msg);
      }
    },
    [completeTask],
  );

  const handleUndo = useCallback(() => {
    if (!undoAction) return;
    uncompleteTask({
      taskId: undoAction.taskId,
      previousStatus: undoAction.previousStatus,
      spawnedTaskId: undoAction.spawnedTaskId,
    }).catch(() => setErrorMessage("Failed to undo completion"));
    setUndoAction(null);
  }, [undoAction, uncompleteTask]);

  const handleReorder = useCallback(
    (taskId: Id<"tasks">, newStatus: TaskStatus, newSortOrder: number) => {
      reorderTask({ taskId, newStatus, newSortOrder }).catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to move task";
        setErrorMessage(msg);
      });
    },
    [reorderTask],
  );

  const handleClearCompleted = useCallback(async () => {
    try {
      let hasMore = true;
      while (hasMore) {
        const result = await deleteCompletedTasks();
        hasMore = result.hasMore;
      }
    } catch {
      setErrorMessage("Failed to clear completed tasks");
    }
  }, [deleteCompletedTasks]);

  return {
    editingTask,
    setEditingTask,
    isCreating,
    setIsCreating,
    handleSave,
    handleDelete,
    handleComplete,
    handleUndo,
    handleReorder,
    handleClearCompleted,
    undoAction,
    clearUndo: useCallback(() => setUndoAction(null), []),
    errorMessage,
    clearError: useCallback(() => setErrorMessage(null), []),
  };
}
