---
title: "Production Readiness Remediation"
type: fix
date: 2026-04-09
---

# Production Readiness Remediation

## Overview

Address all blocker, HIGH, and key MEDIUM findings from the comprehensive 5-agent pre-production audit (security, performance, data integrity, architecture, build readiness). The codebase has strong fundamentals — auth is exemplary, validation is thorough, builds clean — but needs hardening in error recovery, rate limiting, query efficiency, and a handful of security tightening.

## Problem Statement

The audit identified 3 blockers (no error boundaries, timing-vulnerable webhook comparison, insufficient rate limiting), 6 HIGH items (unbounded user fan-out, broad reactive queries, no lazy loading, monolithic webhook handler, missing index, sequential queries), and 4 MEDIUM items (no task cap, silent settings errors, duplicated UI, scattered timezone default). These collectively represent the gap between "works in development" and "safe under production load."

## Prior Work

- `docs/plans/2026-04-08-fix-all-review-findings-plan.md` — prior review pass (most items resolved)
- `docs/brainstorms/2026-04-09-dnd-crud-audit-fix-brainstorm.md` — DnD/CRUD consolidation (separate scope, in progress on current branch)
- `docs/solutions/` — integration and logic error solutions from prior fixes

---

## Phase 1: Blockers (before deploy)

### 1.1 Add React Error Boundaries

**Files to create:**
- `app/error.tsx` — catches per-route render errors; preserves AppShell navigation so users can navigate away
- `app/global-error.tsx` — catches root layout errors; full-page reload prompt (no layout survives)

**Design decisions:**
- `app/error.tsx` sits below `app/layout.tsx`, so the ConvexClientProvider and nav shell survive. Render a centered message with a "Try again" button (calls `reset()`) and a "Go home" link.
- `app/global-error.tsx` replaces the entire tree. Render a standalone page with "Something went wrong" and a "Reload" button (`window.location.reload()`).
- Per-route `error.tsx` files (e.g., `app/settings/error.tsx`) are NOT needed — the root catches all. Can add later if different recovery UX is wanted per route.
- No external error reporting service for MVP. Add Sentry/LogRocket as a fast-follow.

**Acceptance criteria:**
- [x] A thrown error in any page component shows recovery UI without losing the navigation shell
- [x] `global-error.tsx` catches errors in the root layout and shows a full-page reload prompt
- [x] Error boundaries do not break the Convex reactive subscription recovery (after `reset()`, queries reconnect)

### 1.2 Constant-Time Webhook Secret Comparison

**File:** `convex/http.ts:161`

**Problem:** `!==` short-circuits on first mismatch, leaking timing info.

**Runtime constraint:** `http.ts` runs as `httpAction` in Convex's default V8 runtime — NOT Node.js. `crypto.timingSafeEqual` is unavailable. Cannot add `"use node"` because `httpRouter` must stay in the default runtime.

**Solution:** Manual constant-time comparison using `TextEncoder` + bitwise XOR:

```typescript
// convex/http.ts — new helper
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}
```

Then replace line 161:
```typescript
// Before:
if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
// After:
const token = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
if (!timingSafeEqual(token, secret)) {
```

**Note:** The `bufA.length !== bufB.length` early return does leak length info, but Telegram webhook secrets are fixed-length strings set by the bot owner, so the attacker cannot vary the expected length.

**Acceptance criteria:**
- [x] Webhook secret comparison uses bitwise XOR, no `===` or `!==` on the raw secret
- [x] Existing Telegram webhook integration tests (manual) still pass
- [x] `timingSafeEqual` helper is defined in `http.ts` (private, not exported)

### 1.3 Extend Rate Limiting

**File:** `convex/rateLimit.ts` (add cooldowns), plus each target mutation/action

**Current state:** Only `parseTaskIntent` (2s) and `suggestSubtasks` (10s) are rate-limited.

**New rate limits:**

| Action | Cooldown | Rationale |
|--------|----------|-----------|
| `addTask` | 500ms | Allows 120/min for rapid use; template import calls `insertTaskCore` directly (internal), so it bypasses this check |
| `generateUploadUrl` | 300ms | Allows multi-file upload at human speed; prevents storage exhaustion |
| `generateTelegramLinkToken` | 30000ms | Rarely called, high-value token |
| `deleteAccount` | 60000ms | Irreversible, one-shot operation |

