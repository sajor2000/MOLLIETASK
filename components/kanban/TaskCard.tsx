"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WorkstreamBadge } from "@/components/ui/WorkstreamBadge";
import { PriorityDot } from "@/components/ui/PriorityDot";
import { Icon } from "@/components/ui/Icon";
import type { Doc } from "@/convex/_generated/dataModel";

interface TaskCardProps {
  task: Doc<"tasks">;
  onEdit: (task: Doc<"tasks">) => void;
  onComplete: (taskId: string) => void;
}

function formatDueDate(timestamp?: number): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7)
    return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const TaskCard = memo(function TaskCard({ task, onEdit, onComplete }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dueLabel = formatDueDate(task.dueDate);
  const isOverdue = task.dueDate && task.dueDate < Date.now() && task.status !== "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-surface rounded-[4px] p-4 transition-all duration-200 hover:bg-surface-elevated ${
        isDragging ? "opacity-50 scale-[1.02] ring-1 ring-accent/30" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <button
          className="mt-0.5 shrink-0 touch-none cursor-grab active:cursor-grabbing text-text-muted/40 hover:text-text-muted transition-colors"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <Icon name="drag_indicator" className="w-[18px] h-[18px]" />
        </button>

        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete(task._id);
          }}
          className="mt-0.5 w-[18px] h-[18px] rounded-[4px] border border-text-muted/40 shrink-0 flex items-center justify-center hover:border-accent transition-colors duration-200"
          aria-label={`Complete ${task.title}`}
        >
          {task.status === "done" && (
            <Icon name="check" className="w-[14px] h-[14px] text-success" />
          )}
        </button>

        {/* Content — clickable for edit */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onEdit(task)}
        >
          <p
            className={`text-[14px] text-text-primary leading-snug truncate ${
              task.status === "done" ? "line-through opacity-50" : ""
            }`}
          >
            {task.title}
          </p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <WorkstreamBadge workstream={task.workstream} />
            <PriorityDot priority={task.priority} />
            {dueLabel && (
              <span
                className={`text-[11px] ${
                  isOverdue ? "text-destructive" : "text-text-muted"
                }`}
              >
                {dueLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
