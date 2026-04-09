import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Get the authenticated user's ID from the users table.
 * Works in queries and mutations (anything with ctx.db).
 * Throws if not authenticated or user not found.
 */
export async function getAuthUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!user) throw new Error("User not found");
  return user._id;
}

/**
 * Get the authenticated user's ID for use in actions.
 * Actions don't have ctx.db, so this uses ctx.runQuery internally.
 * Throws if not authenticated.
 */
export async function getActionUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const userId = await ctx.runQuery(internal.authInternal.getUserByToken, {
    tokenIdentifier: identity.tokenIdentifier,
  });
  if (!userId) throw new Error("User not found");
  return userId;
}

/**
 * Store or update the user from their identity.
 * Called when a user signs in to ensure they have a record in the users table.
 * Skips the patch if name and email are already up to date (avoids unnecessary
 * write transactions that would invalidate reactive query subscriptions).
 */
export async function storeUser(ctx: MutationCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const existing = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (existing) {
    if (existing.name !== identity.name || existing.email !== identity.email) {
      await ctx.db.patch(existing._id, {
        name: identity.name,
        email: identity.email,
      });
    }
    return existing._id;
  }

  return await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    name: identity.name,
    email: identity.email,
    createdAt: Date.now(),
  });
}
