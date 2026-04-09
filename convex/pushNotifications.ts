import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./authHelpers";

export const savePushSubscription = mutation({
  args: {
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
  },
  returns: v.id("pushSubscriptions"),
  handler: async (ctx, { endpoint, keys }) => {
    const userId = await getAuthUserId(ctx);

    const duplicate = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId_endpoint", (q) =>
        q.eq("userId", userId).eq("endpoint", endpoint),
      )
      .first();

    if (duplicate) return duplicate._id;

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(6);
    if (existing.length >= 5) {
      throw new Error("Maximum of 5 push subscriptions per account");
    }

    return await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint,
      keys,
      createdAt: Date.now(),
    });
  },
});

export const removePushSubscription = mutation({
  args: {
    endpoint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { endpoint }) => {
    const userId = await getAuthUserId(ctx);

    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId_endpoint", (q) =>
        q.eq("userId", userId).eq("endpoint", endpoint),
      )
      .first();

    if (sub) {
      await ctx.db.delete(sub._id);
    }
    return null;
  },
});

// Called from reminders to clean up expired push subscriptions (410 Gone)
export const removeExpiredSubscriptions = internalMutation({
  args: {
    userId: v.id("users"),
    endpoints: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, endpoints }) => {
    for (const endpoint of endpoints) {
      const sub = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_userId_endpoint", (q) =>
          q.eq("userId", userId).eq("endpoint", endpoint),
        )
        .first();

      if (sub) {
        await ctx.db.delete(sub._id);
      }
    }
    return null;
  },
});
