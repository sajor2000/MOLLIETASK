---
title: "Convex Backend Audit — Auth, CRUD, Webhook, File Upload, and Reliability Fixes"
date: 2026-04-09
category: integration-issues
tags:
  - convex
  - auth
  - crud
  - webhooks
  - file-upload
  - rate-limiting
  - reminders
  - telegram
  - workos
  - timezone
  - race-condition
  - transaction-limits
severity: high
components:
  - convex/auth.config.ts
  - convex/taskAttachments.ts
  - convex/http.ts
  - convex/tasks.ts
  - convex/users.ts
  - convex/telegramBot.ts
  - convex/reminders.ts
  - convex/rateLimit.ts
symptoms:
  - "Silent auth failure when WORKOS_CLIENT_ID env var is missing (JWKS URL resolves to .../jwks/undefined)"
  - "File upload finalization broken due to incorrect db.system.get args (table name passed as record ID)"
  - "Telegram webhook returns 500 on malformed JSON causing infinite retry loops"
  - "Blank task titles accepted silently via updateTask mutation"
  - "AI date parsing uses UTC instead of user timezone causing off-by-one day errors for western US users at night"
  - "Account deletion can exceed Convex transaction limits with batch size of 200"
  - "Telegram edit path missing notes length validation present in web UI"
  - "markReminderSent crashes if task is deleted between action read and mutation (race condition)"
  - "Fragile dynamic import pattern in rate limit cleanup"
root_cause_summary: >
  Multiple independent defects across ~20 Convex backend files, ranging from
  missing input validation and incorrect API call signatures to environment variable
  handling gaps, timezone-naive date arithmetic, and unguarded async race conditions.
  Issues reflect incremental feature additions without systematic cross-file audit
  against Convex's documented constraints and best practices.
---

# Convex Backend Audit — 9 Fixes

Comprehensive audit of all Convex backend code for CRUD correctness and error prevention. Cross-referenced against official Convex guidelines (`convex/_generated/ai/guidelines.md`) and Convex documentation via Ref MCP.

## Summary Table

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | P1 | `auth.config.ts` | Missing env var guard on `WORKOS_CLIENT_ID` | Throw at startup if undefined |
| 2 | P1 | `taskAttachments.ts:59` | `db.system.get("_storage", id)` wrong signature | Changed to `db.system.get(id)` |
| 3 | P1 | `http.ts` | No error boundary in Telegram webhook handler | Added JSON parse try/catch + catch-all returning 200 |
| 4 | P2 | `tasks.ts:304` | `updateTask` allows blank titles | Added `!title.trim()` check |
| 5 | P2 | `http.ts` (3 sites) | AI date parsing uses UTC, not user timezone | Replaced with `toLocaleDateString("en-CA", { timeZone })` |
| 6 | P2 | `users.ts` | `deleteAccount` batch of 200 exceeds transaction limits | Reduced to 25 with continuation pattern |
| 7 | P2 | `telegramBot.ts:157` | Notes length not validated in Telegram edit path | Added `notes.length > 2000` guard |
| 8 | P2 | `reminders.ts:326` | `markReminderSent` throws if task deleted mid-flight | Added `db.get` existence check |
| 9 | P3 | `rateLimit.ts` | Dynamic `import()` inside mutation handler | Moved to top-level static import |

---

## Fix 1 — P1: Missing WORKOS_CLIENT_ID Guard

**File:** `convex/auth.config.ts`

**Root cause:** `process.env.WORKOS_CLIENT_ID` can be `undefined` at runtime. Without a guard, the JWKS URL becomes `https://api.workos.com/sso/jwks/undefined`, silently invalidating every JWT validation attempt. No error is thrown at startup — the app boots normally and then fails all authenticated requests.

**Before:**
```ts
const clientId = process.env.WORKOS_CLIENT_ID;

const authConfig = {
  providers: [
    {
      type: "customJwt" as const,
      issuer: "https://api.workos.com/",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
```

