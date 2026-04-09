---
title: "Kanban Task App — DnD Sort Decay, Duplicated CRUD, Missing Undo/Error Feedback, and Security Gaps"
date_solved: 2026-04-09
category: logic-errors
severity: high
tags:
  - drag-and-drop
  - dnd-kit
  - convex
  - optimistic-updates
  - sort-order
  - floating-point
  - undo
  - error-handling
  - code-duplication
  - security
  - mutations
  - kanban
components:
  - hooks/useTaskActions.ts
  - app/page.tsx
  - app/today/page.tsx
  - app/calendar/page.tsx
  - convex/tasks.ts
  - components/kanban/KanbanBoard.tsx
  - components/kanban/KanbanColumn.tsx
  - components/task/TaskForm.tsx
  - components/ui/ErrorToast.tsx
symptoms:
  - Drag-and-drop reorder visually lags due to missing optimistic updates
  - Repeated reordering eventually corrupts task sort order silently
  - Completing a recurring task cannot be undone, risking data loss
  - Failed mutations produce no user-visible error feedback
  - CRUD mutation logic duplicated across Kanban, Today, and Calendar pages
  - No "clear completed" button available in the UI
  - Status selector missing from task creation/edit form
  - Malformed sort values (NaN, Infinity) could be injected from the client
root_cause: >
  Absence of a centralized task actions hook combined with no floating-point
  rebalancing strategy, no optimistic DnD updates, and no error/undo feedback
  layer left the app functionally fragile and architecturally inconsistent.
commit: fix/dnd-crud-consolidation (6 commits: a66bf73..7642fd4)
resolution_type: refactor + fix
---

# Task CRUD Consolidation and DnD Sort Rebalancing

## Problem

The task management application suffered from a pervasive lack of centralization in its mutation layer. Each view (Kanban, Today, Calendar) independently wired up its own set of `useMutation` calls for the same task operations — create, update, complete, delete — resulting in six or more duplicate mutation bindings on the Kanban page alone. This made it impossible to enforce consistent behavior (such as undo or error handling) across views without touching each file separately, and meant any future change to task logic required updates in multiple places with no guarantee of consistency.

The drag-and-drop sort order system had a subtle but critical design flaw: reordering used a simple floating-point midpoint formula `(prev + next) / 2` on every insertion. With enough repeated reorders between the same two adjacent items, the gap between their sort values would shrink below IEEE 754 floating-point precision, silently collapsing distinct positions into identical values and corrupting the displayed order. Compounding this, no optimistic update was applied during drag events, so every reorder required a full server round-trip before the UI reflected the change — producing visible latency on every drag.

On the security side, the backend accepted raw client-supplied sort values without validating against NaN or Infinity, meaning a malicious or buggy client could inject invalid sort keys. `updateTask` used `Record<string, unknown>` for the patch object, erasing all TypeScript type safety. And `uncompleteTask` (undo) deleted a spawned recurring task's subtasks but leaked its file attachments. The user experience layer was also critically incomplete: no undo for task completion (especially dangerous for recurring tasks that spawn copies), no error toasts, no "clear completed" button, and no status selector in the task form.

## Root Cause Analysis

**Scattered mutation logic**: Task CRUD was spread across `app/page.tsx` (6 inline `useMutation` calls), calendar page, and individual components. No single source of truth meant bugs had to be fixed in multiple places, and cross-cutting concerns like undo/error feedback were never added because there was no clean place to put them.

**No feedback layer**: The original architecture called mutations and discarded the result. There was no error state, no undo capability, and no optimistic UI — every drag waited for a server round-trip.

**Sort order decay**: The `reorderTask` mutation used midpoint bisection (e.g., inserting between 1000 and 2000 gives 1500, then 1250, 1125...) with no floor detection. After enough reorders, gaps collapsed below floating-point precision and cards stopped moving correctly.

**Security gaps**: `updateTask` accepted an untyped patch object and had no guard preventing the client from directly setting `status: "done"`, bypassing `completeTaskCore` logic (subtask guards, recurring spawn, reminder cancellation). Sort order accepted any `v.number()` including `Infinity`/`NaN`.

**Bulk delete design**: `deleteCompletedTasks` ran a client-side `while` loop calling the mutation repeatedly — blocking the UI for seconds with hundreds of completed tasks.

## Solution

### 1. Centralized CRUD Hook — `hooks/useTaskActions.ts`

All 7 mutations consolidated into one hook. Pages import a single destructured object instead of calling `useMutation` individually:

```ts
export function useTaskActions(tasks?: Doc<"tasks">[]) {
  const addTask = useMutation(api.tasks.addTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const uncompleteTask = useMutation(api.tasks.uncompleteTask);
  const reorderTask = useMutation(api.tasks.reorderTask).withOptimisticUpdate(...);
  const deleteCompletedTasks = useMutation(api.tasks.deleteCompletedTasks);

  const [undoAction, setUndoAction] = useState<{
    taskId: Id<"tasks">;
    previousStatus: TaskStatus;
    spawnedTaskId?: Id<"tasks">;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // ...handlers wrapping each mutation with error/undo logic
}
```

`app/page.tsx` reduced from 6 inline `useMutation` calls + `useRef` + `useConvex` to a single hook call.

### 2. Undo and Error Feedback

Undo state tracks enough info to reverse a completion, including the spawned recurring copy:

```ts
// handleComplete clears pending undo first to prevent orphaned spawned tasks
setUndoAction(null); // race condition fix
const nextTaskId = await completeTask({ taskId });
setUndoAction({ taskId, previousStatus: task.status, spawnedTaskId: nextTaskId ?? undefined });
```

`uncompleteTask` backend deletes the spawned task (with its subtasks AND attachments) on undo:

```ts
if (spawnedTaskId) {
  // cascade: subtasks, attachments, then the task itself
  await deleteTaskAttachments(ctx, spawnedTaskId);
  await ctx.db.delete(spawnedTaskId);
}
```

ErrorToast timer resets when message changes (dependency array fix):

```ts
useEffect(() => {
  const timer = setTimeout(() => onDismissRef.current(), duration);
  return () => clearTimeout(timer);
}, [duration, message]); // message in deps so timer resets on new errors
```

### 3. Sort Order Rebalance

Threshold check after each reorder triggers a background rebalance when gaps get dangerously small:

```ts
// convex/tasks.ts — reorderTask
const prevNeighbor = await ctx.db.query("tasks")
  .withIndex("by_userId_status_sortOrder", (q) =>
    q.eq("userId", userId).eq("status", newStatus).lt("sortOrder", newSortOrder))
  .order("desc").first();
const nextNeighbor = await ctx.db.query("tasks")
  .withIndex("by_userId_status_sortOrder", (q) =>
    q.eq("userId", userId).eq("status", newStatus).gt("sortOrder", newSortOrder))
  .first();

if (gap < 0.001) {
  await ctx.scheduler.runAfter(0, internal.tasks.rebalanceSortOrders, { userId, status: newStatus });
}
```

`rebalanceSortOrders` as `internalMutation` renumbers all tasks with 1000-gap spacing. `ctx.scheduler.runAfter(0, ...)` runs it outside the current transaction so the user's drag succeeds immediately.

### 4. Optimistic Updates for DnD

```ts
const reorderTask = useMutation(api.tasks.reorderTask).withOptimisticUpdate(
  (localStore, args) => {
    const currentTasks = localStore.getQuery(api.tasks.getTasksByStatus, {});
    if (currentTasks === undefined) return;
    const task = currentTasks.find((t) => t._id === args.taskId);
    if (!task) return;
    // Skip optimistic update for drag-to-done (server handles subtask guards + recurring spawn)
    if (args.newStatus === "done" && task.status !== "done") return;
    const updatedTasks = currentTasks.map((t) =>
      t._id === args.taskId
        ? { ...t, status: args.newStatus, sortOrder: args.newSortOrder }
        : t,
    );
    localStore.setQuery(api.tasks.getTasksByStatus, {}, updatedTasks);
  },
);
```

Key insight: drag-to-done is intentionally NOT optimistically updated because the server runs `completeTaskCore` which has complex side effects (subtask guards, recurring spawn, reminder cancellation). Convex rolls back the optimistic update automatically if the server mutation fails.

### 5. Security Guards

**Status bypass prevention** — `updateTask` rejects direct promotion to "done":

```ts
const newStatus = updates.status;
if (newStatus && newStatus !== task.status) {
  if (newStatus === "done") {
    throw new Error("Use the complete action to mark tasks as done");
  }
  if (task.status === "done") {
    patch.completedAt = undefined; // clear when moving out of done
  }
}
```

**Type safety** — replaced `Record<string, unknown>` with properly typed partial:

```ts
const patch: Partial<{
  title: string;
  workstream: Doc<"tasks">["workstream"];
  // ... all task fields with correct types
}> = { ...updates };
```

**Sort order validation**:

```ts
if (!Number.isFinite(newSortOrder)) {
  throw new Error("Invalid sort order");
}
```

