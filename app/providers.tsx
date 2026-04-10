"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ConvexReactClient,
  useMutation,
  ConvexProviderWithAuth,
  Authenticated,
} from "convex/react";
import {
  AuthKitProvider,
  useAuth,
  useAccessToken,
} from "@workos-inc/authkit-nextjs/components";
import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Calls the users.store mutation once per session to ensure the authenticated
 * user has a record in the Convex users table. Renders children only after
 * the store completes, preventing "User not found" errors on first login.
 */
function StoreUser({ children }: { children: ReactNode }) {
  const storeUser = useMutation(api.users.store);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storeUser()
      .then(() => setReady(true))
      .catch((err) => {
        console.error("Failed to store user:", err);
        // Still render children so the app is usable even if store fails
        setReady(true);
      });
  }, [storeUser]);

  if (!ready) return null;
  return <>{children}</>;
}

/**
 * Checks for a pending invite token cookie (set by /invite/[token] route)
 * and consumes it to join the workspace. Runs once after StoreUser.
 */
function ConsumeInviteToken({ children }: { children: ReactNode }) {
  const consumeInvite = useMutation(api.workspaces.consumeInvite);
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;

    const token = document.cookie
      .split("; ")
      .find((c) => c.startsWith("invite_token="))
      ?.split("=")[1];

    if (!token) return;
    consumed.current = true;

    // Clear the cookie immediately
    document.cookie = "invite_token=; path=/; max-age=0";

    consumeInvite({ token })
      .then((result) => {
        if (result.success) {
          // Reload to pick up new workspace context
          window.location.reload();
        } else {
          console.error("Failed to consume invite:", result.error);
        }
      })
      .catch((err) => {
        console.error("Error consuming invite:", err);
      });
  }, [consumeInvite]);

  return <>{children}</>;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        <Authenticated>
          <StoreUser>
            <ConsumeInviteToken>{children}</ConsumeInviteToken>
          </StoreUser>
        </Authenticated>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

function useAuthFromAuthKit() {
  const { user, loading: isLoading } = useAuth();
  const {
    accessToken,
    loading: tokenLoading,
    error: tokenError,
  } = useAccessToken();
  const loading = (isLoading ?? false) || (tokenLoading ?? false);
  const authenticated = !!user && !!accessToken && !loading;

  // Hold the last valid token to avoid returning null during refresh.
  // Updated in useEffect to comply with React's pure-render expectations.
  const stableAccessToken = useRef<string | null>(null);
  useEffect(() => {
    if (tokenError || !accessToken) {
      stableAccessToken.current = null;
    } else {
      stableAccessToken.current = accessToken;
    }
  }, [accessToken, tokenError]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      // When Convex requests a forced refresh, return the live hook value
      // rather than the cached ref so token rotation takes effect.
      if (forceRefreshToken) {
        return accessToken ?? null;
      }
      if (stableAccessToken.current && !tokenError) {
        return stableAccessToken.current;
      }
      return accessToken ?? null;
    },
    [accessToken, tokenError],
  );

  return {
    isLoading: loading,
    isAuthenticated: authenticated,
    fetchAccessToken,
  };
}
