"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useWorkspace() {
  const me = useQuery(api.users.getMe);
  // Treat both undefined (query in-flight) and null (pre-auth instant before
  // Clerk delivers its token) as loading so that role-gated UI never renders
  // before identity is confirmed.
  const isLoading = me === undefined || me === null;
  const role = me?.workspaceRole ?? null;
  return {
    role,
    isOwner: !isLoading && role === "owner",
    isMember: !isLoading && role === "member",
    isLoading,
  } as const;
}
