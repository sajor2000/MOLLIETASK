"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useWorkspace() {
  const me = useQuery(api.users.getMe);
  const role = me?.workspaceRole ?? "owner";
  return {
    role,
    isOwner: role === "owner",
    isMember: role === "member",
    isLoading: me === undefined,
  } as const;
}
