import type { IconName } from "@/components/ui/Icon";

export const DEFAULT_TIMEZONE = "America/Chicago";

export type Workstream = "practice" | "personal" | "family";
export type TaskStatus = "todo" | "inprogress" | "done";
export type Priority = "high" | "normal";

export const NAV_ITEMS: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Kanban", icon: "view_kanban" },
  { href: "/today", label: "Today", icon: "wb_sunny" },
  { href: "/calendar", label: "Calendar", icon: "calendar_today" },
];

export const WORKSTREAM_CONFIG: Record<
  Workstream,
  { label: string; bgClass: string; textClass: string }
> = {
  practice: {
    label: "Practice",
    bgClass: "bg-accent/15",
    textClass: "text-accent-light",
  },
  personal: {
    label: "Personal",
    bgClass: "bg-text-secondary/15",
    textClass: "text-text-secondary",
  },
  family: {
    label: "Family",
    bgClass: "bg-destructive/15",
    textClass: "text-destructive/80",
  },
};

export const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; bgClass: string; textClass: string }
> = {
  todo: { label: "To Do", bgClass: "bg-text-muted/20", textClass: "text-text-secondary" },
  inprogress: { label: "In Progress", bgClass: "bg-accent/15", textClass: "text-accent" },
  done: { label: "Done", bgClass: "bg-success/15", textClass: "text-success" },
};

export const COLUMN_ORDER: readonly TaskStatus[] = ["todo", "inprogress", "done"];

/** Shared type for task form save payloads */
export interface TaskFormData {
  title: string;
  workstream: Workstream;
  priority: Priority;
  status: TaskStatus;
  dueDate?: number;
  dueTime?: string;
  notes?: string;
}
