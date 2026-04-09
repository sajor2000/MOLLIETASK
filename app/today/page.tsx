"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AppShell } from "@/components/layout/AppShell";
import { TaskDetailView } from "@/components/task/TaskDetailView";
import { UndoToast } from "@/components/ui/UndoToast";
import { ErrorToast } from "@/components/ui/ErrorToast";
import { Icon } from "@/components/ui/Icon";
import { WORKSTREAM_CONFIG } from "@/lib/constants";
import type { TaskFormData } from "@/lib/constants";
import { toCSTDateString, fromDateInputValue } from "@/lib/dates";
import { useTaskActions } from "@/hooks/useTaskActions";

export default function TodayPage() {
  const tasks = useQuery(api.tasks.getTasksByStatus, {});
  const staffList = useQuery(api.staff.listStaff);
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
      if (t.status === "done") continue;
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
          <button
            onClick={handleAddToday}
            className="p-2 text-text-muted hover:text-accent transition-colors duration-200"
          >
            <Icon name="add" className="w-5 h-5" />
          </button>
        </div>

        {tasks === undefined ? (
          <p className="text-[13px] text-text-muted text-center py-12">Loading...</p>
        ) : isEmpty ? (
          <div className="text-center py-16">
            <p className="text-[13px] text-text-muted">Nothing due today</p>
            <button
              onClick={handleAddToday}
              className="mt-3 text-[13px] text-accent hover:opacity-80 transition-opacity"
            >
              Add a task
            </button>
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

      {(editingTask || isCreating) && (
        <TaskDetailView
          task={editingTask}
          prefill={isCreating ? todayPrefill : undefined}
          staffMembers={staffList ?? []}
          onSave={handleSave}
          onDelete={editingTask ? () => handleDelete(editingTask._id) : undefined}
          onClose={() => { setEditingTask(null); setIsCreating(false); }}
        />
      )}

      {undoAction && (
        <UndoToast
          message="Task completed"
          onUndo={handleUndo}
          onExpire={clearUndo}
        />
      )}

      {errorMessage && !undoAction && (
        <ErrorToast message={errorMessage} onDismiss={clearError} />
      )}
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
          <TaskRow
            key={task._id}
            task={task}
            onComplete={() => onComplete(task._id)}
            onEdit={() => onEdit(task)}
          />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onComplete,
  onEdit,
}: {
  task: Doc<"tasks">;
  onComplete: () => void;
  onEdit: () => void;
}) {
  const wsConfig = WORKSTREAM_CONFIG[task.workstream];

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-[4px] bg-surface hover:bg-surface-elevated transition-colors duration-200 group">
      <button
        onClick={onComplete}
        className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-border hover:border-accent transition-colors duration-200"
        aria-label="Complete task"
      />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <p className="text-[13px] text-text-primary truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] ${wsConfig.textClass}`}>
            {wsConfig.label}
          </span>
          {task.priority === "high" && (
            <span className="text-[11px] text-destructive">High</span>
          )}
          {task.dueTime && (
            <span className="text-[11px] text-text-muted">{task.dueTime}</span>
          )}
        </div>
      </button>
    </div>
  );
}
