# Dental Task OS — Product Requirements Document (PRD)

| Field | Value |
| --- | --- |
| **Product** | Dental Task OS |
| **Document type** | PRD (derived from Technical Specification v1.0) |
| **Version** | 1.0 |
| **Date** | April 2026 |
| **Status** | Draft for build |
| **Related** | `dental-task-os-spec (2).docx` — full implementation detail |

---

## 1. Executive summary

Dental Task OS is a **single-user**, **mobile-first** progressive web app (PWA) for a dental practice owner who balances **three workstreams**: dental practice operations, personal life, and family. The product prioritizes **fast task capture**, a **calm Today-first experience**, and **reliable reminders** (web push primary; Telegram as backup). Users sign in with **Google** (no new password). **Convex** is the system of record; **Next.js (App Router)** delivers the client.

---

## 2. Problem statement

Busy operators juggle overlapping responsibilities across work and home. Generic task tools are either too complex, too visually noisy, or weak on **notifications that actually fire**. Paper lists and ad-hoc notes do not surface **what matters today** or sync across phone and desktop. This product targets **relief and clarity**: open the app, see today’s commitments by life area, add a task in one tap, and trust reminders.

---

## 3. Goals and success criteria

### 3.1 Product goals

| ID | Goal |
| --- | --- |
| G1 | **Today is home** — default experience emphasizes today and overdue, not an endless backlog. |
| G2 | **One-tap add** — floating add action is always available; modal opens without navigation. |
| G3 | **Reminders are the moat** — scheduled delivery via web push; Telegram backup when linked. |
| G4 | **Low cognitive load** — simple model (todo/done, two priorities), beautiful calm UI. |
| G5 | **Installable & offline-capable** — PWA on home screen; Today usable offline with sync when back online. |

### 3.2 Success metrics (measurable)

| Area | Target (from spec) |
| --- | --- |
| Performance | Task list first paint **&lt; 100 ms**; modal open **&lt; 50 ms**; minimal layout shift. |
| Reliability | Push + scheduled Convex actions deliver reminders; duplicate sends prevented (`reminderSent`). |
| Cost | **&lt; $10/month** (Vercel hobby, Convex free tier, Telegram). |
| Accessibility | **WCAG 2.1 AA**; tap targets **≥ 44×44 px**; color not sole indicator; icon labels for screen readers. |
| Privacy | No analytics or third-party tracking scripts; user data scoped to authenticated user only. |

---

## 4. Target user and persona

**Primary persona:** Practice-owning dentist and parent — non-developer, time-poor, mobile-heavy.

**Behaviors:**

- Enters tasks **primarily in the web app** (typing).
- Uses **Telegram only for notifications** (not task creation in v1).
- Expects **Google sign-in** and no extra passwords.

**Emotional bar:** Opening the app should feel like **relief**, not stress.

---

## 5. Workstreams (life areas)

The product organizes work into **three fixed workstreams** (filters, badges, Today sections):

| Workstream | Intent |
| --- | --- |
| **Practice** | Dental business and clinical/admin operations. |
| **Personal** | Individual non-family personal errands and goals. |
| **Family** | Household and family-related tasks. |

*(Source spec section 1.2 was blank; definitions align with filters, schema, and UI copy throughout the technical spec.)*

---

## 6. Scope

### 6.1 In scope (v1)

- Google OAuth (NextAuth.js v5); JWT session; Convex `users` upsert on sign-in.
- **Today** (`/`): greeting, date, high-priority count; collapsible Practice | Personal | Family; overdue + today todo; empty states; floating add.
- **All tasks** (`/all`): filters, sort, search, DnD reorder within workstream (`@hello-pangea/dnd`), show completed toggle.
- **Task modal**: add/edit; fields per §7; natural-language date hints in title (date-fns); optimistic updates.
- **Completion**: animation, undo toast (5 s), recurring next occurrence on complete.
- **Reminders**: Convex-scheduled actions; web push; optional Telegram backup; optional daily digest; overdue check cron.
- **Settings** (`/settings`): timezone, digest time, Telegram link UX, push status, danger zone actions.
- **PWA**: manifest, icons, service worker (`next-pwa`), runtime caching for Convex (network-first).
- **Telegram bot**: `/start` linking, webhook, inline **done** / **snooze** — **no task creation via Telegram**.

