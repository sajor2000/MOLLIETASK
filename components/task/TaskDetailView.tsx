"use client";

import { useEffect } from "react";
import { TaskForm } from "./TaskForm";
import { Icon } from "@/components/ui/Icon";
import type { Doc } from "@/convex/_generated/dataModel";

interface TaskDetailViewProps {
  task?: Doc<"tasks"> | null;
  onSave: (data: {
    title: string;
    workstream: "practice" | "personal" | "family";
    priority: "high" | "normal";
    status: "todo" | "inprogress" | "done";
    dueDate?: number;
    dueTime?: string;
    notes?: string;
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function TaskDetailView({
  task,
  onSave,
  onDelete,
  onClose,
}: TaskDetailViewProps) {
  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
        className="fixed inset-0 z-40 bg-bg-base/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Responsive container: bottom sheet on mobile, centered modal on desktop */}
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6">
        <div
          className="bg-surface-elevated border-t border-x md:border border-border rounded-t-[8px] md:rounded-[4px] w-full md:max-w-[480px] max-h-[85vh] md:max-h-[80vh] flex flex-col animate-[slideUp_200ms_ease-out] md:animate-[fadeIn_150ms_ease-out]"
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
              {task ? "Edit task" : "New task"}
            </h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-secondary transition-colors duration-200"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>

          <TaskForm
            task={task}
            onSave={onSave}
            onDelete={onDelete}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  );
}
