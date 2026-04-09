"use client";

import { memo, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { TaskStatus, STATUS_CONFIG } from "@/lib/constants";
import { staffInitials } from "@/lib/staffUtils";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Doc<"tasks">[];
  staffById: Map<string, Doc<"staffMembers">>;
  onEditTask: (task: Doc<"tasks">) => void;
  onCompleteTask: (taskId: Id<"tasks">) => void;
  onClearCompleted?: () => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  status,
  tasks,
  staffById,
  onEditTask,
  onCompleteTask,
  onClearCompleted,
}: KanbanColumnProps) {
  const config = STATUS_CONFIG[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const taskIds = useMemo(() => tasks.map((t) => t._id), [tasks]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  return (
    <div
      className={`flex flex-col min-w-[85vw] md:min-w-0 md:flex-1 snap-center ${
        isOver ? "bg-accent/5" : ""
      } transition-colors duration-150`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-[12px] font-medium text-text-secondary uppercase tracking-widest">
          {config.label}
        </h2>
        <span className="text-[10px] text-text-muted">
          {tasks.length}
        </span>
        {status === "done" && tasks.length > 0 && onClearCompleted && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="ml-auto text-[11px] text-text-muted hover:text-destructive transition-colors duration-200"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Clear confirmation */}
      {showClearConfirm && (
        <div className="mx-3 mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-[4px]">
          <p className="text-[12px] text-text-primary mb-2">
            Delete {tasks.length} completed {tasks.length === 1 ? "task" : "tasks"}? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onClearCompleted?.();
                setShowClearConfirm(false);
              }}
              className="flex-1 py-1.5 text-[12px] font-medium bg-destructive/20 text-destructive rounded-[4px] hover:bg-destructive/30 transition-colors duration-200"
            >
              Delete all
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="flex-1 py-1.5 text-[12px] font-medium bg-surface text-text-secondary rounded-[4px] hover:bg-surface-elevated transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div
        ref={setNodeRef}
        className="flex-1 px-3 pb-4 space-y-3 overflow-y-auto"
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => {
            const staff = task.assignedStaffId
              ? staffById.get(task.assignedStaffId)
              : undefined;
            return (
              <TaskCard
                key={task._id}
                task={task}
                assigneeInitials={staff ? staffInitials(staff.name) : undefined}
                onEdit={onEditTask}
                onComplete={onCompleteTask}
              />
            );
          })}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-[120px] border border-dashed border-border/50 rounded-[4px] text-[13px] text-text-muted">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
});
