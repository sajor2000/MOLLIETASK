"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useWorkspace() {
  const me = useQuery(api.users.getMe);
  const isLoading = me === undefined;
  const role = me?.workspaceRole ?? null;
  return {
    role,
    isOwner: !isLoading && role === "owner",
    isMember: !isLoading && role === "member",
    isLoading,
  } as const;
}
