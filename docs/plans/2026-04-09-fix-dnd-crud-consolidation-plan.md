---
title: "fix: Consolidate task CRUD and fix drag-and-drop gaps"
type: fix
date: 2026-04-09
---

# fix: Consolidate task CRUD and fix drag-and-drop gaps

## Overview

Audit-driven fix pass addressing 6 bugs/inconsistencies across task CRUD operations and drag-and-drop. The root cause is duplicated mutation logic between the `useTaskActions` hook and the Kanban page, which led to features (undo, uncomplete, error feedback) being available in only one view. Secondary fixes address DnD sort-order precision decay, missing optimistic updates, and unwired UI for existing backend mutations.

## Problem Statement

1. **Duplicated CRUD logic** -- `app/page.tsx` (Kanban) manually wires all 6 mutations instead of using `useTaskActions`. Same create-then-edit pattern duplicated.
2. **Undo/uncomplete only on Kanban** -- Today and Calendar views have no recovery path after completing a task.
3. **No error feedback** -- Subtask guard failures ("All subtasks must be completed first") are silently swallowed via `console.error`. DnD to Done silently snaps back.
4. **No optimistic updates for DnD** -- Comment says "Convex optimistic update will snap back" but none configured. Visible delay on every reorder.
5. **Sort order precision decay** -- Midpoint `(prev + over) / 2` loses precision after ~50 consecutive insertions in the same gap. No rebalance mechanism.
6. **Unwired backend features** -- `deleteCompletedTasks` mutation exists with no UI. Status field exists in `TaskFormData` but no selector in form.

## Proposed Solution

5 phases ordered by dependency. Each phase is independently shippable.

---

## Technical Approach

### Phase 1: Consolidate `useTaskActions` hook (foundation)

This is the root fix. All views share one hook for all task operations.

#### `hooks/useTaskActions.ts`

Expand the hook to include every task operation:

```typescript
// hooks/useTaskActions.ts
export function useTaskActions(tasks?: Doc<"tasks">[]) {
  const convex = useConvex();
  const addTask = useMutation(api.tasks.addTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const uncompleteTask = useMutation(api.tasks.uncompleteTask);
  const reorderTask = useMutation(api.tasks.reorderTask);
  const deleteCompletedTasks = useMutation(api.tasks.deleteCompletedTasks);

  // Stable ref for tasks to avoid re-renders
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Modal/form state
  const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Undo state
  const [undoAction, setUndoAction] = useState<{
    taskId: Id<"tasks">;
    previousStatus: TaskStatus;
    spawnedTaskId?: Id<"tasks">; // for recurring task undo
  } | null>(null);

  // Error feedback state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- CRUD handlers ---

  const handleSave = useCallback(async (data: TaskFormData) => {
    // existing create-or-update logic (unchanged)
  }, [editingTask, updateTask, addTask, convex]);

  const handleDelete = useCallback((taskId: Id<"tasks">) => {
    deleteTask({ taskId }).catch(() => setErrorMessage("Failed to delete task"));
    setEditingTask(null);
  }, [deleteTask]);

  const handleComplete = useCallback(async (taskId: Id<"tasks">) => {
    const task = tasksRef.current?.find(t => t._id === taskId);
    if (!task || task.status === "done") return;

    try {
      const nextTaskId = await completeTask({ taskId });
      setUndoAction({
        taskId,
        previousStatus: task.status,
        spawnedTaskId: nextTaskId ?? undefined, // capture for undo
      });
    } catch (err) {
      // Surface subtask guard error to user
      const msg = err instanceof Error ? err.message : "Failed to complete task";
      setErrorMessage(msg);
    }
  }, [completeTask]);

  const handleUncomplete = useCallback((
    taskId: Id<"tasks">,
    previousStatus: TaskStatus,
    spawnedTaskId?: Id<"tasks">,
  ) => {
    uncompleteTask({ taskId, previousStatus, spawnedTaskId })
      .catch(() => setErrorMessage("Failed to undo completion"));
  }, [uncompleteTask]);

  const handleUndo = useCallback(() => {
    if (!undoAction) return;
    handleUncomplete(
      undoAction.taskId,
      undoAction.previousStatus,
      undoAction.spawnedTaskId,
    );
    setUndoAction(null);
  }, [undoAction, handleUncomplete]);

  const handleReorder = useCallback((
    taskId: Id<"tasks">,
    newStatus: TaskStatus,
    newSortOrder: number,
  ) => {
    reorderTask({ taskId, newStatus, newSortOrder }).catch((err) => {
      const msg = err instanceof Error ? err.message : "Failed to move task";
      setErrorMessage(msg);
    });
  }, [reorderTask]);

  const handleClearCompleted = useCallback(async () => {
    let hasMore = true;
    while (hasMore) {
      const result = await deleteCompletedTasks();
      hasMore = result.hasMore;
    }
  }, [deleteCompletedTasks]);

  return {
    editingTask, setEditingTask,
    isCreating, setIsCreating,
    handleSave, handleDelete, handleComplete,
    handleUncomplete, handleUndo, handleReorder,
    handleClearCompleted,
    undoAction, clearUndo: () => setUndoAction(null),
    errorMessage, clearError: () => setErrorMessage(null),
  };
}
```