**Implementation approach — inline check in each mutation/action:**

For mutations (`addTask`, `generateUploadUrl`): The rate limiter is an `internalMutation`. Mutations cannot call `ctx.runMutation`. Instead, inline the rate limit check directly:

```typescript
// In addTask handler, after getAuthUserId:
const existing = await ctx.db
  .query("rateLimits")
  .withIndex("by_userId_action", (q) =>
    q.eq("userId", userId).eq("action", "addTask"),
  )
  .first();
const now = Date.now();
if (existing && now - existing.timestamp < 500) {
  throw new Error("Rate limited: please wait before adding another task");
}
if (existing) {
  await ctx.db.patch(existing._id, { timestamp: now });
} else {
  await ctx.db.insert("rateLimits", { userId, action: "addTask", timestamp: now });
}
```

For actions (`generateTelegramLinkToken`): Can use `ctx.runMutation(internal.rateLimit.checkAndRecord, ...)` since actions CAN call mutations.

For `deleteAccount` (mutation): Inline check, same as `addTask`.

**Extract a reusable helper to avoid duplication:**

```typescript
// convex/rateLimit.ts — new exported helper
export async function enforceRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">,
  action: string,
  cooldownMs: number,
) {
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_userId_action", (q) =>
      q.eq("userId", userId).eq("action", action),
    )
    .first();
  const now = Date.now();
  if (existing && now - existing.timestamp < cooldownMs) {
    throw new Error("Too many requests. Please wait a moment.");
  }
  if (existing) {
    await ctx.db.patch(existing._id, { timestamp: now });
  } else {
    await ctx.db.insert("rateLimits", { userId, action, timestamp: now });
  }
}
```

**Rate limit error UX:** The thrown error propagates to the client's `useTaskActions` catch block, which already sets `errorMessage` and shows `ErrorToast`. No client changes needed.

**Telegram bot path:** `addTaskFromTelegram` calls `insertTaskCore` directly (internal mutation), so it is NOT rate-limited by the public `addTask` check. The Telegram path already has AI-level rate limiting. Adding task-creation rate limiting to the Telegram path is a separate decision — defer for now since the Telegram bot is used only by the authenticated practice owner.

**Acceptance criteria:**
- [x] `addTask` rejects rapid-fire calls faster than 500ms with a user-visible error
- [x] `generateUploadUrl` rejects calls faster than 300ms
- [x] `generateTelegramLinkToken` rejects calls faster than 30s
- [x] `deleteAccount` rejects calls faster than 60s
- [x] Rate limit errors surface in the UI via ErrorToast (existing pattern)
- [x] Template import (internal path via `insertTaskCore`) is NOT rate-limited

---

## Phase 2: HIGH Priority (first week post-deploy)

### 2.1 Paginate `getAllUsers` in Cron Fan-outs

**File:** `convex/reminders.ts:72-93`

**Problem:** `.take(500)` silently drops users after #500. Both `checkOverdue` and `checkDigest` actions call this query then schedule per-user work.

**Solution:** Cursor-based self-scheduling continuation (matching existing `deleteCompletedTasksBatch` pattern):

```typescript
// convex/reminders.ts
export const getAllUsersBatch = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    users: v.array(/* existing shape */),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("users")
      .paginate({ numItems: 200, cursor: cursor ?? null });
    return {
      users: result.page.map((u) => ({ /* existing projection */ })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});
```

The `checkOverdue` and `checkDigest` actions loop: fetch a batch, schedule per-user work, then self-schedule with the cursor if not done.

**Acceptance criteria:**
- [x] Cron fan-outs process ALL users regardless of count
- [x] Each batch processes at most 200 users per action invocation
- [x] If fewer than 200 users exist, no continuation is scheduled (single pass)

### 2.2 Split `getTasksByStatus` Into Per-Status Queries

**Files:** `convex/tasks.ts`, `app/page.tsx`, `app/today/page.tsx`, `app/calendar/page.tsx`, `hooks/useTaskActions.ts`

**Problem:** Single query returns up to 500 tasks; any mutation invalidates the entire reactive subscription for all consumers.

**Approach — parameterized query (lower risk than full split):**

The SpecFlow analysis identified that a full split (separate named queries per status) would break the optimistic update in `useTaskActions.ts` and require complex multi-query cache manipulation for cross-status drag moves. Instead, add a `status` filter parameter to the existing query:

