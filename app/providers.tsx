"use client";

import { ReactNode, useEffect, useRef } from "react";
import {
  ConvexReactClient,
  useMutation,
  useQuery,
  useConvexAuth,
  Authenticated,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Debug: log Clerk + Convex auth state to diagnose token flow.
 */
function AuthDebug() {
  const clerkAuth = useAuth();
  const convexAuth = useConvexAuth();

  useEffect(() => {
    if (!clerkAuth.isLoaded) return;

    console.log("[AuthDebug] Clerk:", {
      isSignedIn: clerkAuth.isSignedIn,
      userId: clerkAuth.userId,
    });
    console.log("[AuthDebug] Convex:", {
      isLoading: convexAuth.isLoading,
      isAuthenticated: convexAuth.isAuthenticated,
    });

    if (!clerkAuth.isSignedIn) return;

    // Check which path ConvexProviderWithClerk actually uses
    const sessionAud = clerkAuth.sessionClaims?.aud;
    console.log("[AuthDebug] SDK path:", sessionAud === "convex" ? "session-token" : "jwt-template", "| sessionClaims.aud:", sessionAud);

    const tokenPromise =
      sessionAud === "convex"
        ? clerkAuth.getToken()
        : clerkAuth.getToken({ template: "convex" });

    tokenPromise
      .then((token) => {
        if (!token) {
          console.error(
            sessionAud === "convex"
              ? "[AuthDebug] Session token NULL — check Convex integration in Clerk Dashboard"
              : "[AuthDebug] JWT template NULL — activate Convex integration at https://dashboard.clerk.com/apps/setup/convex",
          );
          return;
        }
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          console.log("[AuthDebug] Token OK:", { iss: payload.iss, aud: payload.aud, sub: payload.sub, exp: new Date(payload.exp * 1000).toISOString() });
        } catch {
          console.log("[AuthDebug] Token exists but could not decode");
        }
      })
      .catch((err) => console.error("[AuthDebug] getToken error:", err));
  }, [clerkAuth.isLoaded, clerkAuth.isSignedIn, convexAuth.isAuthenticated]);

  return null;
}

/**
 * Calls users.store once after Convex confirms authentication.
 * Side-effect only — does not gate rendering.
 */
function StoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const hasCalled = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || hasCalled.current) return;
    hasCalled.current = true;
    storeUser().catch((err) => {
      console.error("Failed to store user:", err);
      hasCalled.current = false; // reset so the next re-render retries
    });
  }, [isAuthenticated, storeUser]);

  return null;
}

/**
 * Reads the invite token from the URL (?token=...) and calls consumeInvite
 * once. Only rendered after getMe confirms the user record exists in Convex,
 * ensuring StoreUser has committed before consumeInvite runs.
 */
function ConsumeInviteToken() {
  const consumeInvite = useMutation(api.workspaces.consumeInvite);
  const router = useRouter();
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;

    consumed.current = true;
    consumeInvite({ token })
      .then((result) => {
        if (result.success) {
          // Remove token from URL without a full page reload
          router.replace(window.location.pathname);
        } else {
          consumed.current = false;
          console.error("Failed to consume invite:", result.error);
        }
      })
      .catch((err) => {
        consumed.current = false;
        console.error("Error consuming invite:", err);
      });
  }, [consumeInvite, router]);

  return null;
}

/**
 * Gates ConsumeInviteToken until getMe returns a non-null user, which confirms
 * StoreUser has committed the user record. Without this gate, consumeInvite
 * fails silently for brand-new users whose Convex record doesn't exist yet.
 */
function ConsumeInviteTokenGated() {
  const me = useQuery(api.users.getMe);
  if (!me) return null;
  return <ConsumeInviteToken />;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <AuthDebug />
      <Authenticated>
        <StoreUser />
        <ConsumeInviteTokenGated />
      </Authenticated>
      {children}
    </ConvexProviderWithClerk>
  );
}
