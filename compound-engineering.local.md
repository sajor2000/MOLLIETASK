---
review_agents:
  - kieran-typescript-reviewer
  - security-sentinel
  - performance-oracle
  - architecture-strategist
  - code-simplicity-reviewer
---

# Project: Dental Task OS

Next.js 15 App Router + Convex backend + Clerk auth + TypeScript.
No Rails — use TypeScript/Convex-specific patterns, not Rails conventions.

## Stack
- **Frontend**: Next.js 15 App Router, React 19, TailwindCSS
- **Backend**: Convex (serverless, real-time)
- **Auth**: Clerk (recently migrated from WorkOS)
- **Deployment**: Vercel + Convex Cloud

## Review Focus
- Convex patterns: `skipToken`, `ctx.auth.getUserIdentity()`, `tokenIdentifier`
- Clerk integration correctness
- Race conditions between auth and data loading
- Role-based access control (owner vs member)
- No WorkOS remnants
