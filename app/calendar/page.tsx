"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { AppShell } from "@/components/layout/AppShell";
import { TaskDetailView } from "@/components/task/TaskDetailView";
import { Icon } from "@/components/ui/Icon";
import { WORKSTREAM_CONFIG } from "@/lib/constants";
import type { TaskFormData } from "@/lib/constants";
import { toCSTDateString, fromDateInputValue } from "@/lib/dates";
import { useTaskActions } from "@/hooks/useTaskActions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage() {
  const tasks = useQuery(api.tasks.getTasksByStatus);
  const {
    editingTask,
    setEditingTask,
    isCreating,
    setIsCreating,
    handleSave,
    handleDelete,
    handleComplete,
  } = useTaskActions();

  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayStr = toCSTDateString(Date.now());

  // Group non-done tasks by CST date string, scoped to the visible month range
  const tasksByDate = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    // Visible range: up to 6 days before month start and 6 after month end
    const rangeStart = new Date(year, month, -6).getTime();
    const rangeEnd = new Date(year, month + 1, 7).getTime();

    const map = new Map<string, Doc<"tasks">[]>();
    for (const t of tasks ?? []) {
      if (t.status === "done" || !t.dueDate) continue;
      if (t.dueDate < rangeStart || t.dueDate > rangeEnd) continue;
      const dateStr = toCSTDateString(t.dueDate);
      const list = map.get(dateStr) ?? [];
      list.push(t);
      map.set(dateStr, list);
    }
    return map;
  }, [tasks, viewDate]);

  // Calendar grid for current month
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { date: number; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Leading empty cells
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date: d, dateStr, isCurrentMonth: true });
    }

    // Trailing empty cells to fill last row
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      for (let d = 1; d <= remaining; d++) {
        const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        days.push({ date: d, dateStr, isCurrentMonth: false });
      }
    }

    return days;
  }, [viewDate]);

  const selectedTasks = selectedDate ? (tasksByDate.get(selectedDate) ?? []) : [];

  const handlePrevMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    setSelectedDate(null);
  };

  const handleAddOnDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setIsCreating(true);
  };

  const createPrefill: Partial<TaskFormData> | undefined = isCreating && selectedDate
    ? { dueDate: fromDateInputValue(selectedDate) }
    : undefined;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Month header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={handlePrevMonth}
            className="p-2 text-text-muted hover:text-text-secondary transition-colors"
          >
            <Icon name="chevron_left" className="w-5 h-5" />
          </button>
          <h1 className="text-[15px] font-medium text-text-primary">
            {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
          </h1>
          <button
            onClick={handleNextMonth}
            className="p-2 text-text-muted hover:text-text-secondary transition-colors"
          >
            <Icon name="chevron_right" className="w-5 h-5" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-text-muted uppercase tracking-wider py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 border-t border-l border-border">
          {calendarDays.map((day) => {
            const dayTasks = tasksByDate.get(day.dateStr) ?? [];
            const isToday = day.dateStr === todayStr;
            const isSelected = day.dateStr === selectedDate;

            return (
              <button
                key={day.dateStr}
                onClick={() => setSelectedDate(day.dateStr === selectedDate ? null : day.dateStr)}
                className={`relative border-r border-b border-border p-1.5 min-h-[64px] md:min-h-[80px] text-left transition-colors duration-150 ${
                  isSelected
                    ? "bg-accent/10"
                    : day.isCurrentMonth
                      ? "bg-surface hover:bg-surface-elevated"
                      : "bg-bg-base"
                }`}
              >
                <span
                  className={`text-[12px] inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    isToday
                      ? "bg-accent text-bg-base font-medium"
                      : day.isCurrentMonth
                        ? "text-text-primary"
                        : "text-text-muted"
                  }`}
                >
                  {day.date}
                </span>
                {/* Task dots */}
                {dayTasks.length > 0 && (
                  <div className="flex gap-0.5 mt-1 flex-wrap">
                    {dayTasks.slice(0, 4).map((t) => (
                      <span
                        key={t._id}
                        className={`w-1.5 h-1.5 rounded-full ${WORKSTREAM_CONFIG[t.workstream].bgClass}`}
                      />
                    ))}
                    {dayTasks.length > 4 && (
                      <span className="text-[9px] text-text-muted leading-none">
                        +{dayTasks.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day task list */}
        {selectedDate && (
          <div className="mt-4 bg-surface rounded-[4px] border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-medium text-text-primary">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <button
                onClick={() => handleAddOnDate(selectedDate)}
                className="p-1 text-text-muted hover:text-accent transition-colors"
                aria-label="Add task on this date"
              >
                <Icon name="add" className="w-5 h-5" />
              </button>
            </div>

            {selectedTasks.length === 0 ? (
              <p className="text-[12px] text-text-muted py-3 text-center">No tasks on this day</p>
            ) : (
              <div className="space-y-1">
                {selectedTasks.map((task) => {
                  const wsConfig = WORKSTREAM_CONFIG[task.workstream];
                  return (
                    <div
                      key={task._id}
                      className="flex items-center gap-3 px-3 py-2 rounded-[4px] hover:bg-surface-elevated transition-colors duration-200"
                    >
                      <button
                        onClick={() => handleComplete(task._id)}
                        className="flex-shrink-0 w-4.5 h-4.5 rounded-full border-2 border-border hover:border-accent transition-colors"
                        aria-label="Complete"
                      />
                      <button
                        onClick={() => setEditingTask(task)}
                        className="flex-1 min-w-0 text-left"
                      >
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
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {(editingTask || isCreating) && (
        <TaskDetailView
          task={editingTask}
          prefill={createPrefill}
          onSave={handleSave}
          onDelete={editingTask ? () => handleDelete(editingTask._id) : undefined}
          onClose={() => { setEditingTask(null); setIsCreating(false); }}
        />
      )}
    </AppShell>
  );
}
