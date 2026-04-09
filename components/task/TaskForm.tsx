"use client";

import { useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import type { Workstream, Priority, TaskStatus, TaskFormData } from "@/lib/constants";
import { WORKSTREAM_CONFIG } from "@/lib/constants";
import { toDateInputValue, fromDateInputValue } from "@/lib/dates";

interface TaskFormProps {
  task?: Doc<"tasks"> | null;
  prefill?: Partial<TaskFormData>;
  onSave: (data: TaskFormData) => void;
  onDelete?: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export function TaskForm({ task, prefill, onSave, onDelete, onClose, children }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? "");
  const [workstream, setWorkstream] = useState<Workstream>(
    task?.workstream ?? prefill?.workstream ?? "practice"
  );
  const [priority, setPriority] = useState<Priority>(
    task?.priority ?? prefill?.priority ?? "normal"
  );
  const [status, setStatus] = useState<TaskStatus>(
    task?.status ?? prefill?.status ?? "todo"
  );
  const [dueDate, setDueDate] = useState(
    task?.dueDate
      ? toDateInputValue(task.dueDate)
      : prefill?.dueDate
        ? toDateInputValue(prefill.dueDate)
        : ""
  );
  const [dueTime, setDueTime] = useState(task?.dueTime ?? prefill?.dueTime ?? "");
  const [notes, setNotes] = useState(task?.notes ?? prefill?.notes ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      workstream,
      priority,
      status,
      dueDate: dueDate ? fromDateInputValue(dueDate) : undefined,
      dueTime: dueTime || undefined,
      notes: notes.trim() || undefined,
    });
  }

  const workstreamKeys = Object.keys(WORKSTREAM_CONFIG) as Workstream[];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {/* Title */}
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            maxLength={200}
            autoFocus
            className="w-full bg-transparent text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none py-2 border-b border-border focus:border-accent transition-colors duration-200"
          />
        </div>

        {/* Workstream toggle */}
        <div>
          <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Workstream
          </label>
          <div className="flex gap-1 bg-bg-base rounded-[4px] p-1">
            {workstreamKeys.map((ws) => (
              <button
                key={ws}
                type="button"
                onClick={() => setWorkstream(ws)}
                className={`flex-1 py-1.5 text-[13px] rounded-[4px] transition-all duration-200 ${
                  workstream === ws
                    ? "bg-surface text-accent"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {WORKSTREAM_CONFIG[ws].label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority toggle */}
        <div>
          <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Priority
          </label>
          <div className="flex gap-1 bg-bg-base rounded-[4px] p-1">
            {(["normal", "high"] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex-1 py-1.5 text-[13px] rounded-[4px] transition-all duration-200 ${
                  priority === p
                    ? p === "high"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-surface text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {p === "high" ? "High" : "Normal"}
              </button>
            ))}
          </div>
        </div>

        {/* Due date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
              Due date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
              Due time
            </label>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={!dueDate}
              className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary disabled:opacity-40 focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Quick date shortcuts */}
        {!dueDate && (
          <div className="flex gap-2">
            {[
              { label: "Today", offset: 0 },
              { label: "Tomorrow", offset: 1 },
              { label: "Next week", offset: 7 },
            ].map(({ label, offset }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + offset);
                  setDueDate(toDateInputValue(d.getTime()));
                }}
                className="px-3 py-1 text-[12px] text-text-secondary bg-bg-base border border-border/15 rounded-[4px] hover:border-accent/30 transition-colors duration-200"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes..."
            maxLength={2000}
            rows={3}
            className="w-full bg-bg-base border border-border/15 rounded-[4px] px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 resize-none"
          />
        </div>

        {/* Subtasks slot */}
        {children}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-border">
        {showDeleteConfirm ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onDelete}
              className="flex-1 py-2.5 bg-destructive/15 text-destructive rounded-[4px] text-[13px] font-medium hover:bg-destructive/25 transition-colors duration-200"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2.5 bg-surface text-text-secondary rounded-[4px] text-[13px] font-medium hover:bg-surface-elevated transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            {onDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="py-2.5 px-4 bg-destructive/10 text-destructive rounded-[4px] text-[13px] font-medium hover:bg-destructive/20 transition-colors duration-200"
              >
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 text-text-secondary text-[13px] hover:text-text-primary transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="py-2.5 px-6 bg-accent text-bg-base rounded-[4px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity duration-200"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
