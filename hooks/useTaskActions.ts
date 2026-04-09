"use client";

import { useCallback, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";

export function useTaskActions() {
  const convex = useConvex();
  const addTask = useMutation(api.tasks.addTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const completeTask = useMutation(api.tasks.completeTask);

  const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = useCallback(
    async (data: TaskFormData) => {
      if (editingTask) {
        try {
          await updateTask({ taskId: editingTask._id, ...data });
          setEditingTask(null);
        } catch {
          console.error("Failed to update task");
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
          console.error("Failed to add task");
          setIsCreating(false);
        }
      }
    },
    [editingTask, updateTask, addTask, convex],
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
