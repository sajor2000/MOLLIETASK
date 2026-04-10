"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TaskForm } from "./TaskForm";
import { SubtaskList } from "./SubtaskList";
import { Icon } from "@/components/ui/Icon";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";

interface TaskDetailViewProps {
  task?: Doc<"tasks"> | null;
  prefill?: Partial<TaskFormData>;
  staffMembers?: Doc<"staffMembers">[];
  onSave?: (data: TaskFormData) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
  readOnly?: boolean;
}

export function TaskDetailView({
  task,
  prefill,
  staffMembers,
  onSave,
  onDelete,
  onClose,
  readOnly = false,
}: TaskDetailViewProps) {
  const [dialogEl, setDialogEl] = useState<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useCallback((node: HTMLDivElement | null) => {
    setDialogEl(node);
  }, []);

  const guardedClose = useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);

  // Use ref to avoid re-attaching listener when guardedClose changes
  const onCloseRef = useRef(guardedClose);
  useEffect(() => {
    onCloseRef.current = guardedClose;
  });

  const guardedSave = useCallback(
    async (data: TaskFormData) => {
      if (!onSave) return;
      setSaving(true);
      try {
        await onSave(data);
      } finally {
        setSaving(false);
      }
    },
    [onSave],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-bg-base/60 backdrop-blur-sm"
        onClick={guardedClose}
      />

      {/* Responsive container: bottom sheet on mobile, centered modal on desktop */}
      <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-6">
        <div
          ref={dialogRef}
          className="bg-surface-elevated border-t border-x md:border border-border rounded-t-[8px] md:rounded-[4px] w-full md:max-w-[480px] max-h-[85dvh] md:max-h-[80vh] flex flex-col min-h-0 overflow-hidden animate-[slideUp_200ms_ease-out] md:animate-[fadeIn_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-label={task ? "Edit task" : "New task"}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center py-3 md:hidden">
            <div className="w-10 h-1 bg-border rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 pb-2 md:py-4 md:border-b md:border-border">
            <h2 className="text-[15px] font-medium text-text-primary">
              {readOnly ? "Task details" : task ? "Edit task" : "New task"}
            </h2>
            <button
              onClick={guardedClose}
              className="text-text-muted hover:text-text-secondary transition-colors duration-200"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>

          <TaskForm
            key={task?._id ?? "new"}
            task={task}
            prefill={prefill}
            staffMembers={staffMembers}
            hotkeyRoot={dialogEl}
            onSave={readOnly ? undefined : guardedSave}
            onDelete={readOnly ? undefined : onDelete}
            onClose={guardedClose}
            readOnly={readOnly}
          >
            {task?._id && <SubtaskList parentTaskId={task._id} readOnly={readOnly} />}
          </TaskForm>
        </div>
      </div>
    </>
  );
}