**After:**
```ts
const clientId = process.env.WORKOS_CLIENT_ID;
if (!clientId) {
  throw new Error("WORKOS_CLIENT_ID environment variable is not set");
}
```

**Impact:** Hard startup failure rather than subtle runtime auth failure.

---

## Fix 2 — P1: Wrong `db.system.get` Signature

**File:** `convex/taskAttachments.ts:59`

**Root cause:** `ctx.db.system.get` takes a single system document ID argument, exactly like `ctx.db.get`. Passing `"_storage"` as a first argument treats the table name string as the ID, returning `null` and making upload size/type validation silently fail. The `listForTask` query in the same file already used the correct single-argument form.

**Before:**
```ts
const meta = (await ctx.db.system.get("_storage", storageId)) as StorageMeta | null;
```

**After:**
```ts
const meta = (await ctx.db.system.get(storageId)) as StorageMeta | null;
```

**Impact:** File size and content-type validation now correctly reads storage metadata.

---

## Fix 3 — P1: No Error Boundary in Telegram Webhook

**File:** `convex/http.ts`

**Root cause:** Two failure modes:
1. `req.json()` throws on malformed body, returning 500. Telegram retries on 5xx, causing infinite retry loops.
2. Any unhandled exception within the handler body also returns 500.

**After:**
```ts
let body: TelegramWebhookBody;
try {
  body = (await req.json()) as TelegramWebhookBody;
} catch {
  console.error("Telegram webhook: malformed JSON body");
  return new Response("OK", { status: 200 });
}

try {
  // ...entire handler body...
  return new Response("OK", { status: 200 });
} catch (e) {
  console.error("Telegram webhook unhandled error:", e);
  return new Response("OK", { status: 200 });
}
```

**Impact:** Webhooks always return 200 unless the secret check fails (401). No more retry storms.

---

## Fix 4 — P2: Missing Empty Title Validation

**File:** `convex/tasks.ts:304`

**Root cause:** `updateTask` validated title length (`> 200 chars`) but not blank titles. `insertTaskCore` correctly validates non-empty.

**After:**
```ts
if (updates.title !== undefined) {
  if (!updates.title.trim()) throw new Error("Title is required");
  if (updates.title.length > 200) throw new Error("Title max 200 characters");
}
```

---

## Fix 5 — P2: AI Date Parsing Uses UTC Not User Timezone

**File:** `convex/http.ts` (3 locations: `/add`, `/edit`, free-text routing)

**Root cause:** `new Date().toISOString().slice(0, 10)` always returns UTC. For users in UTC-5 through UTC-10, after ~7pm local time this produces tomorrow's UTC date. The AI then treats "tomorrow" as day-after-tomorrow.

**Before:**
```ts
const today = new Date().toISOString().slice(0, 10);
```

**After:**
```ts
const userTz = user.timezone ?? "America/Chicago";
const today = new Date().toLocaleDateString("en-CA", { timeZone: userTz });
```

The `en-CA` locale produces `YYYY-MM-DD` format natively.

---

## Fix 6 — P2: `deleteAccount` Batch Too Large

**File:** `convex/users.ts`

**Root cause:** Batch of 200 tasks per transaction. `deleteTaskCascade` per task deletes subtasks + attachments + storage blobs. Worst case: 200 x (50 subtasks + 50 attachments + storage ops) = ~30,000 operations, far beyond Convex's 4,096 document read/write limit.

**After:**
```ts
const BATCH = 25;
const tasks = await ctx.db.query("tasks")
  .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
  .take(BATCH + 1);

const batch = tasks.slice(0, BATCH);
for (const task of batch) {
  await deleteTaskCascade(ctx, task);
}

if (tasks.length > BATCH) {
  await ctx.scheduler.runAfter(0, internal.users.deleteAccountCleanup, { userId });
}
```

The `take(BATCH + 1)` / `slice(0, BATCH)` pattern detects continuation without a separate count query.

