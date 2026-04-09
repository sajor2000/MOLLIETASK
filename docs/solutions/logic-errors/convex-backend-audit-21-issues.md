---
title: "Convex Backend Audit: 21 Issues Fixed Across 9 Files"
slug: convex-backend-audit-21-issues
category: logic-errors
severity: critical
date_solved: 2026-04-09
component:
  - convex/tasks.ts
  - convex/telegramBot.ts
  - convex/subtasks.ts
  - convex/telegramFormat.ts
  - convex/http.ts
  - convex/reminders.ts
  - convex/users.ts
  - convex/taskAttachments.ts
  - convex/schema.ts
tags:
  - backend-audit
  - convex
  - code-duplication
  - data-integrity
  - cascade-delete
  - timezone
  - security
  - performance
symptoms:
  - Completing tasks via Telegram skipped subtask guard and lost recurring subtask cloning
  - Deleting tasks left orphaned storage blobs in Convex _storage
  - Deleting accounts left orphaned attachments and rate limit records
  - Digest timezone boundary calculated in UTC instead of user timezone
  - Telegram format functions ignored user timezone preference
  - N+1 sequential reads in attachment listing
  - Missing index for user-scoped attachment queries
  - Double-patch in updateTask mutation
  - completeTaskCore logic duplicated and divergent across 3 call sites
  - deleteTaskAttachments logic duplicated across 3 call sites
root_cause: >
  Organic growth across multiple feature additions (subtasks, attachments, Telegram bot,
  recurring tasks) led to duplicated domain logic with divergent implementations. Each
  call site implemented its own version of task completion and attachment cleanup, causing
  some paths to skip guards, miss cascade deletes, or ignore cloning for recurring tasks.
  Timezone handling was hardcoded rather than parameterized.
commit: c3c853d
---

## Problem

A comprehensive audit of the Convex backend (9 TypeScript files) revealed 21 issues across 5 severity categories:

**Critical (5 issues):**
1. `completeTaskFromTelegram` skipped the subtask completion guard — users could mark parent tasks done with incomplete subtasks
2. `completeTaskFromTelegram` did not clone subtasks when creating the next recurring task instance
3. `reorderTask` into "done" column bypassed all completion logic (subtask guard, recurring creation, reminder cleanup)
4. `deleteTaskFromTelegram` left orphaned storage blobs in `_storage` — attachments were never cleaned up
5. `deleteCompletedTasks` left orphaned storage blobs for all batch-deleted tasks

**Security (3 issues):**
6. `taskAttachments.finalizeUpload` had no content-type blocklist — HTML/SVG uploads could enable stored XSS
7. No filename length validation on uploaded attachments
8. No file size validation after upload (Convex accepts the blob before mutation runs)

**Performance (3 issues):**
9. `listForTask` query used sequential N+1 reads for storage metadata and URLs
10. Missing `by_userId` index on `taskAttachments` table for user-scoped queries
11. `updateTask` issued two separate `ctx.db.patch` calls instead of one

**Data Integrity (4 issues):**
12. `deleteAccount` did not cascade-delete task attachments (orphaned storage)
13. `deleteAccount` did not clean up `rateLimits` table entries
14. `deleteAccountCleanup` (continuation) had the same two omissions
15. `checkDigest` computed today's midnight boundary using `new Date("YYYY-MM-DDT00:00:00")` which parsed as UTC, not the user's timezone

**Code Quality (4 issues):**
16. Task completion logic duplicated across `completeTask`, `completeTaskFromTelegram`, and `reorderTask` with divergent behavior
17. Attachment cleanup logic duplicated across `deleteTask`, `deleteTaskFromTelegram`, and `deleteAccount`
18. `subtasks.ts` exported dead code: `deleteByParent` and `cloneForNewParent` internal mutations (unused after refactor)
19. `updateParentCounts` was private but needed by `telegramBot.ts`

**Missing Cleanup (2 issues):**
20. Telegram format functions hardcoded `"America/Chicago"` instead of using user's timezone preference
21. `http.ts` webhook handler did not pass user timezone to format functions

## Solution

### 1. Extracted `completeTaskCore` shared helper (`convex/tasks.ts`)

Single source of truth for task completion logic, used by `completeTask`, `reorderTask`, and `completeTaskFromTelegram`:

```typescript
export async function completeTaskCore(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  extraPatch?: Record<string, unknown>,
): Promise<{ nextTaskId: Id<"tasks"> | null; wasRecurring: boolean }> {
  // Subtask completion guard
  const subtasks = await ctx.db
    .query("subtasks")
    .withIndex("by_parentTaskId_and_sortOrder", (q) =>
      q.eq("parentTaskId", task._id),
    )
    .take(50);
  if (subtasks.length > 0 && subtasks.some((s) => !s.isComplete)) {
    throw new Error("All subtasks must be completed first");
  }

  // Cancel scheduled reminder
  if (task.scheduledReminderId) {
    await ctx.scheduler.cancel(task.scheduledReminderId);
  }

  // Mark done
  await ctx.db.patch(task._id, {
    status: "done" as const,
    completedAt: Date.now(),
    scheduledReminderId: undefined,
    ...extraPatch,
  });

  // Create next recurring instance with cloned subtasks
  let nextTaskId: Id<"tasks"> | null = null;
  if (task.recurring && task.dueDate) {
    const nextDueDate = computeNextDueDate(task.dueDate, task.recurring);
    nextTaskId = await ctx.db.insert("tasks", { /* recurring fields */ });
    if (subtasks.length > 0) {
      for (const subtask of subtasks) {
        await ctx.db.insert("subtasks", {
          parentTaskId: nextTaskId,
          userId: task.userId,
          title: subtask.title,
          isComplete: false,
          sortOrder: subtask.sortOrder,
          createdAt: Date.now(),
        });
      }
      await ctx.db.patch(nextTaskId, {
        subtaskTotal: subtasks.length,
        subtaskCompleted: 0,
      });
    }
  }

  return { nextTaskId, wasRecurring: !!(task.recurring && task.dueDate) };
}
```

### 2. Extracted `deleteTaskAttachments` shared helper (`convex/tasks.ts`)

Single source of truth for cascade-deleting attachments and their storage blobs:

```typescript
export async function deleteTaskAttachments(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
) {
  const attachments = await ctx.db
    .query("taskAttachments")
    .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
    .take(50);
  for (const att of attachments) {
    await ctx.storage.delete(att.storageId);
    await ctx.db.delete(att._id);
  }
}
```

### 3. Simplified all call sites

- **`completeTask`**: Now calls `completeTaskCore(ctx, task)` directly
- **`reorderTask`**: When moving to "done" column, calls `completeTaskCore(ctx, task, { sortOrder: newSortOrder })`
- **`completeTaskFromTelegram`**: Replaced 35-line inline implementation with `completeTaskCore(ctx, task)`
- **`deleteTask`**: Replaced inline attachment loop with `deleteTaskAttachments(ctx, taskId)`
- **`deleteTaskFromTelegram`**: Added `deleteTaskAttachments(ctx, taskId)` before task deletion
- **`deleteCompletedTasks`**: Added `deleteTaskAttachments(ctx, task._id)` in batch loop
- **`deleteAccount` / `deleteAccountCleanup`**: Added `deleteTaskAttachments(ctx, task._id)` + rateLimits cleanup

### 4. Fixed attachment security (`convex/taskAttachments.ts`)

Added content-type blocklist, filename length validation, and file size check:

```typescript
// Content-type allowlist — block HTML/SVG/XML to prevent stored XSS
const BLOCKED_CONTENT_TYPES = new Set([
  "text/html", "application/xhtml+xml", "image/svg+xml",
  "text/xml", "application/xml",
]);
if (meta.contentType && BLOCKED_CONTENT_TYPES.has(meta.contentType)) {
  await ctx.storage.delete(storageId);
  throw new Error("File type not allowed");
}

if (meta.size > MAX_FILE_BYTES) {
  await ctx.storage.delete(storageId);
  throw new Error(`File too large (max ${MAX_FILE_BYTES} bytes)`);
}
```

### 5. Fixed attachment query performance (`convex/taskAttachments.ts`)

Replaced sequential N+1 reads with parallel `Promise.all`:

```typescript
const enriched = await Promise.all(
  rows.map(async (row) => {
    const [meta, url] = await Promise.all([
      ctx.db.system.get(row.storageId),
      ctx.storage.getUrl(row.storageId),
    ]);
    return { /* ... */ url, contentType: meta?.contentType, size: meta?.size };
  }),
);
```

