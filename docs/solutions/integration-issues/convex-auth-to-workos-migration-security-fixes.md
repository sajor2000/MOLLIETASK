---
title: "WorkOS AuthKit Migration: Post-Migration Auth Bug Review and Remediation"
date: "2026-04-09"
category: "integration-issues"
severity: "P1 - multiple critical auth issues"
components:
  - "convex/authHelpers.ts"
  - "app/providers.tsx"
  - "convex/authInternal.ts"
  - "app/settings/page.tsx"
  - "middleware.ts"
  - "next.config.ts"
  - "convex/users.ts"
  - "app/sign-out/route.ts"
symptoms:
  - "First-time users see 'User not found' errors — children render before user record created"
  - "Expired sessions stay silently broken until page reload — forceRefreshToken ignored"
  - "Sign-out vulnerable to CSRF via client-side signOut() call"
  - "Unnecessary DB writes on every page load invalidating reactive query subscriptions"
  - "CSP blocking outbound connections to api.workos.com"
tags:
  - "auth"
  - "workos"
  - "authkit"
  - "convex"
  - "migration"
  - "security"
  - "csrf"
  - "csp"
  - "token-refresh"
  - "race-condition"
  - "react"
  - "next.js"
related_issues:
  - 105
  - 106
  - 107
  - 108
  - 109
  - 110
  - 111
  - 112
  - 113
---

# WorkOS AuthKit Migration: Post-Migration Auth Bug Review and Remediation

## Root Cause

All nine issues stem from the migration from `@convex-dev/auth` to WorkOS AuthKit (`@workos-inc/authkit-nextjs`). Convex Auth managed user-record creation, token refresh, and session lifecycle internally. WorkOS AuthKit is a thinner shim that hands raw JWT access tokens to Convex, so every concern the old library handled implicitly had to be reimplemented explicitly. The initial migration missed or partially addressed several of these concerns.

## Solution

### P1 #105 — First-login race condition: StoreUser didn't gate children

`StoreUser` rendered children immediately while the `users.store` mutation was still in flight. First-time users hit "User not found" errors.

**Fix:** `StoreUser` now tracks a `ready` boolean and returns `null` until the mutation resolves.

```tsx
// app/providers.tsx
function StoreUser({ children }: { children: ReactNode }) {
  const storeUser = useMutation(api.users.store);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storeUser()
      .then(() => setReady(true))
      .catch((err) => {
        console.error("Failed to store user:", err);
        setReady(true);
      });
  }, [storeUser]);

  if (!ready) return null;
  return <>{children}</>;
}
```

### P1 #106 — fetchAccessToken ignored forceRefreshToken

The `fetchAccessToken` callback always returned the cached ref value, even when Convex passed `{ forceRefreshToken: true }`.

**Fix:** When `forceRefreshToken` is `true`, bypass the ref and return the live `accessToken` value.

```tsx
// app/providers.tsx
const fetchAccessToken = useCallback(
  async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    if (forceRefreshToken) return accessToken ?? null;
    if (stableAccessToken.current && !tokenError) return stableAccessToken.current;
    return accessToken ?? null;
  },
  [accessToken, tokenError],
);
```

### P1 #107 — Sign-out CSRF

Sign-out called `signOut()` from client-side JavaScript, vulnerable to CSRF.

**Fix:** Server-side Route Handler at `app/sign-out/route.ts`. Client navigates via `router.push("/sign-out")`.

```ts
// app/sign-out/route.ts
import { signOut } from "@workos-inc/authkit-nextjs";
export async function GET() { return await signOut(); }
```

### P1 #108 — storeUser unconditional DB write

`storeUser` patched the user record on every call, even when nothing changed, invalidating all reactive query subscriptions.

**Fix:** Dirty check — only patch when `name` or `email` have actually changed.

```ts
// convex/authHelpers.ts
if (existing) {
  if (existing.name !== identity.name || existing.email !== identity.email) {
    await ctx.db.patch(existing._id, { name: identity.name, email: identity.email });
  }
  return existing._id;
}
```

