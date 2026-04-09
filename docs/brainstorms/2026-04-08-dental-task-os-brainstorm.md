# Dental Task OS — Brainstorm

**Date:** 2026-04-08
**Status:** Draft

---

## What We're Building

A simple, beautiful drag-and-drop Kanban task manager for a dental practice owner (Mollie) who juggles three life areas: Practice, Personal, and Family. **Web-first** PWA with a dark, calm Scandinavian aesthetic from the Stitch designs.

**Core experience:** Open the app, see your tasks on a Kanban board, drag them between columns, add new ones fast. Use AI to capture tasks in natural language and get smart reminders.

---

## Why This Approach

- Kanban gives instant visual clarity on task status without cognitive overhead
- Drag-and-drop is the most natural way to move tasks through stages
- The Stitch "Silent Editor" dark theme creates a calm, focused environment — the app should feel like relief, not stress
- Single user, no collaboration complexity — keeps everything simple

---

## Key Decisions

### 1. Web-first, responsive down to mobile
- **Desktop is primary** — sidebar nav, spacious Kanban, detail panel
- Mobile is supported but secondary — bottom nav, bottom sheet
- Not "mobile-first" — design for a big screen first, adapt down

### 2. Visual design — Stitch layout + refined style guide
Stitch provides the **layout and component patterns**. The style guide below provides the **exact colors, spacing, and rules**.

**Feel:** Quiet, focused, Nordic — like a physical paper planner rendered in dark glass. Notion dark mode meets Scandinavian minimalism.

#### Color palette (exact, non-negotiable)
| Token | Value | Usage |
|-------|-------|-------|
| Background base | `#0f1112` | App shell, page background |
| Surface | `#161a1c` | Cards, columns, panels |
| Surface elevated | `#1e2428` | Modals, dropdowns, bottom sheets |
| Border / dividers | `#252b2e` | Card borders, section dividers |
| Text primary | `#e8edef` | Headings, task titles |
| Text secondary | `#8fa3a8` | Metadata, dates, descriptions |
| Text muted | `#4d5e62` | Placeholders, disabled states |
| Accent teal (primary) | `rgb(118,165,175)` / `#7697a8` | Active states, selected cards, focus rings, primary CTAs, column headers |
| Accent teal light (secondary) | `rgb(162,196,201)` / `#a2c4c9` | Hover states, subtle accents, tag chips, date highlights |
| Destructive / overdue | `#b05050` | Muted red — never bright |
| Success / done | `#4a8c7e` | Desaturated teal-green |

#### Design rules
- **No pure black or pure white** — ever
- **No neon or saturated colors** — everything muted
- **No shadows** — depth via tonal layering only
- **No decorative flourishes** — every element serves a function
- **Cards:** flat, 4px radius, 1px border `#252b2e`, no shadows
- **Kanban columns:** subtle — same bg family, differentiated by 1px `border-left` in accent teal
- **Calendar:** teal dot indicators for tasks, muted date numbers, today = accent teal bg at 20% opacity
- **Typography:** Inter, 13-15px body, weight 400/500 only — **never bold**
- **Spacing:** 8px grid, generous padding (16-24px internal)
- **Transitions:** 200ms ease-in-out on all hover/focus states
- **Border radius:** 4px everywhere, consistent

#### Status badges (pill shape)
| Status | Color |
|--------|-------|
| To Do | Muted gray chip |
| In Progress | Teal chip (`#7697a8`) |
| Done | `#4a8c7e` chip |
| Overdue | `#b05050` chip |

#### Layout
- **Desktop:** Left sidebar nav, three-column Kanban, inline calendar panel
- **Mobile:** Bottom tab nav (Kanban / Calendar / Today), swipeable card detail drawer

### 3. Kanban is the primary view
- Drag-and-drop columns (e.g., To Do, In Progress, Done)
- Tasks show title, workstream badge, priority, due date
- Tap a task to open detail in side panel (desktop) or bottom sheet (mobile)

### 4. Three views: Today, Kanban, Calendar
- **Kanban** (`/`): Default home — drag-and-drop board
- **Today** (`/today`): Focused view of what's due today/overdue, grouped by workstream
- **Calendar** (`/calendar`): Month view with task dots, day agenda panel