### 6.2 Out of scope (v1)

| Item | Rationale |
| --- | --- |
| Kanban / boards | Explicit non-goal; list app only. |
| AI agents / smart task suggestions | v1 scope; reduces risk and complexity. |
| Gmail / Google Calendar | OAuth scopes v1: `openid`, `profile`, `email` only. |
| Redux / Zustand / Jotai | Convex is client state. |
| shadcn / MUI / Chakra | Custom Tailwind components only. |
| `pages/` router | App Router only. |
| Multi-tenant / sharing | Single-user product. |

### 6.3 Future (v2 hints from spec)

- Additional Google scopes (e.g. Calendar) if product direction changes.
- Broader integrations only if explicitly prioritized.

---

## 7. User-facing requirements

### 7.1 Authentication and session

- **FR-A1:** Sign in with Google; unauthenticated users redirect to `/api/auth/signin`.
- **FR-A2:** First login creates Convex user: `googleId`, `email`, `name`, `avatarUrl`, `timezone` (browser default), `createdAt`.
- **FR-A3:** Later logins update `name` and `avatarUrl` only.
- **FR-A4:** All Convex access uses **server-validated** `userId` — never trust client-supplied user id.

### 7.2 Today view

- **FR-T1:** Default route `/` shows greeting (e.g. “Good morning, Mollie”), today’s date, count of high-priority tasks.
- **FR-T2:** Three collapsible sections: Practice, Personal, Family — each lists **todo** items **due today or overdue** (per query rules in technical spec).
- **FR-T3:** Overdue tasks at top of section with subtle red indicator; high priority with filled dot.
- **FR-T4:** Row: checkbox (complete), title, due date, priority dot; tap row opens edit (not checkbox).
- **FR-T5:** Complete action: micro-animation (checkbox + fade); **Undo** toast 5 seconds.
- **FR-T6:** Per-section empty states: calm copy, not blank boxes.
- **FR-T7:** Floating add opens `TaskModal`.

### 7.3 All tasks view

- **FR-L1:** Lists non-done tasks across workstreams; filter All | Practice | Personal | Family.
- **FR-L2:** Sort: due date | priority | created | manual order.
- **FR-L3:** Client-side title search (real time).
- **FR-L4:** Drag-and-drop reorder within workstream.
- **FR-L5:** Completed hidden by default; toggle with count badge; when shown, grouped at bottom.

### 7.4 Task create / edit (modal)

- **FR-M1:** Mobile: bottom sheet; desktop: centered modal; instant open.
- **FR-M2:** Fields and constraints:

| Field | Requirement |
| --- | --- |
| Title | Required, max 200 chars; auto-focus; NL date parsing strips hints from title and sets due fields |
| Workstream | Required toggle: Practice \| Personal \| Family; default last used |
| Priority | High \| Normal (default Normal) |
| Due date | Optional; shortcuts Today / Tomorrow / Next week |
| Due time | Optional; only if date set; drives time-specific reminders |
| Recurring | Optional: None, Daily, Weekdays, Weekly, Monthly |
| Notes | Optional, max 2000 chars |

- **FR-M3:** Save calls Convex `addTask` / `updateTask`; if `reminderAt` set, schedule `sendReminder`; recurring handled on completion.
- **FR-M4:** Optimistic UI for mutations.

**Natural language examples (acceptance guidance):**

