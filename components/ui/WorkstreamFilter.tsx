"use client";

import { WORKSTREAM_CONFIG, type Workstream } from "@/lib/constants";

interface WorkstreamFilterProps {
  value: Workstream | null;
  onChange: (v: Workstream | null) => void;
  className?: string;
}

const WORKSTREAM_KEYS = Object.keys(WORKSTREAM_CONFIG) as Workstream[];
const BASE = "text-[11px] font-medium px-2.5 py-1 rounded-[4px] transition-colors duration-150";
const INACTIVE = `${BASE} bg-surface border border-border/30 text-text-muted hover:text-text-secondary hover:border-border`;

export function WorkstreamFilter({ value, onChange, className }: WorkstreamFilterProps) {
  return (
    <div role="group" aria-label="Filter by workstream" className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={value === null ? `${BASE} bg-accent/15 text-accent border border-accent/20` : INACTIVE}
      >
        All
      </button>
      {WORKSTREAM_KEYS.map((key) => {
        const cfg = WORKSTREAM_CONFIG[key];
        return (
          <button
            type="button"
            key={key}
            aria-pressed={value === key}
            onClick={() => onChange(value === key ? null : key)}
            className={value === key ? `${BASE} ${cfg.bgClass} ${cfg.textClass} border border-transparent` : INACTIVE}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}