### 5. Three workstreams: Practice, Personal, Family
- Color-coded badges (colors adapted for dark theme)
- Filter tasks by workstream on any view

### 5. Auth — simple password
- Single password stored as hashed env var (`APP_PASSWORD`)
- Login screen: just a password field, no username
- Session via HTTP-only cookie (e.g. iron-session or a signed JWT)
- No Google OAuth, no NextAuth, no third-party auth

### 6. Tech stack
- **Next.js 15** (App Router) + **Convex** + **Tailwind CSS** (custom only)
- **Vercel AI SDK** — AI-powered task capture + smart reminders
- **PWA** — installable, offline-capable
- **@hello-pangea/dnd** for drag-and-drop
- **iron-session** or similar for cookie-based session

### 6a. AI features (Vercel AI SDK)
- **Natural language task capture:** Type "call insurance tomorrow 2pm" → AI parses it into title, due date, due time, workstream, priority
- **Quick capture input:** Always-available AI chat bar — type naturally, AI creates the task
- **Smart reminders:** AI schedules reminders based on task context and due dates
- **Web push delivery** for reminders (Telegram deferred to later)

### 7. Task model (simplified from PRD)
| Field | Details |
|-------|---------|
| Title | Required, max 200 chars |
| Workstream | Practice / Personal / Family |
| Priority | High / Normal |
| Status | To Do / In Progress / Done |
| Due date | Optional |
| Due time | Optional (if date set) |
| Recurring | None / Daily / Weekdays / Weekly / Monthly |
| Notes | Optional, max 2000 chars |

### 8. Reminders — Telegram + Web Push
- **Telegram is the primary notification channel** — bot sends reminders, inline Mark Done / Snooze buttons
- **Web push** as secondary channel for when you're in the browser
- Convex scheduled actions trigger reminders at `reminderAt` time
- Telegram bot: `/start` to link account, no task creation via Telegram — notifications only
- Telegram webhook hosted on Vercel API route (validate secret, fast 200)
- Daily digest via Telegram (summary of today's tasks at configured time)
- Overdue check cron (~9 AM) sends gentle nudge if not already reminded

### 9. Deployment — Vercel + Convex
- **Vercel** for Next.js hosting, API routes, Telegram webhook
- **Convex** for database, real-time queries, scheduled actions, crons
- Target: < $10/month (Vercel hobby + Convex free tier)
- Environment vars: `APP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, Convex keys, AI API key

### 10. Settings
- Accessible via gear icon in top nav bar (not a separate nav tab)
- Timezone, daily digest time, Telegram link status + `/start` instructions, push toggle, change password

---

## Approach

### Phase 1 — Foundation + Kanban (ship this first)
- Next.js + Convex + simple password auth (iron-session)
- Convex schema (tasks table)
- Kanban board with drag-and-drop
- Task create/edit (modal on desktop, bottom sheet on mobile)
- Stitch dark theme system
- Desktop sidebar nav layout
- PWA manifest

### Phase 2 — AI Capture + Today + Calendar
- Vercel AI SDK integration
- AI-powered natural language task input bar
- Today view (due today/overdue, grouped by workstream)
- Calendar month view with agenda panel
- Filters and search

### Phase 3 — Telegram + Reminders
- Telegram bot setup (BotFather, webhook on Vercel)
- `/start` linking flow (short-lived token, 10 min expiry)
- Convex scheduled actions for reminder delivery
- Telegram message with inline Mark Done / Snooze 1hr buttons
- Web push as secondary channel
- Daily digest cron + overdue check cron

### Phase 4 — Polish + Deploy
- Settings page (timezone, digest time, Telegram link, push toggle)
- Completion animations, undo toast
- Offline support (service worker)
- Mobile responsive pass (bottom nav, bottom sheet)
- Vercel production deployment
- PWA icons + manifest finalization

---

## Open Questions

_None — user directed to follow Stitch designs and build simple Kanban task management._

---

## Source Materials

- **PRD:** `docs/dental-task-os-PRD.md` — feature logic, data model, tech constraints
- **Stitch designs:** `stitch (1)/`, `stitch (1) 2/`, `stitch (2)/` — visual direction, component patterns, design system
