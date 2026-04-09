import { QueryCtx, ActionCtx } from "./_generated/server";
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
export async function getActionUserId(
  ctx: ActionCtx,
  runQuery: ActionCtx["runQuery"],
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const { internal } = await import("./_generated/api");
  const userId = await runQuery(internal.authInternal.getUserByToken, {
    tokenIdentifier: identity.tokenIdentifier,
  });
  if (!userId) throw new Error("User not found");
  return userId;
}

/**
 * Get the authenticated user document.
 * Throws if not authenticated or user not found.
 */
export async function getAuthUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  return user;
}

/**
 * Store or update the user from their identity.
 * Called when a user signs in to ensure they have a record in the users table.
 */
export async function storeUser(ctx: QueryCtx & { db: QueryCtx["db"] & { insert: any; patch: any } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const existing = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: identity.name,
      email: identity.email,
    });
    return existing._id;
  }

  return await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    name: identity.name,
    email: identity.email,
    createdAt: Date.now(),
  });
}
