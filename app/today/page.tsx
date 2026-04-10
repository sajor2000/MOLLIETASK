"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { fromDateInputValue, toCSTDateString } from "@/lib/dates";
import { AppShell } from "@/components/layout/AppShell";
import { TaskListItem } from "@/components/task/TaskListItem";
import { TaskOverlays } from "@/components/task/TaskOverlays";
import { Icon } from "@/components/ui/Icon";
import type { TaskFormData } from "@/lib/constants";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function TodayPage() {
  const { isOwner, isMember } = useWorkspace();
  // Scoped query: only fetch overdue + today tasks (not future tasks)
  const [todayEndTs] = useState(() =>
    fromDateInputValue(toCSTDateString(Date.now())),
  );
  const tasks = useQuery(api.tasks.getTasksForDateRange, {
    rangeStartTs: 0,
    rangeEndTs: todayEndTs,
  });
  const staffList = useQuery(api.staff.listStaff, isMember ? "skip" : {});
  const {
    editingTask,
    setEditingTask,
    isCreating,
    setIsCreating,
    handleSave,
    handleDelete,
    handleComplete,
    handleUndo,
    undoAction,
    clearUndo,
    errorMessage,
    clearError,
  } = useTaskActions(tasks);

  const [todayStr] = useState(() => toCSTDateString(Date.now()));

  const { overdue, today, noDueDate } = useMemo(() => {
    const overdue: Doc<"tasks">[] = [];
    const today: Doc<"tasks">[] = [];
    const noDueDate: Doc<"tasks">[] = [];

    for (const t of tasks ?? []) {
      if (!t.dueDate) {
        noDueDate.push(t);
      } else {
        const dateStr = toCSTDateString(t.dueDate);
        if (dateStr < todayStr) overdue.push(t);
        else if (dateStr === todayStr) today.push(t);
      }
    }

    return { overdue, today, noDueDate };
  }, [tasks, todayStr]);

  const handleAddToday = () => {
    setIsCreating(true);
  };

  const todayPrefill: Partial<TaskFormData> = {
    dueDate: fromDateInputValue(todayStr),
  };

  const isEmpty = overdue.length === 0 && today.length === 0;

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[15px] font-medium text-text-primary">Today</h1>
            <p className="text-[12px] text-text-muted mt-0.5">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          {!isMember && (
            <button
              onClick={handleAddToday}
              className="p-2 text-text-muted hover:text-accent transition-colors duration-200"
            >
              <Icon name="add" className="w-5 h-5" />
            </button>
          )}
        </div>

        {tasks === undefined ? (
          <div className="space-y-3 py-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[52px] bg-surface rounded-[4px] animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="text-center py-16">
            <p className="text-[13px] text-text-muted">Nothing due today</p>
            {!isMember && (
              <button
                onClick={handleAddToday}
                className="mt-3 text-[13px] text-accent hover:opacity-80 transition-opacity"
              >
                Add a task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {overdue.length > 0 && (
              <TaskSection
                label="Overdue"
                labelClass="text-destructive"
                tasks={overdue}
                onComplete={handleComplete}
                onEdit={setEditingTask}
              />
            )}
            {today.length > 0 && (
              <TaskSection
                label="Today"
                labelClass="text-accent"
                tasks={today}
                onComplete={handleComplete}
                onEdit={setEditingTask}
              />
            )}
          </div>
        )}

        {noDueDate.length > 0 && !isEmpty && (
          <div className="mt-8 pt-6 border-t border-border">
            <TaskSection
              label="No due date"
              labelClass="text-text-muted"
              tasks={noDueDate.slice(0, 5)}
              onComplete={handleComplete}
              onEdit={setEditingTask}
            />
          </div>
        )}
      </div>

      <TaskOverlays
        editingTask={editingTask}
        isCreating={isCreating}
        prefill={isCreating ? todayPrefill : undefined}
        staffMembers={staffList ?? []}
        isOwner={isOwner}
        isMember={isMember}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => { setEditingTask(null); setIsCreating(false); }}
        undoAction={undoAction}
        onUndo={handleUndo}
        onUndoExpire={clearUndo}
        errorMessage={errorMessage}
        onErrorDismiss={clearError}
      />
    </AppShell>
  );
}

function TaskSection({
  label,
  labelClass,
  tasks,
  onComplete,
  onEdit,
}: {
  label: string;
  labelClass: string;
  tasks: Doc<"tasks">[];
  onComplete: (id: Id<"tasks">) => void;
  onEdit: (task: Doc<"tasks">) => void;
}) {
  return (
    <div>
      <p className={`text-[11px] font-medium uppercase tracking-widest mb-2 ${labelClass}`}>
        {label} ({tasks.length})
      </p>
      <div className="space-y-1">
        {tasks.map((task) => (
          <TaskListItem
            key={task._id}
            task={task}
            onComplete={onComplete}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}
