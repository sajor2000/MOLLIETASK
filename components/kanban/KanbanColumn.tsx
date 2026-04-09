"use client";

import { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { TaskStatus, STATUS_CONFIG } from "@/lib/constants";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Doc<"tasks">[];
  onEditTask: (task: Doc<"tasks">) => void;
  onCompleteTask: (taskId: Id<"tasks">) => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  status,
  tasks,
  onEditTask,
  onCompleteTask,
}: KanbanColumnProps) {
  const config = STATUS_CONFIG[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const taskIds = useMemo(() => tasks.map((t) => t._id), [tasks]);

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
      </div>

      {/* Task list */}
      <div
        ref={setNodeRef}
        className="flex-1 px-3 pb-4 space-y-3 overflow-y-auto"
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onEdit={onEditTask}
              onComplete={onCompleteTask}
            />
          ))}
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
