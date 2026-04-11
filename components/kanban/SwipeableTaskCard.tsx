"use client";

import { memo, useCallback } from "react";
import { TaskCard } from "./TaskCard";
import { useSwipeAction } from "@/hooks/useSwipeAction";
import { Icon } from "@/components/ui/Icon";
import type { Doc, Id } from "@/convex/_generated/dataModel";

interface SwipeableTaskCardProps {
  task: Doc<"tasks">;
  assigneeInitials?: string;
  onEdit: (task: Doc<"tasks">) => void;
  onComplete: (taskId: Id<"tasks">) => void;
  draggable?: boolean;
  onStatusAdvance?: (taskId: Id<"tasks">) => void;
  onStatusRegress?: (taskId: Id<"tasks">) => void;
}

export const SwipeableTaskCard = memo(function SwipeableTaskCard({
  task,
  assigneeInitials,
  onEdit,
  onComplete,
  draggable,
  onStatusAdvance,
  onStatusRegress,
}: SwipeableTaskCardProps) {
  const canAdvance = task.status !== "done" && !!onStatusAdvance;
  const canRegress = task.status === "inprogress" && !!onStatusRegress;

  const handleSwipeLeft = useCallback(() => {
    if (canAdvance) onStatusAdvance!(task._id);
  }, [canAdvance, onStatusAdvance, task._id]);

  const handleSwipeRight = useCallback(() => {
    if (canRegress) onStatusRegress!(task._id);
  }, [canRegress, onStatusRegress, task._id]);

  const { offsetX, isSwiping, handlers } = useSwipeAction({
    onSwipeLeft: canAdvance ? handleSwipeLeft : undefined,
    onSwipeRight: canRegress ? handleSwipeRight : undefined,
  });

  const showAdvanceHint = offsetX < -20;
  const showRegressHint = offsetX > 20;

  return (
    <div className="relative overflow-hidden rounded-[4px]" {...handlers}>
      {/* Background hint — advance (swipe left) */}
      {showAdvanceHint && (
        <div className="absolute inset-0 flex items-center justify-end px-4 bg-accent/15 rounded-[4px]">
          <div className="flex items-center gap-1 text-accent text-[11px]">
            <span>{task.status === "todo" ? "In Progress" : "Done"}</span>
            <Icon name="arrow_forward" className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Background hint — regress (swipe right) */}
      {showRegressHint && (
        <div className="absolute inset-0 flex items-center justify-start px-4 bg-text-muted/10 rounded-[4px]">
          <div className="flex items-center gap-1 text-text-muted text-[11px]">
            <Icon name="arrow_back" className="w-4 h-4" />
            <span>To Do</span>
          </div>
        </div>
      )}

      {/* Card with transform */}
      <div
        className="relative"
        style={{
          transform: isSwiping ? `translateX(${offsetX}px)` : undefined,
          transition: isSwiping ? "none" : "transform 200ms ease-out",
        }}
      >
        <TaskCard
          task={task}
          assigneeInitials={assigneeInitials}
          onEdit={onEdit}
          onComplete={onComplete}
          draggable={draggable}
        />
      </div>
    </div>
  );
});
