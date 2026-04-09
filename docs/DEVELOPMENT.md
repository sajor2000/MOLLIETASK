# Development guide

## Prerequisites

- **Node.js** (LTS recommended) and npm
- A **Convex** account and project ([Convex dashboard](https://dashboard.convex.dev))

## Install

```bash
npm install
```

## Environment variables

### Required for the Next.js app

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Convex deployment WebSocket URL (from `npx convex dev` or dashboard) |

### Convex dashboard / deployment (backend)

Configure in the Convex dashboard (or deployment env) as needed:

| Variable | Purpose |
| --- | --- |
| `CONVEX_SITE_URL` | Site URL used in `convex/auth.config.ts` for auth provider domain |
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token |
| `TELEGRAM_WEBHOOK_SECRET` | Validates incoming Telegram webhook requests (`convex/http.ts`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (see `convex/pushActions.ts`) |

Never commit `.env.local` or real secrets (they are gitignored).

## Running locally

1. Start Convex (generates types, runs functions, prints the deployment URL):

   ```bash
   npx convex dev
   ```

2. In another shell, start Next.js:

   ```bash
   npm run dev
   ```

3. Open the URL shown by Next (typically `http://localhost:3000`).

## Convex conventions

AI assistants and contributors should read **`convex/_generated/ai/guidelines.md`** before changing Convex code (project-specific API rules).

## Build

```bash
npm run build
```

Resolve any Convex type or schema errors before merging; run `npx convex dev` or deploy so `_generated` files stay in sync with your schema.

## Deployment (outline)

- **Frontend:** Vercel (or any Next.js host) with `NEXT_PUBLIC_CONVEX_URL` set to production Convex.
- **Backend:** `npx convex deploy` to your production Convex deployment.

Details depend on your chosen auth and domain; align `CONVEX_SITE_URL` and OAuth callback URLs with your hosting URLs.
