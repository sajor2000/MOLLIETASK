"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/ui/Icon";
import { textInputBase } from "@/components/ui/inputStyles";
import { SuggestStepsButton } from "./SuggestStepsButton";
import type { Id, Doc } from "@/convex/_generated/dataModel";

interface SubtaskListProps {
  parentTaskId: Id<"tasks">;
}

type Subtask = Doc<"subtasks">;

function SortableSubtaskItem({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: (id: Id<"subtasks">) => void;
  onDelete: (id: Id<"subtasks">) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 py-1.5 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {/* Drag handle */}
      <button
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-text-muted/30 hover:text-text-muted transition-colors"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <Icon name="drag_indicator" className="w-[14px] h-[14px]" />
      </button>

      {/* Checkbox */}
      <button
        onClick={() => onToggle(subtask._id)}
        className={`shrink-0 w-[16px] h-[16px] rounded-[3px] border flex items-center justify-center transition-colors duration-200 ${
          subtask.isComplete
            ? "bg-success/20 border-success/40"
            : "border-text-muted/30 hover:border-accent"
        }`}
        aria-label={`${subtask.isComplete ? "Uncheck" : "Check"} ${subtask.title}`}
      >
        {subtask.isComplete && (
          <Icon name="check" className="w-[11px] h-[11px] text-success" />
        )}
      </button>

      {/* Title */}
      <span
        className={`flex-1 text-[13px] leading-snug min-w-0 truncate ${
          subtask.isComplete
            ? "text-text-muted line-through"
            : "text-text-primary"
        }`}
      >
        {subtask.title}
      </span>

      {/* Delete button */}
      <button
        onClick={() => onDelete(subtask._id)}
        className="shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 text-text-muted hover:text-destructive transition-all duration-200"
        aria-label={`Delete ${subtask.title}`}
      >
        <Icon name="close" className="w-[14px] h-[14px]" />
      </button>
    </div>
  );
}

export function SubtaskList({ parentTaskId }: SubtaskListProps) {
  const subtasks = useQuery(api.subtasks.getSubtasks, { parentTaskId });
  const addSubtask = useMutation(api.subtasks.addSubtask);
  const toggleSubtask = useMutation(api.subtasks.toggleSubtask);
  const deleteSubtask = useMutation(api.subtasks.deleteSubtask);
  const reorderSubtask = useMutation(api.subtasks.reorderSubtask);

  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const subtaskIds = useMemo(
    () => (subtasks ?? []).map((s: Subtask) => s._id),
    [subtasks],
  );

  const handleAdd = useCallback(async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setNewTitle("");
    await addSubtask({ parentTaskId, title: trimmed });
    inputRef.current?.focus();
  }, [newTitle, addSubtask, parentTaskId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const handleToggle = useCallback(
    (subtaskId: Id<"subtasks">) => {
      toggleSubtask({ subtaskId });
    },
    [toggleSubtask],
  );

  const handleDelete = useCallback(
    (subtaskId: Id<"subtasks">) => {
      deleteSubtask({ subtaskId });
    },
    [deleteSubtask],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !subtasks || active.id === over.id) return;

      const activeSubtask = subtasks.find((s: Subtask) => s._id === active.id);
      const overSubtask = subtasks.find((s: Subtask) => s._id === over.id);
      if (!activeSubtask || !overSubtask) return;

      const filtered = subtasks.filter((s: Subtask) => s._id !== activeSubtask._id);
      const overIndex = filtered.findIndex((s: Subtask) => s._id === overSubtask._id);

      let newSortOrder: number;
      if (overIndex === 0) {
        newSortOrder = overSubtask.sortOrder - 500;
      } else {
        const prevSubtask = filtered[overIndex - 1];
        newSortOrder = (prevSubtask.sortOrder + overSubtask.sortOrder) / 2;
      }

      reorderSubtask({ subtaskId: activeSubtask._id, newSortOrder });
    },
    [subtasks, reorderSubtask],
  );

  if (subtasks === undefined) return null;

  const completedCount = subtasks.filter((s: Subtask) => s.isComplete).length;
  const atMax = subtasks.length >= 20;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest">
          Subtasks
        </label>
        {subtasks.length > 0 && (
          <span className="text-[11px] text-text-muted">
            {completedCount}/{subtasks.length}
          </span>
        )}
      </div>

      {/* Subtask list with drag-and-drop */}
      {subtasks.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={subtaskIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="mb-2">
              {subtasks.map((subtask: Subtask) => (
                <SortableSubtaskItem
                  key={subtask._id}
                  subtask={subtask}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add subtask input */}
      {!atMax && (
        <div className="flex items-center gap-2">
          <Icon name="add" className="w-[14px] h-[14px] text-text-muted/40 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add subtask..."
            maxLength={200}
            className={`${textInputBase} flex-1 text-[13px] leading-relaxed pt-1 pb-1.5 placeholder:text-text-muted/50`}
          />
          {newTitle.trim() && (
            <button
              type="button"
              onClick={handleAdd}
              className="text-[12px] text-accent hover:opacity-80 transition-opacity"
            >
              Add
            </button>
          )}
        </div>
      )}

      {/* AI suggest button */}
      {!atMax && (
        <div className="mt-2">
          <SuggestStepsButton
            parentTaskId={parentTaskId}
            hasSubtasks={subtasks.length > 0}
          />
        </div>
      )}
    </div>
  );
}
