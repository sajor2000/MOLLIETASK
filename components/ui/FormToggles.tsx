"use client";

import { WORKSTREAM_CONFIG } from "@/lib/constants";
import type { Workstream, Priority, Recurring } from "@/lib/constants";

interface WorkstreamPickerProps {
  value: Workstream;
  onChange: (ws: Workstream) => void;
}

export function WorkstreamPicker({ value, onChange }: WorkstreamPickerProps) {
  const keys = Object.keys(WORKSTREAM_CONFIG) as Workstream[];
  return (
    <div className="flex gap-1 bg-bg-base rounded-[4px] p-1">
      {keys.map((ws) => (
        <button
          key={ws}
          type="button"
          onClick={() => onChange(ws)}
          className={`flex-1 py-1.5 text-[13px] rounded-[4px] transition-all duration-200 ${
            value === ws
              ? "bg-surface text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {WORKSTREAM_CONFIG[ws].label}
        </button>
      ))}
    </div>
  );
}

interface PriorityPickerProps {
  value: Priority;
  onChange: (p: Priority) => void;
}

export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <div className="flex gap-1 bg-bg-base rounded-[4px] p-1">
      {(["normal", "high"] as Priority[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`flex-1 py-1.5 text-[13px] rounded-[4px] transition-all duration-200 ${
            value === p
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
  );
}

interface RecurringPickerProps {
  value: Recurring | undefined;
  onChange: (r: Recurring | undefined) => void;
}

export function RecurringPicker({ value, onChange }: RecurringPickerProps) {
  return (
    <div className="flex gap-1 bg-bg-base rounded-[4px] p-1">
      {([undefined, "daily", "weekdays", "weekly", "monthly"] as const).map((r) => (
        <button
          key={r ?? "none"}
          type="button"
          onClick={() => onChange(r)}
          className={`flex-1 py-1.5 text-[12px] rounded-[4px] transition-all duration-200 ${
            value === r
              ? "bg-surface text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {r ? r.charAt(0).toUpperCase() + r.slice(1) : "None"}
        </button>
      ))}
    </div>
  );
}