```typescript
// convex/tasks.ts
export const getTasksByStatus = query({
  args: { status: v.optional(statusValidator) },
  returns: v.array(taskDocValidator),
  handler: async (ctx, { status }) => {
    const userId = await getAuthUserId(ctx);
    if (status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_userId_status_sortOrder", (q) =>
          q.eq("userId", userId).eq("status", status),
        )
        .take(500);
    }
    // Backward-compatible: no filter = all statuses
    return await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) =>
        q.eq("userId", userId),
      )
      .take(500);
  },
});
```

**Consumer migration (incremental, non-breaking):**

1. Kanban page (`app/page.tsx`): Keep using `getTasksByStatus({})` (no filter) since it needs all three columns. The optimistic update continues to work unchanged.
2. Today page (`app/today/page.tsx`): Switch to two queries:
   ```typescript
   const todoTasks = useQuery(api.tasks.getTasksByStatus, { status: "todo" });
   const inProgressTasks = useQuery(api.tasks.getTasksByStatus, { status: "inprogress" });
   const tasks = [...(todoTasks ?? []), ...(inProgressTasks ?? [])];
   ```
3. Calendar page (`app/calendar/page.tsx`): Same pattern as Today — subscribe only to todo + inprogress.

**Benefits:** Completing a task no longer invalidates the Today/Calendar subscriptions. The Kanban view still uses the broad query (acceptable since it needs all statuses). Future optimization: split the Kanban into three per-column queries when the optimistic update is refactored.

**Acceptance criteria:**
- [x] `getTasksByStatus` accepts optional `status` parameter
- [x] Today and Calendar pages subscribe only to non-done statuses
- [x] Kanban drag-and-drop still works (optimistic updates unchanged)
- [x] No visual regressions in any view

### 2.3 Lazy Load Heavy Components

**Files:** `app/page.tsx`, imports of `KanbanBoard`, `TaskDetailView`, `TemplateLibrary`

**Solution:** Use `next/dynamic` with `{ ssr: false }` since all three are client-only interactive components:

```typescript
// app/page.tsx
import dynamic from "next/dynamic";

const KanbanBoard = dynamic(
  () => import("@/components/kanban/KanbanBoard").then((m) => m),
  { ssr: false }
);
const TaskDetailView = dynamic(
  () => import("@/components/task/TaskDetailView").then((m) => m),
  { ssr: false }
);
const TemplateLibrary = dynamic(
  () => import("@/components/task/TemplateLibrary").then((m) => m),
  { ssr: false }
);
```

**Loading fallback:** Use `null` (no visible spinner). These components are behind auth and Convex loading, so the user already sees the AppShell + "Loading..." before these mount. A skeleton could be added later.

**Acceptance criteria:**
- [x] `@dnd-kit` is code-split into a separate chunk (verify in build output)
- [x] No flash-of-empty-content visible to the user
- [x] All three components render correctly after dynamic import

### 2.4 Add `by_ownerUserId_sortOrder` Index to staffMembers

**File:** `convex/schema.ts:85`, `convex/staff.ts:38-43`

**Schema change:**
```typescript
// convex/schema.ts
staffMembers: defineTable({ /* ... */ })
  .index("by_ownerUserId", ["ownerUserId"])  // keep for backward compat
  .index("by_ownerUserId_and_sortOrder", ["ownerUserId", "sortOrder"]),
```

**Query update:**
```typescript
// convex/staff.ts — listStaff handler
const rows = await ctx.db
  .query("staffMembers")
  .withIndex("by_ownerUserId_and_sortOrder", (q) =>
    q.eq("ownerUserId", ownerUserId),
  )
  .take(100);
return rows; // already sorted by index, remove .sort()
```

**Note:** The existing `by_ownerUserId` index is technically redundant (the compound index covers equality queries on `ownerUserId` alone), but keep it to avoid touching other consumers. Remove in a future cleanup pass.

**Acceptance criteria:**
- [x] `listStaff` returns pre-sorted results without in-memory `.sort()`
- [x] Staff reordering still works correctly
- [x] Schema push succeeds without data loss

### 2.5 Consolidate Telegram Webhook Queries

**Files:** `convex/telegramBot.ts` (new combined query), `convex/http.ts` (callers)

