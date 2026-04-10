"use client";

import { memo, useState } from "react";
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
}

interface TaskCardBodyProps {
  task: Doc<"tasks">;
  assigneeInitials?: string;
  onEdit?: () => void;
  onComplete?: () => void;
  completing?: boolean;
  isDragging?: boolean;
  dragHandle?: React.ReactNode;
}

function TaskCardBody({
  task,
  assigneeInitials,
  onEdit,
  onComplete,
  completing = false,
  isDragging = false,
  dragHandle,
}: TaskCardBodyProps) {
  const dueLabel = formatDueDate(task.dueDate);
  const isOverdue = isTaskOverdue(task.dueDate, task.status);
  const subtaskTotal = task.subtaskTotal ?? 0;
  const subtaskCompleted = task.subtaskCompleted ?? 0;

  return (
    <div
      className={`group bg-surface rounded-[4px] p-4 transition-colors duration-200 hover:bg-surface-elevated ${
        isDragging ? "opacity-50 scale-[1.02] ring-1 ring-accent/30" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {dragHandle}

        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!onComplete || task.status === "done" || completing) return;
            onComplete();
          }}
          type="button"
          disabled={!onComplete}
          className={`mt-0.5 w-[18px] h-[18px] rounded-[4px] border shrink-0 flex items-center justify-center transition-all duration-200 ${
            completing || task.status === "done"
              ? "border-success bg-success/20"
              : "border-text-muted/60 hover:border-accent"
          } ${!onComplete ? "pointer-events-none" : ""}`}
          aria-label={`Complete ${task.title}`}
        >
          {(completing || task.status === "done") && (
            <Icon name="check" className="w-[14px] h-[14px] text-success animate-[checkPop_200ms_ease-out]" />
          )}
        </button>

        {/* Content — clickable for edit */}
        <button
          type="button"
          className="flex-1 min-w-0 text-left cursor-pointer"
          onClick={() => onEdit?.()}
          disabled={!onEdit}
          aria-label={onEdit ? `Edit ${task.title}` : undefined}
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
            {task.recurring && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-accent/70" title={`Repeats ${task.recurring}`}>
                <Icon name="repeat" className="w-3 h-3" />
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
        </button>
      </div>
    </div>
  );
}

export const TaskCard = memo(function TaskCard({
  task,
  assigneeInitials,
  onEdit,
  onComplete,
}: TaskCardProps) {
  const [completing, setCompleting] = useState(false);
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

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCardBody
        task={task}
        assigneeInitials={assigneeInitials}
        onEdit={() => onEdit(task)}
        onComplete={() => {
          if (task.status === "done" || completing) return;
          setCompleting(true);
          setTimeout(() => onComplete(task._id), 300);
        }}
        completing={completing}
        isDragging={isDragging}
        dragHandle={(
          <button
            type="button"
            className="mt-0.5 shrink-0 touch-none cursor-grab active:cursor-grabbing text-text-muted/40 hover:text-text-muted transition-colors"
            aria-label={`Drag to reorder ${task.title}`}
            {...attributes}
            {...listeners}
          >
            <Icon name="drag_indicator" className="w-[18px] h-[18px]" />
          </button>
        )}
      />
    </div>
  );
});

interface TaskCardPreviewProps {
  task: Doc<"tasks">;
  assigneeInitials?: string;
}

export const TaskCardPreview = memo(function TaskCardPreview({
  task,
  assigneeInitials,
}: TaskCardPreviewProps) {
  return (
    <TaskCardBody
      task={task}
      assigneeInitials={assigneeInitials}
      dragHandle={
        <span className="mt-0.5 shrink-0 text-text-muted/40">
          <Icon name="drag_indicator" className="w-[18px] h-[18px]" />
        </span>
      }
    />
  );
});