---

## Fix 7 — P2: Missing Notes Validation in Telegram Edit

**File:** `convex/telegramBot.ts:157`

**Root cause:** `editTaskFromTelegram` validated title length and dueTime format but skipped notes validation. The web UI enforces 2,000 characters.

**After:**
```ts
if (updates.notes !== undefined && updates.notes.length > 2000)
  throw new Error("Notes max 2000 characters");
```

---

## Fix 8 — P2: `markReminderSent` Race Condition

**File:** `convex/reminders.ts:326`

**Root cause:** `sendReminder` action reads task, sends notifications, then calls `markReminderSent` mutation. Task can be deleted between action read and mutation write, causing `ctx.db.patch` to throw "Document not found".

**After:**
```ts
handler: async (ctx, { taskId }) => {
  const task = await ctx.db.get(taskId);
  if (!task) return null; // task deleted between action read and this mutation
  await ctx.db.patch(taskId, { reminderSent: true });
  return null;
},
```

---

## Fix 9 — P3: Dynamic Import in Rate Limit Cleanup

**File:** `convex/rateLimit.ts`

**Root cause:** `cleanupOldEntries` used `const { internal } = await import("./_generated/api")` instead of top-level import. Fragile and inconsistent with every other file.

**Fix:** Moved to top-level `import { internal } from "./_generated/api";`.

---

## Prevention Strategies

### Convex Backend Checklist

- [ ] Every env var access is guarded with a null check that throws at startup
- [ ] `db.system.get` takes exactly one argument (a system document ID)
- [ ] Every HTTP handler wraps its body in try/catch — never let unhandled errors produce 500s
- [ ] Validation logic lives in shared helpers imported by every entry point
- [ ] Date strings are never generated without explicit timezone context
- [ ] Actions that read a document treat it as potentially deleted by the time the mutation runs
- [ ] Cascade deletes use batches of 25-50 with scheduler continuation
- [ ] All imports are top-level — no dynamic `await import()` inside handlers

### Common Convex Pitfalls

| Pitfall | What to Do Instead |
|---|---|
| Silent env var fallback (`process.env.X ?? ""`) | Throw at module init |
| `db.system.get(table, id)` (2-arg form) | `db.system.get(id)` — one arg only |
| Returning 500 from a webhook | Always return 200; handle errors internally |
| Validation defined inline per-mutation | Shared validator imported everywhere |
| `new Date().toISOString()` in mutations | Store UTC ms; format with user timezone |
| Unbounded delete loops | Paginate with scheduler continuation |
| Assuming action-fetched docs survive to mutation | Re-fetch inside the mutation; guard `db.get` |

### Validation Parity Rule

Every document type written through multiple entry points (web, Telegram, internal) must have one canonical validator. Any field validated on the web mutation must also be validated on the Telegram mutation and any internal action.

### Key Test Scenarios

1. **Missing env var at startup** — Assert clear error, not cryptic 500
2. **Malformed Telegram payload** — Assert 200 response, not 500
3. **Invalid field through each entry point** — Assert all reject identically
4. **User in UTC-5 at 01:00 UTC** — Assert correct local date
5. **Task deleted between action and mutation** — Assert graceful return
6. **Cascade delete with 500 children** — Assert completes without timeout

---

## Related Documentation

- `docs/solutions/convex-backend-audit-21-issues.md` — Prior audit covering 21 issues (cascade deletes, timezone, Telegram)
- `docs/solutions/convex-backend-review-batch-fixes.md` — 13-issue hardening (CRUD errors, race conditions, content-type validation)
- `docs/solutions/convex-auth-to-workos-migration-security-fixes.md` — WorkOS migration auth issues
- `docs/solutions/task-crud-consolidation-and-dnd-sort-rebalancing.md` — DnD error handling and CRUD consolidation
- `docs/plans/2026-04-09-fix-dnd-crud-consolidation-plan.md` — Implementation plan for CRUD consolidation
