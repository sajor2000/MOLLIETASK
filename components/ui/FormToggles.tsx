"use client";

import { useRef } from "react";
import { WORKSTREAM_CONFIG } from "@/lib/constants";
import type { Workstream, Priority, Recurring } from "@/lib/constants";

interface WorkstreamPickerProps {
  value: Workstream;
  onChange: (ws: Workstream) => void;
  labelledBy?: string;
}

function nextIndexFromKey(currentIndex: number, total: number, key: string): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return currentIndex === total - 1 ? 0 : currentIndex + 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return currentIndex === 0 ? total - 1 : currentIndex - 1;
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  return null;
}

export function WorkstreamPicker({ value, onChange, labelledBy }: WorkstreamPickerProps) {
  const keys = Object.keys(WORKSTREAM_CONFIG) as Workstream[];
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-1 bg-bg-base rounded-[4px] p-1">
      {keys.map((ws, index) => (
        <button
          key={ws}
          ref={(node) => {
            buttonRefs.current[index] = node;
          }}
          type="button"
          onClick={() => onChange(ws)}
          onKeyDown={(event) => {
            const nextIndex = nextIndexFromKey(index, keys.length, event.key);
            if (nextIndex === null) return;
            event.preventDefault();
            onChange(keys[nextIndex]);
            buttonRefs.current[nextIndex]?.focus();
          }}
          role="radio"
          aria-checked={value === ws}
          tabIndex={value === ws ? 0 : -1}
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
  labelledBy?: string;
}

export function PriorityPicker({ value, onChange, labelledBy }: PriorityPickerProps) {
  const options = ["normal", "high"] as Priority[];
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-1 bg-bg-base rounded-[4px] p-1">
      {options.map((p, index) => (
        <button
          key={p}
          ref={(node) => {
            buttonRefs.current[index] = node;
          }}
          type="button"
          onClick={() => onChange(p)}
          onKeyDown={(event) => {
            const nextIndex = nextIndexFromKey(index, options.length, event.key);
            if (nextIndex === null) return;
            event.preventDefault();
            onChange(options[nextIndex]);
            buttonRefs.current[nextIndex]?.focus();
          }}
          role="radio"
          aria-checked={value === p}
          tabIndex={value === p ? 0 : -1}
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
  labelledBy?: string;
}

export function RecurringPicker({ value, onChange, labelledBy }: RecurringPickerProps) {
  const options = [undefined, "daily", "weekdays", "weekly", "monthly"] as const;
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-1 bg-bg-base rounded-[4px] p-1">
      {options.map((r, index) => (
        <button
          key={r ?? "none"}
          ref={(node) => {
            buttonRefs.current[index] = node;
          }}
          type="button"
          onClick={() => onChange(r)}
          onKeyDown={(event) => {
            const nextIndex = nextIndexFromKey(index, options.length, event.key);
            if (nextIndex === null) return;
            event.preventDefault();
            onChange(options[nextIndex]);
            buttonRefs.current[nextIndex]?.focus();
          }}
          role="radio"
          aria-checked={value === r}
          tabIndex={value === r ? 0 : -1}
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