### 6. Server-Side Bulk Delete

Replaced client-side `while` loop with server-scheduled continuation:

```ts
// Public mutation — deletes first batch, schedules continuation
export const deleteCompletedTasks = mutation({
  handler: async (ctx) => {
    const completed = await ctx.db.query("tasks")...take(101);
    const batch = completed.slice(0, 100);
    // ... delete batch with cascade
    if (completed.length > 100) {
      await ctx.scheduler.runAfter(0, internal.tasks.deleteCompletedTasksBatch, { userId });
    }
    return { deleted: batch.length };
  },
});

// Internal mutation — self-scheduling continuation
export const deleteCompletedTasksBatch = internalMutation({
  handler: async (ctx, { userId }) => {
    // ... same batch logic, reschedules itself if more remain
  },
});
```

Client handler simplified to a single `await deleteCompletedTasks()` — no loop.

### 7. Status Selector and Clear Completed

TaskForm status toggle excludes "done" to enforce the server-side gate:

```tsx
{(["todo", "inprogress"] as const).map((s) => (
  <button key={s} type="button" onClick={() => setStatus(s)} ...>
    {STATUS_CONFIG[s].label}
  </button>
))}
```

KanbanColumn "Done" column gets a "Clear all" button with inline confirmation dialog.

## Files Changed

| File | Change |
|------|--------|
| `hooks/useTaskActions.ts` | New centralized hook with all mutations, undo, error state |
| `app/page.tsx` | Removed 6 inline mutations, uses `useTaskActions` |
| `app/today/page.tsx` | Added UndoToast + ErrorToast via `useTaskActions` |
| `app/calendar/page.tsx` | Added UndoToast + ErrorToast via `useTaskActions` |
| `convex/tasks.ts` | Status guards, type safety, sort rebalance, server-side bulk delete, security fixes |
| `components/kanban/KanbanBoard.tsx` | Added `onClearCompleted` prop |
| `components/kanban/KanbanColumn.tsx` | Added clear completed button with confirmation |
| `components/task/TaskForm.tsx` | Added status selector (todo/inprogress only) |
| `components/ui/ErrorToast.tsx` | New component, timer deps fix |

## Prevention

### Architectural Patterns

1. **Single mutation hook per entity** — All Convex mutations touching tasks must go through `useTaskActions`. Any PR adding `useMutation(api.tasks.*)` outside that hook should be flagged.

2. **Server-side pagination for bulk operations** — Never drive mutation pagination from a client-side `while` loop. Use `ctx.scheduler.runAfter(0, ...)` for self-scheduling continuation batches.

3. **Optimistic updates for all reorder operations** — If a mutation changes visible list order, it requires `.withOptimisticUpdate()`. Skip only when server side effects are too complex to simulate (e.g., drag-to-done with recurring spawn).

4. **Typed patch objects** — Never use `Record<string, unknown>` for `ctx.db.patch()`. Use `Partial<Doc<"tableName">>` or an explicit field union type.

### Code Review Checklist

- [ ] No `useMutation(api.tasks.*)` outside `useTaskActions`
- [ ] No arithmetic midpoint insertion without rebalance threshold check
- [ ] Every DnD mutation has `.withOptimisticUpdate()`
- [ ] No client-side `while` loops over mutation calls
- [ ] Every destructive action (complete, delete) has an undo path
- [ ] Convex validators reject invalid values (`Number.isFinite` for sort order)
- [ ] Attachment cleanup is transactional with parent operation (no orphan risk)
- [ ] `useEffect` deps include all values that should trigger re-runs

### Testing Strategies

- **Integration**: Rapid concurrent reorder mutations don't produce duplicate sort values
- **Integration**: Complete + undo leaves DB state identical to pre-completion snapshot
- **Integration**: Bulk delete of 500+ tasks completes without timeout (server-side chunking)
- **E2E**: Drag-and-drop item appears in new position before network response (optimistic update)
- **E2E**: Undo toast appears within 500ms of completion and successfully rolls back

## References

- [Brainstorm: DnD/CRUD Audit](../brainstorms/2026-04-09-dnd-crud-audit-fix-brainstorm.md)
- [Implementation Plan](../plans/2026-04-09-fix-dnd-crud-consolidation-plan.md)
- [Prior: Convex Backend Audit — 21 Issues](convex-backend-audit-21-issues.md)
- [Prior: Convex Backend Review — Batch Fixes](convex-backend-review-batch-fixes.md)
- [Convex Guidelines](../../convex/_generated/ai/guidelines.md) — `internalMutation`, argument validators, `ctx.scheduler`
