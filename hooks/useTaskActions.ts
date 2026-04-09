"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";

export function useTaskActions() {
  const addTask = useMutation(api.tasks.addTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const completeTask = useMutation(api.tasks.completeTask);

  const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = useCallback(
    (data: TaskFormData) => {
      if (editingTask) {
        updateTask({ taskId: editingTask._id, ...data }).catch(console.error);
        setEditingTask(null);
      } else {
        addTask(data).catch(console.error);
        setIsCreating(false);
      }
    },
    [editingTask, updateTask, addTask],
  );

  const handleDelete = useCallback(
    (taskId: Id<"tasks">) => {
      deleteTask({ taskId }).catch(console.error);
      setEditingTask(null);
    },
    [deleteTask],
  );

  const handleComplete = useCallback(
    (taskId: Id<"tasks">) => {
      completeTask({ taskId }).catch(console.error);
    },
    [completeTask],
  );

  return {
    editingTask,
    setEditingTask,
    isCreating,
    setIsCreating,
    handleSave,
    handleDelete,
    handleComplete,
  };
}