**Problem:** The free-text AI routing path and the `/edit` command path both make 2 sequential `runQuery` calls (`getTasksForTelegram` + `getStaffForTelegram`) that could be 1.

**Solution:** Add a combined `internalQuery`:

```typescript
// convex/telegramBot.ts
export const getTelegramContext = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    tasks: v.array(/* existing taskForTelegram shape */),
    staff: v.array(/* existing staffForTelegram shape */),
  }),
  handler: async (ctx, { userId }) => {
    const [tasks, staff] = await Promise.all([
      ctx.db.query("tasks")
        .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
        .take(500),
      ctx.db.query("staffMembers")
        .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
        .take(100),
    ]);
    return {
      tasks: tasks.map(/* existing projection */),
      staff: staff.map(/* existing projection */),
    };
  },
});
```

Replace all paired query calls in `http.ts` (free-text handler ~line 717, `/add` handler ~line 295, `/edit` handler ~line 397) with a single `ctx.runQuery(internal.telegramBot.getTelegramContext, { userId })`.

**Acceptance criteria:**
- [x] All Telegram command handlers that need tasks+staff use the combined query
- [x] Free-text, `/add`, and `/edit` commands still function correctly
- [x] One fewer `runQuery` round-trip per Telegram message

---

## Phase 3: MEDIUM Priority (weeks 2-3)

### 3.1 Add Per-User Task Count Cap

**File:** `convex/tasks.ts` — `insertTaskCore`

**Design:** Cap at 1000 total tasks per user. Use a count query (not a denormalized counter) since task creation is infrequent enough that the read cost is acceptable. A denormalized counter adds complexity and another write on every create/delete.

```typescript
// In insertTaskCore, after validation:
const taskCount = (await ctx.db
  .query("tasks")
  .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
  .take(1001)).length;
if (taskCount >= 1000) {
  throw new Error("Task limit reached (1000). Delete some tasks to continue.");
}
```

**Note:** This also applies to the recurring task clone path in `completeTaskCore`. Add the same check there.

**Acceptance criteria:**
- [x] Users cannot create more than 1000 tasks
- [x] Error message is user-facing and actionable
- [x] Recurring task cloning respects the cap

### 3.2 Surface Errors in Settings Page

**File:** `app/settings/page.tsx:39-88`

**Solution:** Add an `error` state variable and render inline error feedback, matching the pattern in `app/team/page.tsx`:

```typescript
const [error, setError] = useState<string | null>(null);

async function handleTimezone(tz: string) {
  setSaving("timezone");
  setError(null);
  try {
    await updateSettings({ timezone: tz });
  } catch (e) {
    setError("Failed to save timezone. Please try again.");
    console.error("Failed to save timezone:", e);
  }
  setSaving(null);
}
// Apply same pattern to handleDigestTime, handleGenerateToken,
// handleUnlinkTelegram, handleDeleteAccount
```

Render error at top of settings panel:
```tsx
{error && (
  <p className="text-[13px] text-destructive">{error}</p>
)}
```

**Acceptance criteria:**
- [x] Every settings action shows an error message on failure
- [x] Error clears when the user retries
- [x] `deleteAccount` failure is especially visible (irreversible intent)

### 3.3 Extract Shared TaskListItem Component

**Files to create:** `components/task/TaskListItem.tsx`
**Files to modify:** `app/today/page.tsx`, `app/calendar/page.tsx`

**Props interface:**
```typescript
interface TaskListItemProps {
  task: Doc<"tasks">;
  staffName?: string;
  onComplete: (taskId: Id<"tasks">) => void;
  onClick: (task: Doc<"tasks">) => void;
  animated?: boolean; // default true — controls completion animation
}
```

Extract the shared rendering: completion circle, title, workstream badge, recurring indicator, priority dot, due time. The Today view passes `animated={true}` (300ms CSS animation), the Calendar view passes `animated={false}` (instant).

**Acceptance criteria:**
- [x] Today and Calendar views render identically to current behavior
- [x] Completion animation works on Today, not on Calendar
- [x] No duplicated task row markup across views

### 3.4 Consolidate Hardcoded Timezone Default

**Files to create:** `convex/constants.ts`
**Files to modify:** `convex/telegramFormat.ts`, `convex/http.ts` (3 occurrences), `convex/reminders.ts`

