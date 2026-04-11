---
title: "Workstream Filter Chips — Implementation & Code Review Fixes"
date: 2026-04-11
category: ui-features
tags:
  - react
  - nextjs
  - tailwindcss
  - custom-hooks
  - accessibility
  - code-review
  - filtering
  - kanban
  - calendar
problem_type: ui-feature
components:
  - WorkstreamFilter
  - useWorkstreamFilter
  - KanbanBoard
  - TodayPage
  - CalendarPage
symptoms:
  - filter buttons caused unintended form submissions (missing type="button")
  - unsound TypeScript cast via Object.entries on union-keyed Record
  - Tailwind padding classes conflicting between component defaults and caller overrides
  - duplicated useState and useMemo filter logic across three pages
  - chained useMemos creating unnecessary intermediate filtered arrays
  - calendar empty-state message misleading when filter was active
  - filter chips missing aria-pressed and role="group" accessibility attributes
  - duplicate constant imports across multiple page files
  - Kanban performing two-pass filter instead of single-pass predicate
solution_summary: >
  Added workstream filter chips (All / Practice / Personal / Family) to Kanban,
  Today, and Calendar views, surfacing the pre-existing `workstream` schema field
  as a pure UI feature. A subsequent multi-agent code review identified 9 issues
  (1 P1, 5 P2, 3 P3) which were all resolved: form-submission footgun fixed with
  type="button", TypeScript cast corrected to Object.keys, Tailwind padding
  conflict removed by letting callers own spacing, duplicated filter state
  extracted into useWorkstreamFilter() hook, chained useMemos merged into
  downstream memos, calendar empty-state made context-aware, ARIA attributes
  added, duplicate imports consolidated, and Kanban filter reduced to a
  single-pass predicate.
related_files:
  - components/ui/WorkstreamFilter.tsx
  - hooks/useWorkstreamFilter.ts
  - app/page.tsx
  - app/today/page.tsx
  - app/calendar/page.tsx
  - lib/constants.ts
---

# Workstream Filter Chips — Implementation & Code Review Fixes

## Problem

The app already stored a required `workstream` field (`"practice" | "personal" | "family"`) on every task and displayed it as a colored badge on each card, but there was no way to filter the task list by workstream. Only text search existed in the Kanban view.

The task: add **All / Practice / Personal / Family** filter chips to the Kanban, Today, and Calendar views — pure client-side, no schema or server changes.

---

## Solution

### New file: `components/ui/WorkstreamFilter.tsx`

```tsx
"use client";
import { WORKSTREAM_CONFIG, type Workstream } from "@/lib/constants";

interface WorkstreamFilterProps {
  value: Workstream | null;
  onChange: (v: Workstream | null) => void;
  className?: string;
}

// Hoisted to module scope — avoids Object.entries cast and recreating the array each render
const WORKSTREAM_KEYS = Object.keys(WORKSTREAM_CONFIG) as Workstream[];
const BASE = "text-[11px] font-medium px-2.5 py-1 rounded-[4px] transition-colors duration-150";
const INACTIVE = `${BASE} bg-surface border border-border/30 text-text-muted hover:text-text-secondary hover:border-border`;

export function WorkstreamFilter({ value, onChange, className }: WorkstreamFilterProps) {
  return (
    <div role="group" aria-label="Filter by workstream" className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)}
        className={value === null ? `${BASE} bg-accent/15 text-accent border border-accent/20` : INACTIVE}>
        All
      </button>
      {WORKSTREAM_KEYS.map((key) => {
        const cfg = WORKSTREAM_CONFIG[key];
        return (
          <button type="button" key={key} aria-pressed={value === key}
            onClick={() => onChange(value === key ? null : key)}
            className={value === key ? `${BASE} ${cfg.bgClass} ${cfg.textClass} border border-transparent` : INACTIVE}>
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}
```

### New file: `hooks/useWorkstreamFilter.ts`

```ts
import { useState } from "react";
import type { Workstream } from "@/lib/constants";

export function useWorkstreamFilter() {
  const [workstreamFilter, setWorkstreamFilter] = useState<Workstream | null>(null);
  return { workstreamFilter, setWorkstreamFilter } as const;
}
```

