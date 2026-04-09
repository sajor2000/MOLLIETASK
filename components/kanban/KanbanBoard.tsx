"use client";

import { useState, useMemo } from "react";
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
import { TaskCard } from "./TaskCard";
import type { Doc } from "@/convex/_generated/dataModel";
import { COLUMN_ORDER, TaskStatus } from "@/lib/constants";

interface KanbanBoardProps {
  tasks: Doc<"tasks">[];
  onMoveTask: (taskId: string, newStatus: TaskStatus, newSortOrder: number) => void;
  onEditTask: (task: Doc<"tasks">) => void;
  onCompleteTask: (taskId: string) => void;
}

export function KanbanBoard({
  tasks,
  onMoveTask,
  onEditTask,
  onCompleteTask,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeTask = tasks.find((t) => t._id === active.id);
    if (!activeTask) return;

    let targetStatus: TaskStatus;
    const overTask = tasks.find((t) => t._id === over.id);

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
        newSortOrder = overTask.sortOrder - 500;
      } else {
        const prevTask = targetTasks[overIndex - 1];
        newSortOrder = (prevTask.sortOrder + overTask.sortOrder) / 2;
      }
    } else if (targetTasks.length === 0) {
      newSortOrder = 1000;
    } else {
      newSortOrder = targetTasks[targetTasks.length - 1].sortOrder + 1000;
    }

    if (
      activeTask.status !== targetStatus ||
      activeTask.sortOrder !== newSortOrder
    ) {
      onMoveTask(activeTask._id, targetStatus, newSortOrder);
    }
  };

  const activeTask = activeId
    ? tasks.find((t) => t._id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-0 h-full overflow-x-auto snap-x snap-mandatory md:snap-none md:overflow-x-visible">
        {COLUMN_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onEditTask={onEditTask}
            onCompleteTask={onCompleteTask}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-[2deg] scale-[1.02]">
            <TaskCard
              task={activeTask}
              onEdit={() => {}}
              onComplete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