**Key design decisions:**
- `tasks` param is optional -- only Kanban passes it (for undo status tracking). Today/Calendar can omit it and use their own query results.
- `handleComplete` now captures `nextTaskId` from `completeTask` return value for recurring undo.
- Error state surfaced as `errorMessage` string, consumed by a toast component in each view.

#### `app/page.tsx` (Kanban page refactor)

Remove all inline `useMutation` calls. Replace with `useTaskActions(tasks)`.

Keep Kanban-specific state: `searchQuery`, `filteredTasks`, `prefillData`, AI capture bar handlers.

```typescript
// app/page.tsx — simplified
export default function KanbanPage() {
  const tasks = useQuery(api.tasks.getTasksByStatus);
  const {
    editingTask, setEditingTask, isCreating, setIsCreating,
    handleSave, handleDelete, handleComplete, handleReorder,
    handleUndo, undoAction, clearUndo,
    errorMessage, clearError,
  } = useTaskActions(tasks);

  // Kanban-specific
  const [searchQuery, setSearchQuery] = useState("");
  const [prefillData, setPrefillData] = useState<Partial<TaskFormData>>();

  const filteredTasks = useMemo(() => { /* search filter */ }, [tasks, searchQuery]);

  // ... render KanbanBoard, TaskDetailView, UndoToast, ErrorToast
}
```

#### Today and Calendar pages

These already use `useTaskActions()`. After Phase 1 they automatically gain:
- Undo toast (render `<UndoToast>` when `undoAction` is set)
- Error feedback (render error toast when `errorMessage` is set)
- No code changes needed beyond adding the toast components to the JSX

#### Acceptance Criteria -- Phase 1

- [x] `useTaskActions` exports: `handleComplete`, `handleUncomplete`, `handleUndo`, `handleReorder`, `handleClearCompleted`, `undoAction`, `errorMessage`
- [x] `app/page.tsx` has zero `useMutation` calls -- all from hook
- [x] Completing a task from Today or Calendar shows undo toast
- [x] Subtask guard error shows user-visible toast on all views
- [x] DnD to Done with incomplete subtasks shows error toast and card snaps back

---

### Phase 2: Sort order rebalance

#### `convex/tasks.ts` -- new internalMutation

```typescript
// convex/tasks.ts
export const rebalanceSortOrders = internalMutation({
  args: {
    userId: v.id("users"),
    status: statusValidator,
  },
  returns: v.null(),
  handler: async (ctx, { userId, status }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) =>
        q.eq("userId", userId).eq("status", status),
      )
      .take(500);

    for (let i = 0; i < tasks.length; i++) {
      const newOrder = (i + 1) * 1000;
      if (tasks[i].sortOrder !== newOrder) {
        await ctx.db.patch(tasks[i]._id, { sortOrder: newOrder });
      }
    }
    return null;
  },
});
```

#### `convex/tasks.ts` -- trigger in `reorderTask`

After patching, check gap. If too small, schedule rebalance:

```typescript
// Inside reorderTask handler, after the patch:
if (newStatus !== "done" || task.status === "done") {
  await ctx.db.patch(taskId, { status: newStatus, sortOrder: newSortOrder });

  // Check if rebalance needed
  const neighbors = await ctx.db
    .query("tasks")
    .withIndex("by_userId_status_sortOrder", (q) =>
      q.eq("userId", userId).eq("status", newStatus),
    )
    .take(500);

  const idx = neighbors.findIndex((t) => t._id === taskId);
  if (idx > 0) {
    const gap = Math.abs(neighbors[idx].sortOrder - neighbors[idx - 1].sortOrder);
    if (gap < 0.001) {
      await ctx.scheduler.runAfter(0, internal.tasks.rebalanceSortOrders, {
        userId,
        status: newStatus,
      });
    }
  }
}
```

#### Acceptance Criteria -- Phase 2