### Integration Pattern A — Kanban (search + workstream, single-pass)

```ts
const { workstreamFilter, setWorkstreamFilter } = useWorkstreamFilter();

const filteredTasks = useMemo(() => {
  if (!tasks) return tasks;
  const hasSearch = searchQuery.trim().length > 0;
  if (!hasSearch && !workstreamFilter) return tasks; // return original reference — no new array
  const q = hasSearch ? searchQuery.toLowerCase() : "";
  return tasks.filter((t) => {
    if (hasSearch && !t.title.toLowerCase().includes(q)) return false;
    if (workstreamFilter && t.workstream !== workstreamFilter) return false;
    return true;
  });
}, [tasks, searchQuery, workstreamFilter]);
```

### Integration Pattern B — Today / Calendar (fold filter into downstream memo)

```ts
// Today page — no intermediate filteredTasks variable
const { overdue, today, noDueDate } = useMemo(() => {
  const source = workstreamFilter
    ? (tasks ?? []).filter((t) => t.workstream === workstreamFilter)
    : (tasks ?? []);
  const overdue: Doc<"tasks">[] = [];
  const today: Doc<"tasks">[] = [];
  const noDueDate: Doc<"tasks">[] = [];
  for (const t of source) {
    if (!t.dueDate) noDueDate.push(t);
    else {
      const dateStr = toCSTDateString(t.dueDate);
      if (dateStr < todayStr) overdue.push(t);
      else if (dateStr === todayStr) today.push(t);
    }
  }
  return { overdue, today, noDueDate };
}, [tasks, workstreamFilter, todayStr]);

// Calendar page — same principle for tasksByDate
const tasksByDate = useMemo(() => {
  const source = workstreamFilter
    ? (tasks ?? []).filter((t) => t.workstream === workstreamFilter)
    : (tasks ?? []);
  const map = new Map<string, Doc<"tasks">[]>();
  for (const t of source) {
    if (!t.dueDate) continue;
    const dateStr = toCSTDateString(t.dueDate);
    const list = map.get(dateStr) ?? [];
    list.push(t);
    map.set(dateStr, list);
  }
  return map;
}, [tasks, workstreamFilter]);
```

### Integration Pattern C — Contextual empty state

```tsx
{selectedTasks.length === 0 ? (
  <p className="text-[12px] text-text-muted py-3 text-center">
    {workstreamFilter
      ? `No ${WORKSTREAM_CONFIG[workstreamFilter].label} tasks on this day`
      : "No tasks on this day"}
  </p>
) : (...)}
```

---

## Code Review Findings & Root Causes

A 6-agent code review (kieran-typescript-reviewer, security-sentinel, performance-oracle, architecture-strategist, code-simplicity-reviewer, agent-native-reviewer) identified 9 issues in the initial implementation.

| # | Severity | Finding | Root Cause | Fix |
|---|---|---|---|---|
| 1 | P1 | Buttons missing `type="button"` | HTML default is `type="submit"`; any ancestor `<form>` intercepts the click | Added `type="button"` to all filter buttons |
| 2 | P2 | `Object.entries` unsound cast | `Object.entries` widens key type to `string[]`; cast papers over it without solving it | Switched to `Object.keys(WORKSTREAM_CONFIG) as Workstream[]` — matches `FormToggles.tsx` precedent |
| 3 | P2 | Tailwind class conflict (`px-4 py-2` + `px-0`) | Tailwind applies styles by CSS rule order in generated stylesheet, not by class string order | Removed default padding from component; callers own spacing |
| 4 | P2 | Duplicated `useState<Workstream \| null>` across 3 pages | First implementation; hook extraction not considered | Extracted `useWorkstreamFilter()` hook |
| 5 | P2 | Chained `useMemo` (intermediate `filteredTasks`) | Filter added as a separate memo before the downstream bucketing/grouping memo | Folded filter into downstream memo; eliminated intermediate array |
| 6 | P2 | Calendar empty state misleading when filter active | Generic "No tasks on this day" doesn't distinguish truly empty from filtered-to-zero | Contextual message: "No [Workstream] tasks on this day" |
| 7 | P3 | Missing `aria-pressed` + `role="group"` | Accessibility not considered during initial build | Added `type="button"`, `aria-pressed`, `role="group"`, `aria-label` |
| 8 | P3 | Duplicate `@/lib/constants` imports in 3 pages | `Workstream` type added as a separate import statement | Merged into single import statement per file |
| 9 | P3 | Two-pass filter in Kanban (`.filter().filter()`) | Search and workstream filters added sequentially | Single predicate function with early-return branches |

