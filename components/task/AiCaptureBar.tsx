"use client";

import { useState, useRef, memo } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/ui/Icon";
import { toCSTDateString, fromDateInputValue } from "@/lib/dates";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TaskFormData, TaskStatus } from "@/lib/constants";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI timed out")), ms),
    ),
  ]);
}

interface AiCaptureBarProps {
  tasks: Doc<"tasks">[];
  staffMembers?: Doc<"staffMembers">[];
  onAddTask: (prefill: Partial<TaskFormData>) => void;
  onEditTask: (task: Doc<"tasks">, changes: Partial<TaskFormData>) => void;
  onCompleteTask: (taskId: Id<"tasks">) => void;
  onDeleteTask: (taskId: Id<"tasks">) => void;
}

export const AiCaptureBar = memo(function AiCaptureBar({
  tasks,
  staffMembers = [],
  onAddTask,
  onEditTask,
  onCompleteTask,
  onDeleteTask,
}: AiCaptureBarProps) {
  const parseIntent = useAction(api.aiActions.parseTaskIntent);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Single derivation of active tasks — used for both context and index lookup
  function getActiveTasks() {
    return tasks.filter((t) => t.status !== "done").slice(0, 100);
  }

  const WORKSTREAMS = ["practice", "personal", "family"] as const;
  const PRIORITIES = ["high", "normal"] as const;

  /** Convert AI-parsed fields to TaskFormData-compatible shape */
  function toFormFields(fields: Record<string, unknown>): Partial<TaskFormData> {
    const result: Partial<TaskFormData> = {};
    if (typeof fields.title === "string") result.title = fields.title;
    if (typeof fields.workstream === "string" && (WORKSTREAMS as readonly string[]).includes(fields.workstream))
      result.workstream = fields.workstream as typeof WORKSTREAMS[number];
    if (typeof fields.priority === "string" && (PRIORITIES as readonly string[]).includes(fields.priority))
      result.priority = fields.priority as typeof PRIORITIES[number];
    if (typeof fields.dueDate === "string")
      result.dueDate = fromDateInputValue(fields.dueDate);
    if (typeof fields.dueTime === "string") result.dueTime = fields.dueTime;
    if (typeof fields.notes === "string") result.notes = fields.notes;
    if (typeof fields.assignedStaffIndex === "number") {
      const sorted = [...staffMembers].sort((a, b) => a.sortOrder - b.sortOrder);
      const staff = sorted[fields.assignedStaffIndex];
      if (staff) result.assignedStaffId = staff._id;
    }
    return result;
  }

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const activeTasks = getActiveTasks();
      const taskContext = activeTasks.map((t, i) => ({
        index: i,
        title: t.title,
        workstream: t.workstream,
        status: t.status,
        dueDateStr: t.dueDate ? toCSTDateString(t.dueDate) : undefined,
      }));
      const sortedStaff = [...staffMembers].sort((a, b) => a.sortOrder - b.sortOrder);
      const staffContext = sortedStaff.map((s, i) => ({
        index: i,
        name: s.name,
        roleTitle: s.roleTitle,
      }));
      const todayDate = toCSTDateString(Date.now());

      const result = await withTimeout(
        parseIntent({ input: trimmed, taskContext, staffContext, todayDate }),
        5000,
      );

      if (result.intent === "add") {
        const fields = toFormFields((result.fields ?? {}) as Record<string, unknown>);
        if (!fields.title) fields.title = trimmed;
        if (!fields.status) fields.status = "todo" as TaskStatus;
        onAddTask(fields);
        setInput("");
      } else if (result.intent === "edit") {
        const task =
          result.taskIndex !== undefined
            ? activeTasks[result.taskIndex]
            : undefined;

        if (!task) {
          onAddTask({ title: trimmed, status: "todo" as TaskStatus });
          setInput("");
          return;
        }

        const changes = toFormFields((result.fields ?? {}) as Record<string, unknown>);
        onEditTask(task, changes);
        setInput("");
      } else if (result.intent === "complete") {
        const task =
          result.taskIndex !== undefined
            ? activeTasks[result.taskIndex]
            : undefined;

        if (!task) {
          setError("Couldn't find that task.");
          return;
        }

        onCompleteTask(task._id);
        setInput("");
      } else if (result.intent === "delete") {
        const task =
          result.taskIndex !== undefined
            ? activeTasks[result.taskIndex]
            : undefined;

        if (!task) {
          setError("Couldn't find that task.");
          return;
        }

        if (window.confirm(`Delete "${task.title}"?`)) {
          onDeleteTask(task._id);
          setInput("");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("Rate limited")) {
        setError(msg);
      } else {
        console.error("AI parse failed:", msg);
        onAddTask({ title: trimmed, status: "todo" as TaskStatus });
        setInput("");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Icon
          name="auto_awesome"
          className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
            isLoading ? "text-accent animate-pulse" : "text-text-muted"
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Add a task... try natural language"
          disabled={isLoading}
          maxLength={500}
          className="bg-bg-base border border-outline-variant/10 rounded-[4px] pl-9 pr-4 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 w-64 disabled:opacity-60"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="absolute top-full left-0 mt-1 z-50">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
});
