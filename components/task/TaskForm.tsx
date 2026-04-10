"use client";

import { useState, useEffect, useMemo, useCallback, useId, useRef } from "react";
import Link from "next/link";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { Workstream, Priority, Recurring, TaskStatus, TaskFormData } from "@/lib/constants";
import { STATUS_CONFIG } from "@/lib/constants";
import { toDateInputValue, fromDateInputValue } from "@/lib/dates";
import { staffLabel } from "@/lib/staffUtils";
import { WorkstreamPicker, PriorityPicker, RecurringPicker } from "@/components/ui/FormToggles";
import { textInputBase } from "@/components/ui/inputStyles";
import { TaskAttachments } from "./TaskAttachments";

interface TaskFormProps {
  task?: Doc<"tasks"> | null;
  prefill?: Partial<TaskFormData>;
  staffMembers?: Doc<"staffMembers">[];
  /** When set, assignee digit hotkeys listen on this node only (task modal). */
  hotkeyRoot?: HTMLElement | null;
  onSave: (data: TaskFormData) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  autoFocusTitle?: boolean;
  children?: React.ReactNode;
}

const titleInputClass = `${textInputBase} w-full text-[15px] leading-[1.4] pt-3.5 pb-3 min-h-[48px] border-b border-border focus:border-accent`;
const statusOptions = ["todo", "inprogress"] as const;