**Solution:**
```typescript
// convex/constants.ts
export const DEFAULT_TIMEZONE = "America/Chicago";
```

Replace all `"America/Chicago"` literals in `convex/` files with this import. The frontend already has `DEFAULT_TIMEZONE` in `lib/constants.ts` — keep it there (different runtime, can't share). Update `convex/telegramFormat.ts` to import from `./constants` instead of defining its own `DEFAULT_TZ`.

**Acceptance criteria:**
- [x] Zero hardcoded `"America/Chicago"` strings in `convex/` (except `convex/constants.ts`)
- [x] Frontend `lib/constants.ts` unchanged
- [x] All Telegram and reminder timezone fallbacks use the constant

---

## Implementation Order

Within phases, the recommended sequence accounts for dependencies:

**Phase 1 (parallel where possible):**
1. Item 1.1 (error boundaries) — fully independent
2. Item 1.2 (webhook timing) — fully independent
3. Item 1.3 (rate limiting) — fully independent

All three can be done in parallel.

**Phase 2 (ordered):**
1. Item 2.4 (staff index) — independent, low risk, quick win
2. Item 2.5 (consolidate Telegram queries) — independent, low risk
3. Item 2.1 (paginate getAllUsers) — independent of query changes
4. Item 2.2 (parameterized getTasksByStatus) — highest risk, touches all views
5. Item 2.3 (lazy loading) — do after 2.2 since component imports may shift

**Phase 3 (ordered):**
1. Item 3.4 (timezone consolidation) — do first since it touches `http.ts`
2. Item 3.2 (settings errors) — independent, quick
3. Item 3.3 (shared TaskListItem) — depends on no active changes to Today/Calendar
4. Item 3.1 (task count cap) — requires product decision on cap value

---

## Files Changed Summary

| File | Phase | Change |
|------|-------|--------|
| `app/error.tsx` | 1.1 | **NEW** — root error boundary |
| `app/global-error.tsx` | 1.1 | **NEW** — global error boundary |
| `convex/http.ts` | 1.2, 2.5 | Add `timingSafeEqual` helper; update Telegram query calls |
| `convex/rateLimit.ts` | 1.3 | Add `enforceRateLimit` helper; add cooldowns to COOLDOWNS map |
| `convex/tasks.ts` | 1.3, 2.2, 3.1 | Add rate limit to `addTask`; parameterize `getTasksByStatus`; add task cap |
| `convex/taskAttachments.ts` | 1.3 | Add rate limit to `generateUploadUrl` |
| `convex/secureToken.ts` | 1.3 | Add rate limit check to `generateTelegramLinkToken` |
| `convex/users.ts` | 1.3 | Add rate limit to `deleteAccount` |
| `convex/reminders.ts` | 2.1 | Paginate `getAllUsers`, update cron fan-outs |
| `convex/schema.ts` | 2.4 | Add `by_ownerUserId_and_sortOrder` index |
| `convex/staff.ts` | 2.4 | Use compound index, remove `.sort()` |
| `convex/telegramBot.ts` | 2.5 | Add `getTelegramContext` combined query |
| `app/page.tsx` | 2.3 | `next/dynamic` imports for KanbanBoard, TaskDetailView, TemplateLibrary |
| `app/today/page.tsx` | 2.2, 3.3 | Per-status queries; use shared TaskListItem |
| `app/calendar/page.tsx` | 2.2, 3.3 | Per-status queries; use shared TaskListItem |
| `app/settings/page.tsx` | 3.2 | Add error state and inline error display |
| `components/task/TaskListItem.tsx` | 3.3 | **NEW** — shared task list row component |
| `convex/constants.ts` | 3.4 | **NEW** — shared backend constants |
| `convex/telegramFormat.ts` | 3.4 | Import DEFAULT_TIMEZONE from constants |

---

## References

- Prior review plan: `docs/plans/2026-04-08-fix-all-review-findings-plan.md`
- DnD/CRUD brainstorm: `docs/brainstorms/2026-04-09-dnd-crud-audit-fix-brainstorm.md`
- Convex guidelines: `convex/_generated/ai/guidelines.md`
- Solutions archive: `docs/solutions/integration-issues/`, `docs/solutions/logic-errors/`
- Existing rate limit pattern: `convex/rateLimit.ts`
- Existing batch continuation pattern: `convex/tasks.ts:deleteCompletedTasksBatch`
