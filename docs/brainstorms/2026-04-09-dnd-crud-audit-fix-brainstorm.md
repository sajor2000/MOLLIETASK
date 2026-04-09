# DnD & CRUD Audit Fix Plan

**Date:** 2026-04-09
**Status:** Ready for implementation

## What We're Building

A consolidation and fix pass across all task CRUD operations and drag-and-drop, addressing 6 concrete issues found during audit.

## Why This Approach

The codebase has working CRUD and DnD, but logic is duplicated between `useTaskActions` hook and the Kanban page, features like undo/uncomplete are only available in one view, and DnD has two latent bugs (no optimistic updates, sort-order precision decay). Fixing the foundation (the hook) unlocks consistency across all views.

## Audit Findings

### Drag-and-Drop Issues
1. **No optimistic updates** — Comment says "Convex optimistic update will snap back" but none are configured. Visible delay on every reorder as UI waits for server round-trip.
2. **Sort order precision decay** — Midpoint calculation `(prev + over) / 2` will lose precision after ~50 consecutive insertions in the same gap. No rebalance mechanism exists.

### CRUD Inconsistencies
3. **Duplicated logic** — `app/page.tsx` (Kanban) manually wires all mutations instead of using `useTaskActions`. Same create-then-edit pattern duplicated.
4. **Missing undo/uncomplete** — Only available on Kanban page. Calendar and Today views have no undo for completion.
5. **Unwired bulk delete** — `deleteCompletedTasks` mutation exists in `convex/tasks.ts` but no UI button anywhere.
6. **No status selector in TaskForm** — Can't set status during creation. Status changes only via DnD or AI.

## Fix Plan

### Phase 1: Consolidate `useTaskActions` hook
**Files:** `hooks/useTaskActions.ts`, `app/page.tsx`

Expand the hook to be the single source of truth for all task operations:

```
useTaskActions() returns:
  // Modal state
  editingTask, setEditingTask, isCreating, setIsCreating
  
  // CRUD
  handleSave          — create or update (existing behavior)
  handleDelete        — single task with cascade (existing)
  handleComplete      — complete with undo tracking (NEW: tracks previousStatus)
  handleUncomplete    — restore from done (NEW)
  handleReorder       — DnD status + sortOrder change (NEW)
  handleClearCompleted — bulk delete done tasks (NEW)
  
  // Undo
  undoAction, handleUndo, clearUndo
```

Refactor Kanban page to use the hook. Keep Kanban-specific concerns (search, AI bar, prefillData) in the page component.

### Phase 2: Sort order rebalance
**Files:** `convex/tasks.ts`

Add `rebalanceSortOrders` internal mutation:
- Fetches all tasks in a status column for the user
- Reassigns `sortOrder = (index + 1) * 1000`
- Triggered from `reorderTask` when gap between adjacent tasks < 0.001

### Phase 3: Optimistic updates
**Files:** `hooks/useTaskActions.ts`

Add `withOptimisticUpdate` to `reorderTask` and `completeTask`:
- Immediately update local query cache for `getTasksByStatus`
- Create new array (never mutate) per Convex docs
- Convex handles automatic rollback on mutation failure

### Phase 4: "Clear completed" UI
**Files:** `components/kanban/KanbanColumn.tsx`, `components/kanban/KanbanBoard.tsx`

Add button in Done column header. Confirm before clearing. Loops `deleteCompletedTasks` if `hasMore` is true.

### Phase 5: Status selector in TaskForm
**Files:** `components/task/TaskForm.tsx`

Add status toggle (To Do / In Progress / Done) visible in both create and edit modes.

## Key Decisions

- **Hook consolidation over page-level logic** — One hook, all views consistent
- **Threshold-based rebalance** — Only renumber when precision gets dangerously low (< 0.001 gap), avoids unnecessary writes
- **Optimistic updates for DnD only** — Biggest UX impact; complete/uncomplete can follow later
- **YAGNI: No calendar DnD** — Dragging tasks between calendar dates is a different feature, not a fix
- **YAGNI: No Today view reordering** — Filtered list, low value for DnD
- **YAGNI: No reminder UI** — Separate feature scope, not a CRUD gap

## Files Changed

| File | Change |
|------|--------|
| `hooks/useTaskActions.ts` | Add uncomplete, reorder, clearCompleted, undo state, optimistic updates |
| `app/page.tsx` | Refactor to use useTaskActions, remove duplicated mutations |
| `convex/tasks.ts` | Add rebalanceSortOrders internal mutation, threshold check in reorderTask |
| `components/kanban/KanbanColumn.tsx` | Add "Clear completed" button for Done column |
| `components/kanban/KanbanBoard.tsx` | Pass onClearCompleted to Done column |
| `components/task/TaskForm.tsx` | Add status selector toggle |

## Open Questions

None — scope is well-defined as a fix/consolidation pass.
