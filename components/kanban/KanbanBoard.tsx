"use client";

import { useState, useMemo, useCallback, memo } from "react";
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
import { MobileStatusTabs } from "./MobileStatusTabs";
import { TaskCard } from "./TaskCard";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { COLUMN_ORDER, TaskStatus } from "@/lib/constants";
import { staffInitials } from "@/lib/staffUtils";

const SORT_ORDER_GAP = 1000;
const SORT_ORDER_BEFORE_FIRST_OFFSET = 500;

const noop = () => {};

interface KanbanBoardProps {
  tasks: Doc<"tasks">[];
  staffById: Map<string, Doc<"staffMembers">>;
  onMoveTask?: (taskId: Id<"tasks">, newStatus: TaskStatus, newSortOrder: number) => void;
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
  const [mobileTab, setMobileTab] = useState<TaskStatus>("todo");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
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
    if (!onMoveTask) return;

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

  const taskCounts = useMemo(
    () => ({
      todo: tasksByStatus.todo.length,
      inprogress: tasksByStatus.inprogress.length,
      done: tasksByStatus.done.length,
    }),
    [tasksByStatus],
  );

  const handleStatusAdvance = useCallback(
    (taskId: Id<"tasks">) => {
      const task = taskMap.get(taskId as string);
      if (!task) return;
      if (task.status === "todo" && onMoveTask) {
        const ipTasks = tasksByStatus.inprogress;
        const newSort =
          ipTasks.length > 0
            ? ipTasks[ipTasks.length - 1].sortOrder + SORT_ORDER_GAP
            : SORT_ORDER_GAP;
        onMoveTask(taskId, "inprogress", newSort);
      } else if (task.status === "inprogress") {
        onCompleteTask(taskId);
      }
    },
    [taskMap, tasksByStatus, onMoveTask, onCompleteTask],
  );

  const handleStatusRegress = useCallback(
    (taskId: Id<"tasks">) => {
      const task = taskMap.get(taskId as string);
      if (!task || !onMoveTask) return;
      if (task.status === "inprogress") {
        const todoTasks = tasksByStatus.todo;
        const newSort =
          todoTasks.length > 0
            ? todoTasks[todoTasks.length - 1].sortOrder + SORT_ORDER_GAP
            : SORT_ORDER_GAP;
        onMoveTask(taskId, "todo", newSort);
      }
    },
    [taskMap, tasksByStatus, onMoveTask],
  );

  const activeTask = activeId ? taskMap.get(activeId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Mobile: tabbed single-column view */}
      <div className="flex flex-col h-full md:hidden">
        <MobileStatusTabs
          activeStatus={mobileTab}
          onStatusChange={setMobileTab}
          taskCounts={taskCounts}
        />
        <div className="flex-1 min-h-0">
          <KanbanColumn
            key={mobileTab}
            status={mobileTab}
            tasks={tasksByStatus[mobileTab]}
            staffById={staffById}
            onEditTask={onEditTask}
            onCompleteTask={onCompleteTask}
            onClearCompleted={mobileTab === "done" ? onClearCompleted : undefined}
            draggable={!!onMoveTask}
            swipeable={!!onMoveTask}
            onStatusAdvance={handleStatusAdvance}
            onStatusRegress={handleStatusRegress}
          />
        </div>
      </div>

      {/* Desktop: unchanged 3-column layout */}
      <div className="hidden md:flex gap-0 h-full">
        {COLUMN_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            staffById={staffById}
            onEditTask={onEditTask}
            onCompleteTask={onCompleteTask}
            onClearCompleted={status === "done" ? onClearCompleted : undefined}
            draggable={!!onMoveTask}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-[2deg] scale-[1.02]">
            <TaskCard
              task={activeTask}
              assigneeInitials={
                activeTask.assignedStaffId
                  ? staffInitials(
                      staffById.get(activeTask.assignedStaffId)?.name ?? "?",
                    )
                  : undefined
              }
              onEdit={noop}
              onComplete={noop}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