### P2 #109 — getActionUserId unnecessary complexity

Had redundant `runQuery` parameter and dynamic import.

**Fix:** Delegates to `authInternal.getUserByToken` via static import.

```ts
// convex/authHelpers.ts
export async function getActionUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const userId = await ctx.runQuery(internal.authInternal.getUserByToken, {
    tokenIdentifier: identity.tokenIdentifier,
  });
  if (!userId) throw new Error("User not found");
  return userId;
}
```

### P2 #110 — Dead code (getAuthUser)

Unused `getAuthUser` function left over from Convex Auth. Deleted.

### P2 #111 — React anti-pattern: ref update in render phase

`stableAccessToken.current` was mutated in the render body.

**Fix:** Moved into `useEffect`.

```tsx
useEffect(() => {
  if (tokenError || !accessToken) stableAccessToken.current = null;
  else stableAccessToken.current = accessToken;
}, [accessToken, tokenError]);
```

### P2 #112 — Vestigial npm dependencies

`@auth/core`, `@convex-dev/workos`, `bcryptjs`, `@oslojs/crypto` removed from `package.json`.

### P2 #113 — CSP connect-src missing WorkOS domain

Added `https://api.workos.com` to `connect-src` in `next.config.ts`.

```ts
connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://api.workos.com;
```

## Verification

1. **TypeScript** — `tsc --noEmit` passes with zero errors
2. **Convex deploy** — `npx convex dev --once` succeeded
3. **Next.js build** — `npm run build` completed without errors
4. **Second-pass review (2026-04-09)** — All 9 issues re-verified via multi-agent code review. Each fix confirmed present in current code. Zero additional changes needed.

## Prevention Strategies

### Auth Provider Migration Checklist

**Token Adapter**
- [ ] `fetchAccessToken({ forceRefreshToken: true })` returns fresh token, not cached ref
- [ ] Ref updates happen inside `useEffect`, never in render body
- [ ] `isLoading` is `true` until both user identity and access token resolve

**User Provisioning**
- [ ] Provisioning mutation is idempotent — no unconditional writes
- [ ] A "readiness gate" blocks child rendering until provisioning resolves
- [ ] Mutation patches only when data has actually changed

**Sign-Out**
- [ ] Handled server-side (Route Handler or Server Action)
- [ ] Does not rely solely on client-side JS

**Security Headers**
- [ ] `connect-src` in CSP includes new provider's API domain
- [ ] Old provider domains removed from CSP

**Cleanup at Cutover**
- [ ] All exports from old auth package deleted
- [ ] Old npm packages removed from `package.json`
- [ ] Dead helper functions removed

## Key Lessons

1. **Auth token availability is not user readiness.** A valid JWT does not mean a user row exists in the database. Gate on both.

2. **Every parameter of an auth adapter interface is a contract obligation.** `forceRefreshToken` is a directive, not a hint. Test each parameter explicitly.

3. **Auth migrations accumulate tech debt in the same PR they introduce new functionality.** Remove everything the old system owned in the same changeset.

4. **Side effects in React must be guarded against repeated execution.** Any mutation triggered from a component must be idempotent and gated behind stable `useEffect` deps.

5. **CSP and functional code are a single unit of change.** A new auth provider that works in dev but throws CSP violations in prod is a broken deployment.

## Related Documentation

- [Prior backend audit (21 issues)](../logic-errors/convex-backend-audit-21-issues.md)
- [Fix plan for findings 105-113](../../plans/2026-04-08-fix-all-review-findings-plan.md)
- [Convex AI guidelines](../../convex/_generated/ai/guidelines.md) — auth adapter contract
- Todos: `todos/105-complete-p1-*.md` through `todos/113-complete-p2-*.md`
- [Second review batch (13 issues)](../logic-errors/convex-backend-review-batch-fixes.md)