### 6. Added missing schema index (`convex/schema.ts`)

```typescript
taskAttachments: defineTable({ /* ... */ })
  .index("by_taskId", ["taskId"])
  .index("by_userId", ["userId"]),  // NEW — enables user-scoped queries
```

### 7. Fixed digest timezone boundary (`convex/reminders.ts`)

Replaced UTC-parsed date string with elapsed-time derivation from `formatToParts`:

```typescript
const nowSecond = now.getUTCSeconds();
const elapsedMs = (nowHour * 3600 + nowMinute * 60 + nowSecond) * 1000
  + now.getMilliseconds();
const todayStart = new Date(now.getTime() - elapsedMs);
const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
```

### 8. Parameterized timezone in Telegram formatting (`convex/telegramFormat.ts`)

Added optional `tz?: string` parameter to `formatTaskList`, `formatSnoozeConfirmation`, and internal `formatDue`. Updated `convex/http.ts` to pass `user.timezone` through.

### 9. Combined double-patch in `updateTask` (`convex/tasks.ts`)

Merged two separate `ctx.db.patch` calls into a single patch object. Only clears `reminderSent` when `reminderAt` is actually being changed.

### 10. Removed dead code (`convex/subtasks.ts`)

Deleted unused `deleteByParent` and `cloneForNewParent` internal mutations (~47 lines). Exported `updateParentCounts` for use by `telegramBot.ts`.

### 11. Account deletion completeness (`convex/users.ts`)

Both `deleteAccount` and `deleteAccountCleanup` now cascade-delete attachments per task and clean up `rateLimits` table entries.

## Prevention Strategies

### 1. Shared Helper Pattern for Domain Logic
When business logic (completion, deletion, cleanup) is needed in multiple mutations, extract it as a plain `async function` that accepts `MutationCtx`. This prevents behavioral drift across call sites.

**How to apply:** Before duplicating logic in a new mutation, check if a shared helper already exists in the relevant module. If not, extract one.

### 2. Cascade Delete Checklist
When adding a new related table (e.g., `taskAttachments`), update ALL deletion paths:
- Single task delete
- Batch task delete
- Telegram bot delete
- Account deletion (+ continuation)

**How to apply:** Maintain a mental model of "what owns what" — when a parent record is deleted, every child table must be cleaned up.

### 3. Timezone Parameterization
Never hardcode timezone strings. Always accept an optional `tz` parameter defaulting to a constant, and pass the user's preference from the database.

### 4. Content-Type Validation for Uploads
Any file upload endpoint must validate content type against a blocklist (at minimum: HTML, SVG, XML) to prevent stored XSS via user-uploaded files.

### 5. Post-Upload Validation
Convex stores the blob before the mutation runs. Always validate file size and content type in the `finalizeUpload` mutation and `ctx.storage.delete()` if validation fails.

### 6. Index Coverage Review
When adding a new table to the schema, consider all query patterns — not just the primary one. Add indexes for any field used in `.withIndex()` calls across the codebase.

### 7. Parallel Read Pattern
When enriching a list of records with related data (URLs, metadata), use `Promise.all` with nested `Promise.all` per item rather than sequential awaits.

## Testing Recommendations

1. **Subtask guard via Telegram**: Create a task with incomplete subtasks, attempt `/done` via Telegram — should reject
2. **Recurring subtask cloning**: Complete a recurring task with subtasks — next instance should have the same subtasks (uncompleted)
3. **Kanban drag to done**: Drag a task with incomplete subtasks to "done" column — should reject
4. **Attachment orphan test**: Delete a task with attachments, verify `_storage` blobs are removed
5. **Account deletion**: Delete an account with tasks that have attachments and rate limit entries — verify complete cleanup
6. **Digest timezone**: Set timezone to a non-UTC zone (e.g., `Pacific/Auckland` at UTC+12), verify digest counts match tasks due in that local day
7. **Upload security**: Attempt to upload an HTML file — should be rejected by `finalizeUpload`

## Related Resources

- Commit: `c3c853d` on `main`
- Development docs: `docs/DEVELOPMENT.md`
- Schema definition: `convex/schema.ts`
- Convex guidelines: `convex/_generated/ai/guidelines.md`
