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

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        <Authenticated>
          <StoreUser>{children}</StoreUser>
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