- [x] `rebalanceSortOrders` internalMutation exists with argument validators
- [x] `reorderTask` schedules rebalance when gap < 0.001
- [x] After rebalance, all tasks in column have clean 1000-gap sort orders
- [x] Rebalance only patches tasks whose sortOrder actually changed (skip no-ops)

---

### Phase 3: Optimistic updates for DnD

#### `hooks/useTaskActions.ts` -- optimistic update on reorderTask

Per Convex docs: never mutate existing arrays, always create new objects. Convex handles rollback automatically on failure.

**Important:** Skip optimistic update when `newStatus === "done"` and the task is not already done. The `completeTaskCore` side effects (completedAt, recurring spawn, subtask guard) are too complex to simulate client-side. For drag-to-done, let the server response drive the UI.

```typescript
// hooks/useTaskActions.ts
const reorderTask = useMutation(api.tasks.reorderTask).withOptimisticUpdate(
  (localStore, args) => {
    const currentTasks = localStore.getQuery(api.tasks.getTasksByStatus, {});
    if (currentTasks === undefined) return;

    // Skip optimistic update for drag-to-done (complex server side effects)
    const task = currentTasks.find((t) => t._id === args.taskId);
    if (!task) return;
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

#### Acceptance Criteria -- Phase 3

- [x] Reordering within a column feels instant (no visible delay)
- [x] Moving between todo/inprogress feels instant
- [x] Drag to Done does NOT use optimistic update (waits for server)
- [x] Failed mutations roll back automatically (Convex built-in)
- [x] Subtask guard failure on drag-to-done shows error toast (from Phase 1)

---

### Phase 4: "Clear completed" UI

#### `components/kanban/KanbanColumn.tsx`

Add clear button to Done column header:

```typescript
// KanbanColumn.tsx — add to props
interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Doc<"tasks">[];
  onEditTask: (task: Doc<"tasks">) => void;
  onCompleteTask: (taskId: Id<"tasks">) => void;
  onClearCompleted?: () => void; // NEW — only passed for "done" column
}

// In the column header, after the count span:
{status === "done" && tasks.length > 0 && onClearCompleted && (
  <button
    onClick={() => setShowClearConfirm(true)}
    className="ml-auto text-[11px] text-text-muted hover:text-destructive transition-colors"
  >
    Clear all
  </button>
)}

// Confirmation dialog (local state in KanbanColumn):
{showClearConfirm && (
  <div className="...">
    <p>Delete {tasks.length} completed tasks? This cannot be undone.</p>
    <button onClick={() => { onClearCompleted(); setShowClearConfirm(false); }}>
      Delete all
    </button>
    <button onClick={() => setShowClearConfirm(false)}>Cancel</button>
  </div>
)}
```

#### `components/kanban/KanbanBoard.tsx`

Pass `onClearCompleted` to the Done column:

```typescript
<KanbanColumn
  key={status}
  status={status}
  tasks={tasksByStatus[status]}
  onEditTask={onEditTask}
  onCompleteTask={onCompleteTask}
  onClearCompleted={status === "done" ? onClearCompleted : undefined}
/>
```

#### Acceptance Criteria -- Phase 4

- [x] "Clear all" button visible in Done column header when tasks exist
- [x] Confirmation dialog shows count of tasks to delete
- [x] Bulk delete loops until `hasMore === false`
- [x] Loading state during deletion
- [x] Column updates reactively as tasks are deleted

---

### Phase 5: Status selector in TaskForm + backend safety

#### `components/task/TaskForm.tsx`

Add status toggle showing "To Do" and "In Progress" only. Exclude "Done" to prevent bypassing `completeTaskCore`:

```typescript
// TaskForm.tsx — add after priority toggle
<div>
  <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
    Status
  </label>
  <div className="flex gap-1 bg-bg-base rounded-[4px] p-1">
    {(["todo", "inprogress"] as const).map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => setStatus(s)}
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
</div>
```

#### `convex/tasks.ts` -- `updateTask` status change handling

When `updateTask` receives a status change, handle side effects:

```typescript
// Inside updateTask handler, after validation:

// If status is changing, recompute sortOrder for the target column
if (updates.status && updates.status !== task.status) {
  // Prevent setting status to "done" via updateTask — must use completeTask
  if (updates.status === "done") {
    throw new Error("Use the complete action to mark tasks as done");
  }

  // If moving away from "done", clear completedAt
  if (task.status === "done") {
    patch.completedAt = undefined;
  }

  // Recompute sortOrder for the target column
  const lastInTarget = await ctx.db
    .query("tasks")
    .withIndex("by_userId_status_sortOrder", (q) =>
      q.eq("userId", userId).eq("status", updates.status),
    )
    .order("desc")
    .first();
  patch.sortOrder = lastInTarget ? lastInTarget.sortOrder + 1000 : 1000;
}
```

#### Acceptance Criteria -- Phase 5

- [x] Status selector visible in TaskForm with "To Do" and "In Progress" options
- [x] "Done" is NOT available in the status selector (completion only via checkbox/DnD)
- [x] `updateTask` throws if `status === "done"` is passed
- [x] `updateTask` clears `completedAt` when moving away from "done"
- [x] `updateTask` recomputes `sortOrder` when status changes (appends to end of target column)

---

### Phase 2.5: Recurring task undo fix (data integrity)

**Gap found by SpecFlow:** Undoing a recurring task completion leaves the spawned copy behind.

#### `convex/tasks.ts` -- extend `uncompleteTask`

```typescript
export const uncompleteTask = mutation({
  args: {
    taskId: v.id("tasks"),
    previousStatus: v.optional(statusValidator),
    spawnedTaskId: v.optional(v.id("tasks")), // NEW
  },
  returns: v.null(),
  handler: async (ctx, { taskId, previousStatus, spawnedTaskId }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) throw new Error("Task not found");

    await ctx.db.patch(taskId, {
      status: previousStatus ?? "todo",
      completedAt: undefined,
    });

    // Clean up spawned recurring copy if undo
    if (spawnedTaskId) {
      const spawned = await ctx.db.get(spawnedTaskId);
      if (spawned && spawned.userId === userId) {
        // Cascade-delete subtasks of the spawned copy
        const subtasks = await ctx.db
          .query("subtasks")
          .withIndex("by_parentTaskId_and_sortOrder", (q) =>
            q.eq("parentTaskId", spawnedTaskId),
          )
          .take(50);
        for (const s of subtasks) {
          await ctx.db.delete(s._id);
        }
        await ctx.db.delete(spawnedTaskId);
      }
    }

    return null;
  },
});
```

#### Acceptance Criteria -- Phase 2.5

- [x] `uncompleteTask` accepts optional `spawnedTaskId` argument
- [x] When `spawnedTaskId` is provided, the spawned task and its subtasks are deleted
- [x] Undo after completing a recurring task removes the spawned next-occurrence
- [x] Undo action state in the hook captures `nextTaskId` from `completeTask` return

---

## Files Changed

| File | Phase | Change |
|------|-------|--------|
| `hooks/useTaskActions.ts` | 1, 3 | Add uncomplete, reorder, clearCompleted, undo/error state, optimistic updates |
| `app/page.tsx` | 1 | Refactor to use `useTaskActions`, remove 6 inline `useMutation` calls |
| `app/today/page.tsx` | 1 | Add `<UndoToast>` and error toast using hook state |
| `app/calendar/page.tsx` | 1 | Add `<UndoToast>` and error toast using hook state |
| `convex/tasks.ts` | 2, 2.5, 5 | Add `rebalanceSortOrders`, extend `uncompleteTask` with `spawnedTaskId`, add status-change guards to `updateTask` |
| `components/kanban/KanbanColumn.tsx` | 4 | Add "Clear all" button with confirm dialog for Done column |
| `components/kanban/KanbanBoard.tsx` | 4 | Pass `onClearCompleted` to Done column |
| `components/task/TaskForm.tsx` | 5 | Add status selector toggle (todo/inprogress only) |

## Dependencies & Risks

**Dependency chain:** Phase 1 must land first (all other phases depend on the consolidated hook). Phases 2-5 are independent of each other.

**Risks:**
- **Phase 1 refactor scope** -- The Kanban page is the most complex component. Testing all interaction paths (DnD, AI bar, search, undo, create-then-edit) is critical.
- **Phase 3 optimistic update correctness** -- Creating new arrays (not mutating) is essential. Corrupted Convex client state is hard to debug.
- **Phase 2.5 undo window** -- The 5-second undo toast timeout means the spawned recurring task briefly exists. Users who navigate away during this window cannot undo. This is acceptable given the short window.

## References

- Brainstorm: `docs/brainstorms/2026-04-09-dnd-crud-audit-fix-brainstorm.md`
- Convex optimistic updates: `localStore.getQuery` / `localStore.setQuery` pattern -- never mutate, always create new objects
- @dnd-kit optimistic sorting: v10 has built-in `OptimisticSortingPlugin` for DOM-level reordering; our sort-order-in-DB approach is separate and correct
- Convex guidelines: `convex/_generated/ai/guidelines.md` -- use `internalMutation` for rebalance, include argument validators
