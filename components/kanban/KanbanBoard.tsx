"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCardPreview } from "./TaskCard";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { COLUMN_ORDER, TaskStatus } from "@/lib/constants";
import { staffInitials } from "@/lib/staffUtils";

const SORT_ORDER_GAP = 1000;
const SORT_ORDER_BEFORE_FIRST_OFFSET = 500;

const noop = () => {};

interface KanbanBoardProps {
  tasks: Doc<"tasks">[];
  staffById: Map<string, Doc<"staffMembers">>;
  onMoveTask: (taskId: Id<"tasks">, newStatus: TaskStatus, newSortOrder: number) => void;
  onEditTask: (task: Doc<"tasks">) => void;
  onCompleteTask: (taskId: Id<"tasks">) => void;
  onClearCompleted?: () => void;
}

export const KanbanBoard = memo(function KanbanBoard({
  tasks,
  staffById,
  onMoveTask,
  onEditTask,
  onCompleteTask,
  onClearCompleted,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Hide/show Done column, persisted in localStorage
  const [showDone, setShowDone] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("kanban-show-done") === "true";
  });
  const toggleDone = useCallback(() => {
    setShowDone((prev) => {
      const next = !prev;
      localStorage.setItem("kanban-show-done", String(next));
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Doc<"tasks">[]> = {
      todo: [],
      inprogress: [],
      done: [],
    };
    for (const task of tasks) {
      grouped[task.status]?.push(task);
    }
    for (const key of Object.keys(grouped) as TaskStatus[]) {
      grouped[key].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return grouped;
  }, [tasks]);

  const taskMap = useMemo(
    () => new Map(tasks.map((t) => [t._id as string, t])),
    [tasks],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeTask = taskMap.get(String(active.id));
    if (!activeTask) return;

    let targetStatus: TaskStatus;
    const overTask = taskMap.get(String(over.id));

    if (overTask) {
      targetStatus = overTask.status;
    } else if (COLUMN_ORDER.includes(over.id as TaskStatus)) {
      targetStatus = over.id as TaskStatus;
    } else {
      return;
    }

    const targetTasks = tasksByStatus[targetStatus].filter(
      (t) => t._id !== activeTask._id,
    );
    let newSortOrder: number;

    if (overTask && overTask._id !== activeTask._id) {
      const overIndex = targetTasks.findIndex((t) => t._id === overTask._id);
      if (overIndex === 0) {
        newSortOrder = overTask.sortOrder - SORT_ORDER_BEFORE_FIRST_OFFSET;
      } else {
        const prevTask = targetTasks[overIndex - 1];
        newSortOrder = (prevTask.sortOrder + overTask.sortOrder) / 2;
      }
    } else if (targetTasks.length === 0) {
      newSortOrder = SORT_ORDER_GAP;
    } else {
      newSortOrder = targetTasks[targetTasks.length - 1].sortOrder + SORT_ORDER_GAP;
    }

    if (
      activeTask.status !== targetStatus ||
      activeTask.sortOrder !== newSortOrder
    ) {
      onMoveTask(activeTask._id, targetStatus, newSortOrder);
    }
  }, [taskMap, tasksByStatus, onMoveTask]);

  const activeTask = activeId ? taskMap.get(activeId) ?? null : null;
  const visibleColumns = showDone ? COLUMN_ORDER : COLUMN_ORDER.filter((s) => s !== "done");
  const doneCount = tasksByStatus.done.length;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        {/* Filter bar */}
        <div className="flex items-center justify-end px-4 py-2 shrink-0">
          <button
            onClick={toggleDone}
            type="button"
            aria-pressed={showDone}
            aria-label={showDone ? "Hide completed tasks" : "Show completed tasks"}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-[12px] font-medium transition-colors duration-200 ${
              showDone
                ? "bg-success/15 text-success"
                : "bg-surface text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon name="task_alt" className="w-4 h-4" />
            {showDone ? "Hide completed" : "Completed"}
            {doneCount > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                showDone ? "bg-success/25 text-success" : "bg-text-muted/20 text-text-muted"
              }`}>
                {doneCount}
              </span>
            )}
          </button>
        </div>

        <div className={`flex gap-0 flex-1 min-h-0 overflow-x-auto touch-pan-x md:overflow-x-visible ${
          activeId ? "snap-none" : "snap-x snap-mandatory md:snap-none"
        }`}>
          {visibleColumns.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              staffById={staffById}
              onEditTask={onEditTask}
              onCompleteTask={onCompleteTask}
              onClearCompleted={status === "done" ? onClearCompleted : undefined}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-[2deg] scale-[1.02]">
            <TaskCardPreview
              task={activeTask}
              assigneeInitials={
                activeTask.assignedStaffId
                  ? staffInitials(
                      staffById.get(activeTask.assignedStaffId)?.name ?? "?",
                    )
                  : undefined
              }
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