| Input pattern | Expected outcome |
| --- | --- |
| “call insurance tomorrow” | Title cleaned; due tomorrow |
| “order gloves monday” | Title cleaned; next Monday |
| “dentist appt fri 2pm” | Title cleaned; Friday + time 14:00 |
| “renew license next month” | Title cleaned; first of next month |
| “daily standup every weekday” | Title cleaned; recurring weekdays |

### 7.5 Task completion and recurring

- **FR-C1:** Complete sets `status = done`, `completedAt = now`.
- **FR-C2:** Recurring tasks spawn next occurrence with updated due date on completion.
- **FR-C3:** Uncomplete supported (per `tasks.uncomplete` in spec).

### 7.6 Reminders and notifications

- **FR-R1:** After login, prompt to enable push; persist `PushSubscription` in Convex.
- **FR-R2:** When task saved with `reminderAt`, schedule Convex action at that time.
- **FR-R3:** Action sends web push to all user endpoints; payload: title = task title, body = workstream + due time, app icon; set `reminderSent`.
- **FR-R4:** Notification tap deep-links to `/all` with task highlighted.
- **FR-R5:** If `telegramChatId` present, also send Telegram message with inline **Mark done** / **Snooze 1hr** (format per spec).
- **FR-R6:** Telegram bot: `/start` (link), callbacks only — **no task creation**.
- **FR-R7:** Optional daily digest at user-configured time: push (+ Telegram if linked) with summary counts.
- **FR-R8:** Daily overdue check (~9 AM): gentle push if not already reminded that day.

### 7.7 Settings

- **FR-S1:** Timezone: auto-filled, editable.
- **FR-S2:** Optional daily digest time picker.
- **FR-S3:** Telegram: link status, bot link, `/start` instructions; one-time token flow (10 min expiry).
- **FR-S4:** Push status + re-enable.
- **FR-S5:** Danger zone: delete all completed tasks; delete account.

### 7.8 Task card interactions

- **FR-U1:** Checkbox 24×24 minimum tap target; workstream color on hover.
- **FR-U2:** Long-press: Edit | Delete | Change workstream.
- **FR-U3:** Swipe left (mobile): reveal delete.

### 7.9 Navigation and layout

- **FR-N1:** Mobile: bottom nav — Today / All / Settings (390px-first, iPhone 15 Pro reference).
- **FR-N2:** Desktop (&gt;768px): left sidebar + avatar; **no hamburger**; max content width 680px centered.
- **FR-N3:** Safe area insets for iOS notch/home indicator.

---

## 8. Non-functional requirements

| NFR | Requirement |
| --- | --- |
| **Performance** | List &lt; 100 ms; modal &lt; 50 ms; avoid layout shift on load. |
| **Offline** | Today readable offline; completions queued and synced on reconnect. |
| **Availability** | Target 99.9% on Vercel + Convex managed stack. |
| **Security** | HTTPS; Google OAuth only; Telegram webhook secret validation; strict user data isolation. |
| **Privacy** | No analytics/tracking; no third-party scripts; single-user, no data sharing. |
| **Cost** | &lt; $10/month operating cost under specified hosting tiers. |
| **Accessibility** | WCAG 2.1 AA; ≥44×44 tap targets; non-color cues; ARIA on icons. |

---

## 9. Data model (product-level)

Convex-only database — tables: **`users`**, **`tasks`**, **`pushSubscriptions`**.  
Field-level schema, indexes, and invariants are defined in the technical specification (docx), including:

- Tasks: `workstream` enum, `status` todo/done, `priority` high/normal, Unix ms timestamps, `reminderAt` / `reminderSent`, optional `recurring`, `sortOrder` with gap strategy (e.g. 1000).

---

## 10. Integrations and APIs (summary)

| Integration | Role |
| --- | --- |
| **Google OAuth** | Identity; minimal scopes v1. |
| **Convex** | Queries, mutations, scheduled actions, cron. |
| **Web Push** | Primary reminder channel. |
| **Telegram Bot API** | Backup reminders + inline actions; webhook on Vercel. |
| **Next.js API routes** | NextAuth; push subscribe; Telegram webhook (validate secret, fast 200). |