### Security: Clean

All mutation hooks (`useTaskActions`) receive the **unfiltered** `tasks` array. The filter is applied only to display. This means:
- Mutations (complete, delete, reorder) are never scoped to the visible subset
- The Convex server-side auth is unaffected — filter state is never sent to the server
- A filtered-out task cannot be accidentally hidden from agent operations (AiCaptureBar also receives unfiltered `tasks`)

---

## Prevention Strategies

### 1. Always specify `type` on `<button>`

HTML default is `type="submit"`. A button inside any ancestor `<form>` will submit that form on click unless `type="button"` is explicit. This is silent in testing if no form is present.

**Enforcement:** Enable `react/button-has-type` in ESLint at `error` level.

### 2. Iterating over typed Records

`Object.entries(record)` and `Object.keys(record)` both widen keys to `string` by design. The correct pattern for a `Record<K, V>` where K is a union:

```ts
const keys = Object.keys(config) as Workstream[];       // ✓ matches existing FormToggles.tsx pattern
const entries = Object.entries(config) as [K, V][];     // ✗ unsound cast — don't do this
```

For repeated use, define once in a shared utility:
```ts
// utils/object.ts
export function typedKeys<K extends PropertyKey>(obj: Record<K, unknown>): K[] {
  return Object.keys(obj) as K[];
}
```

### 3. Tailwind `className` prop without `tailwind-merge`

When a component accepts `className` and also sets Tailwind utilities internally, the caller's override may silently lose. Pick one ownership model and document it:

- **Option A (preferred for this project):** Component sets no spacing. Callers own all `px-*`, `py-*`, `m-*`. Document in JSDoc.
- **Option B:** Expose a typed `size` prop with an internal lookup. Never let raw class strings conflict.
- **Option C (if project adopts tailwind-merge):** Use `twMerge(internalClasses, className)` — resolves conflicts correctly.

### 4. Extract shared hooks early

Extract to a shared hook when the same state shape appears in more than one file OR the state represents a named domain concept. The threshold is not "3 occurrences" — if it has a meaningful name and a clear interface, extract it immediately even if only one page uses it today.

### 5. Memo dependency chain

Before writing a `useMemo` that depends on another `useMemo`, ask: "Is the intermediate value consumed anywhere else?" If no, fold the logic into the downstream memo. A flat dependency graph is easier to reason about and avoids intermediate array allocations.

### 6. Empty states must reflect filter state

Any list that can be empty for two different reasons (no data vs. filtered to zero) needs two different messages:
- No data: "Nothing here yet" + creation affordance
- Filtered to zero: "No [filter label] items" + reset action

---

## Checklist for Future Filter Components

- [ ] All `<button>` elements have explicit `type="button"`
- [ ] No `Object.entries` cast on typed `Record<K, V>` — use `Object.keys(config) as K[]`
- [ ] Component does not set spacing in the same dimension it accepts as `className` override
- [ ] Shared `useState` hook extracted if same filter pattern used in >1 file
- [ ] No `useMemo` feeds directly into another `useMemo` unless intermediate is consumed elsewhere
- [ ] Three empty state cases handled: loading / no data / filtered to zero
- [ ] Toggle buttons have `aria-pressed`, `role="group"`, `aria-label`
- [ ] Color is not the sole active/inactive indicator (border, font weight also changes)
- [ ] Mutations always receive the unfiltered data — never the filtered display subset

---

## Related Documents

- `docs/solutions/logic-errors/convex-backend-review-batch-fixes.md` — multi-agent code review workflow patterns used in this session
- `docs/solutions/logic-errors/task-crud-consolidation-and-dnd-sort-rebalancing.md` — `useState` hook patterns for consolidated task state management
