"use client";

import { TaskDetailView } from "./TaskDetailView";
import { UndoToast } from "@/components/ui/UndoToast";
import { ErrorToast } from "@/components/ui/ErrorToast";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TaskFormData, TaskStatus } from "@/lib/constants";

interface TaskOverlaysProps {
  editingTask: Doc<"tasks"> | null;
  isCreating: boolean;
  prefill?: Partial<TaskFormData>;
  staffMembers: Doc<"staffMembers">[];
  isOwner: boolean;
  isMember: boolean;
  onSave: (data: TaskFormData) => void | Promise<void>;
  onDelete: (taskId: Id<"tasks">) => void | Promise<void>;
  onClose: () => void;
  undoAction: { taskId: Id<"tasks">; previousStatus: TaskStatus; spawnedTaskId?: Id<"tasks"> } | null;
  onUndo: () => void;
  onUndoExpire: () => void;
  errorMessage: string | null;
  onErrorDismiss: () => void;
}

export function TaskOverlays({
  editingTask,
  isCreating,
  prefill,
  staffMembers,
  isOwner,
  isMember,
  onSave,
  onDelete,
  onClose,
  undoAction,
  onUndo,
  onUndoExpire,
  errorMessage,
  onErrorDismiss,
}: TaskOverlaysProps) {
  return (
    <>
      {(editingTask || isCreating) && (
        <TaskDetailView
          task={editingTask}
          prefill={prefill}
          staffMembers={staffMembers}
          onSave={!isMember ? onSave : undefined}
          onDelete={!isMember && editingTask ? () => onDelete(editingTask._id) : undefined}
          onClose={onClose}
          readOnly={isMember}
        />
      )}

      {undoAction && (
        <UndoToast message="Task completed" onUndo={onUndo} onExpire={onUndoExpire} />
      )}

      {errorMessage && !undoAction && (
        <ErrorToast message={errorMessage} onDismiss={onErrorDismiss} />
      )}
    </>
  );
}