**Telegram linking (high level):** Settings shows link flow → app issues short-lived token → user sends `/start {token}` → webhook binds `telegramChatId`.

---

## 11. Design system (product)

| Token | Value | Use |
| --- | --- | --- |
| Practice | `#0F9B8E` | Badge, accents, headers |
| Personal | `#1B4F8A` | Badge, accents, headers |
| Family | `#B5446E` | Badge, accents, headers |
| High priority | `#DC2626` | Dot, emphasis |
| Background | `#FAFAF9` | App background |
| Surface | `#FFFFFF` | Cards, modals |
| Border | `#E5E5E5` | Dividers |
| Text primary | `#1A1A1A` | Titles |
| Text secondary | `#6B7280` | Meta |
| Font | Geist (next/font) | Sans UI; mono for code/times |

**Principles:** simple over powerful; calm UI; Today-first; intentional motion on complete.

---

## 12. Milestones and delivery phases

| Phase | Timeline | Outcomes |
| --- | --- | --- |
| **1 — Foundation** | Weeks 1–2 | Next.js 15 + Convex; Google OAuth; schema; basic CRUD; Today + All; Tailwind system |
| **2 — Core UX** | Week 3 | Full modal; NL dates; filters; DnD; completion animation; PWA manifest + icons |
| **3 — Reminders** | Week 4 | Web push E2E; subscriptions; scheduled actions; digest + overdue crons |
| **4 — Telegram** | Week 5 | Bot, webhook, linking, backup messages, inline done/snooze |
| **5 — Polish** | Week 6 | Settings completion; empty/error/loading states; offline SW; production deploy; E2E tests |

---

## 13. Engineering constraints (non-negotiable for implementation)

Summarized from spec §10 — full list remains authoritative in the docx.

**Must:** TypeScript strict; Convex for all task data; server-side `userId` validation; `next/font` Geist; Tailwind utilities only; mobile-first `md:`; optimistic mutations; Unix ms storage; explicit loading/errors; `useQuery` not `useEffect` for data.

**Must not:** External DB for tasks; localStorage for tasks; Kanban; AI in v1; Calendar/Gmail in v1; Telegram task create; UI kit libraries; `pages/` router; hardcoded user ids; secrets in repo.

**Quality:** Components ≤150 lines; Convex functions single-purpose; mutations return ids; avoid `any`.

---

## 14. Risks and assumptions

| Item | Notes |
| --- | --- |
| **Push permission friction** | iOS/Safari PWA push capabilities evolve; plan fallback messaging and Telegram emphasis. |
| **Single user** | Schema and UX assume one operator; scaling to staff would need new PRD. |
| **NL date parsing** | Edge cases and locale; define test matrix from examples in spec. |
| **Convex scheduler** | Reminder accuracy depends on platform semantics; validate in staging. |

---

## 15. Open items from source document

The following sections in `dental-task-os-spec (2).docx` had **no body content** in the extracted file:

- **§1.2 Three Workstreams** — filled in §5 of this PRD from consistent product usage elsewhere.
- **§2.1 Versions (pin exactly)** — **empty**; engineering should add pinned `package.json` versions before kickoff.
- **§3 Project Structure** — tree appears in doc **tables** (not body paragraphs); retain docx as file-tree reference or paste into engineering readme.

---

## 16. Appendix — traceability

| PRD section | Source (tech spec) |
| --- | --- |
| Goals, persona, philosophy | §1 |
| Stack and env | §2 |
| Schema tables | §4, tables |
| Features | §5 |
| UI/UX | §6, tables |
| Convex API | §7, tables |
| Next API routes | §8 |
| Phases | §9, table |
| Implementation rules | §10 |
| NFR table | §11 |

---

*End of PRD*
