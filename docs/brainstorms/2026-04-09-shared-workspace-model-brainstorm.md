# Shared Workspace Model — Brainstorm

**Date:** 2026-04-09
**Status:** Brainstorm complete, ready for planning

---

## What We're Building

A shared workspace model that lets staff members (Nanci, Sonal, etc.) log into the app and see their assigned practice tasks — while keeping Mollie's experience identical to today when she's the only user.

### Core Principle: Solo-first, shared when ready

- Every user gets an implicit workspace on sign-up (no setup step)
- When Mollie is the only member, the app works exactly as it does today
- When staff join via invite link, they see a filtered view of practice tasks assigned to them
- Mollie's personal and family workstreams are never visible to staff

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Staff view scope | Only their assigned tasks | Minimal surface area, Mollie stays in control |
| Staff permissions | View + update status only | Staff can move tasks Todo→In Progress→Done, nothing else |
| Join mechanism | Invite link/code | Mollie generates from Team page, staff clicks and signs up |
| Workstream visibility | Practice only | Personal/family completely hidden from staff |
| Workspace creation | Implicit (auto on sign-up) | Zero friction for solo users, no "create workspace" step |

---

## How It Works

### Mollie's Experience (Owner)

1. **Today (solo):** Identical to current app. No workspace UI visible unless she goes to Team page.
2. **Inviting staff:** Team page gets an "Invite" button → generates a link. Shares via text/email.
3. **After staff join:** Mollie's view is unchanged. She sees all tasks across all workstreams. Staff member names in the Team page now show "Active" badge when linked to a real user account.
4. **Assigning tasks:** Same as today — pick staff from dropdown. Staff member now sees it in their app.

### Nanci's Experience (Staff Member)

1. **Joining:** Clicks invite link → signs up via WorkOS → lands in workspace.
2. **First load:** Sees only practice tasks assigned to her. No personal/family tasks. No unassigned tasks.
3. **Actions:** Can view task details, move between Todo/In Progress/Done. Cannot edit titles, change assignments, delete, or create tasks.
4. **Navigation:** Simplified — Kanban/Today/Calendar views but filtered to her tasks only. No Team page access. No Settings for workspace (only her personal timezone/notifications).

### Data Model Changes

**New table: `workspaces`**
- `_id`, `name` (e.g., "Mollie's Practice"), `ownerUserId`
- Created automatically when a user signs up

**New table: `workspaceMembers`**
- `workspaceId`, `userId`, `role` ("owner" | "member")
- Owner = full access, Member = view + status updates on assigned practice tasks

**New table: `workspaceInvites`**
- `workspaceId`, `token`, `expiry`, `createdBy`
- Short-lived invite codes, consumed on join

**Modified tables:**
- `tasks`: Add `workspaceId` field. Queries change from `userId` filter to `workspaceId` filter. `userId` becomes `createdBy` (who created the task).
- `staffMembers`: `ownerUserId` becomes `workspaceId`. `linkedUserId` field (already exists!) gets populated when a staff member joins.
- `subtasks`: Add `workspaceId` for consistency.
- `taskTemplates`: Add `workspaceId`.

**Unchanged:**
- `users`: Personal fields (timezone, digestTime, telegramChatId) stay per-user.
- `pushSubscriptions`, `rateLimits`: Stay per-user.

### Access Control Pattern

```
function getWorkspaceAccess(ctx):
  1. Get userId from auth
  2. Get workspaceMember record for this user
  3. Return { workspaceId, role }

Owner queries: All tasks where workspaceId matches
Member queries: Tasks where workspaceId matches AND assignedStaffId.linkedUserId === userId
Member writes: Only status field on assigned tasks
```

### Migration Path (existing data)

1. Create a workspace for every existing user
2. Add workspaceId to all their existing tasks, subtasks, templates
3. Add workspaceMember record (role: "owner") for each user
4. Update staffMembers.ownerUserId → staffMembers.workspaceId
5. All queries/mutations switch from userId to workspaceId

This is a backward-compatible migration — solo users see zero difference.

---

## What This Enables Later (Not Building Now)

- Staff members creating their own tasks within the workspace
- Cross-workspace visibility (a hygienist working at two practices)
- Role-based permissions beyond owner/member (admin, viewer)
- Workstream-level sharing controls
- Activity feed / audit log of who changed what

---

## Open Questions

_None — all resolved during brainstorm._

## Resolved Questions

1. **What should staff see?** → Only their assigned tasks
2. **What can staff do?** → View + update status only
3. **How do staff join?** → Invite link from Team page
4. **Which workstreams are shared?** → Practice only
5. **When is workspace created?** → Implicitly on sign-up
