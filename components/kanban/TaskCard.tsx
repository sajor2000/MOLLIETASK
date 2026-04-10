"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WorkstreamBadge } from "@/components/ui/WorkstreamBadge";
import { PriorityDot } from "@/components/ui/PriorityDot";
import { Icon } from "@/components/ui/Icon";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatDueDate, isTaskOverdue } from "@/lib/dates";

interface TaskCardProps {
  task: Doc<"tasks">;
  assigneeInitials?: string;
  onEdit: (task: Doc<"tasks">) => void;
  onComplete: (taskId: Id<"tasks">) => void;
  draggable?: boolean;
}

export const TaskCard = memo(function TaskCard({
  task,
  assigneeInitials,
  onEdit,
  onComplete,
  draggable = true,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dueLabel = formatDueDate(task.dueDate);
  const isOverdue = isTaskOverdue(task.dueDate, task.status);
  const subtaskTotal = task.subtaskTotal ?? 0;
  const subtaskCompleted = task.subtaskCompleted ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-surface rounded-[4px] p-4 transition-colors duration-200 hover:bg-surface-elevated ${
        isDragging ? "opacity-50 scale-[1.02] ring-1 ring-accent/30" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        {draggable && (
          <button
            className="mt-0.5 shrink-0 touch-none cursor-grab active:cursor-grabbing text-text-muted/40 hover:text-text-muted transition-colors"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <Icon name="drag_indicator" className="w-[18px] h-[18px]" />
          </button>
        )}

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
          <div className="flex items-center gap-2">
            <p
              className={`text-[14px] text-text-primary leading-snug truncate flex-1 ${
                task.status === "done" ? "line-through opacity-50" : ""
              }`}
            >
              {task.title}
            </p>
            {subtaskTotal > 0 && (
              <span className="shrink-0 text-[11px] text-text-muted bg-bg-base px-1.5 py-0.5 rounded-[3px]">
                {subtaskCompleted}/{subtaskTotal}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <WorkstreamBadge workstream={task.workstream} />
            <PriorityDot priority={task.priority} />
            {assigneeInitials && (
              <span
                className="text-[10px] font-medium text-accent bg-accent/15 px-1.5 py-0.5 rounded-[3px] shrink-0"
                title="Assigned"
              >
                {assigneeInitials}
              </span>
            )}
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