export function TaskForm({
  task,
  prefill,
  staffMembers = [],
  hotkeyRoot,
  onSave,
  onDelete,
  onClose,
  onDirtyChange,
  autoFocusTitle = false,
  children,
}: TaskFormProps) {
  const titleInputId = useId();
  const workstreamLabelId = useId();
  const priorityLabelId = useId();
  const statusLabelId = useId();
  const assigneeInputId = useId();
  const dueDateInputId = useId();
  const dueTimeInputId = useId();
  const recurringLabelId = useId();
  const notesInputId = useId();
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
  const [recurring, setRecurring] = useState<Recurring | undefined>(
    task?.recurring ?? prefill?.recurring ?? undefined
  );
  const [notes, setNotes] = useState(task?.notes ?? prefill?.notes ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assignedStaffId, setAssignedStaffId] = useState<Id<"staffMembers"> | null>(
    task?.assignedStaffId ?? prefill?.assignedStaffId ?? null,
  );
  const statusButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const initialValues = useMemo(() => ({
    title: task?.title ?? prefill?.title ?? "",
    workstream: task?.workstream ?? prefill?.workstream ?? "practice",
    priority: task?.priority ?? prefill?.priority ?? "normal",
    status: task?.status ?? prefill?.status ?? "todo",
    dueDate: task?.dueDate
      ? toDateInputValue(task.dueDate)
      : prefill?.dueDate
        ? toDateInputValue(prefill.dueDate)
        : "",
    dueTime: task?.dueTime ?? prefill?.dueTime ?? "",
    recurring: task?.recurring ?? prefill?.recurring ?? undefined,
    notes: task?.notes ?? prefill?.notes ?? "",
    assignedStaffId: task?.assignedStaffId ?? prefill?.assignedStaffId ?? null,
  }), [task, prefill]);

  const staffSlots = useMemo(
    () => [...staffMembers].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 9),
    [staffMembers],
  );

  const isTypingTarget = useCallback((el: EventTarget | null) => {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.isContentEditable;
  }, []);

  useEffect(() => {
    if (!hotkeyRoot || staffSlots.length === 0) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "0") {
        e.preventDefault();
        setAssignedStaffId(null);
        return;
      }

      const digit = e.key.length === 1 ? e.key.charCodeAt(0) - 48 : -1;
      if (digit >= 1 && digit <= 9) {
        const idx = digit - 1;
        if (idx < staffSlots.length) {
          e.preventDefault();
          setAssignedStaffId(staffSlots[idx]._id);
        }
      }
    }

    hotkeyRoot.addEventListener("keydown", onKeyDown, true);
    return () => hotkeyRoot.removeEventListener("keydown", onKeyDown, true);
  }, [hotkeyRoot, staffSlots, isTypingTarget]);

  const isDirty = title !== initialValues.title
    || workstream !== initialValues.workstream
    || priority !== initialValues.priority
    || status !== initialValues.status
    || dueDate !== initialValues.dueDate
    || dueTime !== initialValues.dueTime
    || recurring !== initialValues.recurring
    || notes !== initialValues.notes
    || assignedStaffId !== initialValues.assignedStaffId;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleStatusKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = statusOptions.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextStatus = statusOptions[nextIndex];
    setStatus(nextStatus);
    statusButtonRefs.current[nextIndex]?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    await Promise.resolve(
      onSave({
        title: title.trim(),
        workstream,
        priority,
        status,
        dueDate: dueDate ? fromDateInputValue(dueDate) : undefined,
        dueTime: dueTime || undefined,
        recurring: dueDate ? recurring : undefined,
        notes: notes.trim() || undefined,
        assignedStaffId,
      }),
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] [scroll-padding-bottom:calc(theme(spacing.24)+var(--keyboard-offset,0px))]"
    >
      <div className="px-6 pt-2 space-y-4 [padding-bottom:calc(theme(spacing.24)+var(--keyboard-offset,0px))]">
        {/* Title */}
        <div>
          <label htmlFor={titleInputId} className="sr-only">
            Task title
          </label>
          <input
            id={titleInputId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            maxLength={200}
            autoFocus={autoFocusTitle}
            data-task-title-input="true"
            className={titleInputClass}
          />
        </div>

        {/* Workstream toggle */}
        <fieldset>
          <legend id={workstreamLabelId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Workstream
          </legend>
          <WorkstreamPicker value={workstream} onChange={setWorkstream} labelledBy={workstreamLabelId} />
        </fieldset>

        {/* Priority toggle */}
        <fieldset>
          <legend id={priorityLabelId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Priority
          </legend>
          <PriorityPicker value={priority} onChange={setPriority} labelledBy={priorityLabelId} />
        </fieldset>

        {/* Status — exclude "done" to prevent bypassing completeTaskCore */}
        <fieldset>
          <legend id={statusLabelId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Status
          </legend>
          <div role="radiogroup" aria-labelledby={statusLabelId} className="flex gap-1 bg-bg-base rounded-[4px] p-1">
            {statusOptions.map((s, index) => (
              <button
                key={s}
                ref={(node) => {
                  statusButtonRefs.current[index] = node;
                }}
                type="button"
                onClick={() => setStatus(s)}
                onKeyDown={(event) => handleStatusKeyDown(event, index)}
                role="radio"
                aria-checked={status === s}
                tabIndex={status === s ? 0 : -1}
                className={`flex-1 py-1.5 text-[13px] rounded-[4px] transition-all duration-200 ${
                  status === s
                    ? "bg-surface text-accent"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Assignee */}
        <div>
          <label htmlFor={assigneeInputId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Assigned to
          </label>
          {staffMembers.length === 0 ? (
            <p className="text-[12px] text-text-muted py-1">
              Add people on the{" "}
              <Link href="/team" className="text-accent hover:underline">
                Team
              </Link>{" "}
              page to assign tasks.
            </p>
          ) : (
            <>
              <select
                id={assigneeInputId}
                value={assignedStaffId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const match = staffMembers.find((s) => s._id === val);
                  setAssignedStaffId(match ? match._id : null);
                }}
                className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 pt-2 pb-2.5 text-[13px] leading-relaxed text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
              >
                <option value="">Me (default)</option>
                {[...staffMembers]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((s) => (
                    <option key={s._id} value={s._id}>
                      {staffLabel(s)}
                    </option>
                  ))}
              </select>
              {staffSlots.length > 0 && (
                <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
                  Keys 1–9 assign (order on Team page). 0 clears. Disabled while typing in a field.
                </p>
              )}
            </>
          )}
        </div>

        {/* Due date */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={dueDateInputId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
              Due date
            </label>
            <input
              id={dueDateInputId}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 pt-2 pb-2.5 text-[13px] leading-relaxed text-text-primary focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
            />
          </div>
          <div>
            <label htmlFor={dueTimeInputId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
              Due time
            </label>
            <input
              id={dueTimeInputId}
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={!dueDate}
              className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 pt-2 pb-2.5 text-[13px] leading-relaxed text-text-primary disabled:opacity-60 focus:outline-none focus:border-accent transition-colors duration-200 [color-scheme:dark]"
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
                className="px-3 py-1 text-[12px] text-text-secondary bg-bg-base border border-border/40 rounded-[4px] hover:border-accent/30 transition-colors duration-200"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Recurring */}
        {dueDate && (
          <fieldset>
            <legend id={recurringLabelId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
              Repeat
            </legend>
            <RecurringPicker value={recurring} onChange={setRecurring} labelledBy={recurringLabelId} />
          </fieldset>
        )}

        {/* Notes */}
        <div>
          <label htmlFor={notesInputId} className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
            Notes
          </label>
          <textarea
            id={notesInputId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes..."
            maxLength={2000}
            rows={3}
            className="w-full bg-bg-base border border-border/40 rounded-[4px] px-3 pt-2 pb-2.5 text-[13px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 resize-none"
          />
        </div>

        {task?._id ? (
          <TaskAttachments taskId={task._id} />
        ) : (
          <div>
            <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
              Attachments
            </label>
            <p className="text-[13px] text-text-muted py-1">Save the task to add files.</p>
          </div>
        )}

        {/* Subtasks slot */}
        {children}
      </div>

      {/* Actions */}
      <div className="sticky bottom-[var(--keyboard-offset,0px)] z-10 px-6 py-3 border-t border-border bg-surface-elevated [padding-bottom:calc(theme(spacing.4)+env(safe-area-inset-bottom))]">
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
