import { getAuthUserId as _getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Get the authenticated user's ID.
 * Uses @convex-dev/auth's helper which correctly parses identity.subject.
 * Throws if not authenticated.
 */
export async function getAuthUserId(ctx: { auth: QueryCtx["auth"] }): Promise<Id<"users">> {
  const userId = await _getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId as Id<"users">;
}

/**
 * Get the authenticated user document.
 * Throws if not authenticated or user not found.
 */
export async function getAuthUser(ctx: { auth: QueryCtx["auth"]; db: QueryCtx["db"] }) {
  const userId = await getAuthUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  return user;
}
