import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const COOLDOWNS: Record<string, number> = {
  parseTaskIntent: 2000,
  suggestSubtasks: 10000,
};

/** Atomically check rate limit and record the hit in a single mutation.
 *  Uses upsert: one row per user+action, timestamp updated in place. */
export const checkAndRecord = internalMutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
  },
  returns: v.object({ allowed: v.boolean(), retryAfterMs: v.number() }),
  handler: async (ctx, { userId, action }) => {
    const cooldown = COOLDOWNS[action] ?? 2000;
    const now = Date.now();

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action", (q) =>
        q.eq("userId", userId).eq("action", action),
      )
      .first();

    if (existing) {
      const elapsed = now - existing.timestamp;
      if (elapsed < cooldown) {
        return { allowed: false, retryAfterMs: cooldown - elapsed };
      }
      // Upsert: update timestamp in place instead of inserting a new row
      await ctx.db.patch(existing._id, { timestamp: now });
      return { allowed: true, retryAfterMs: 0 };
    }

    await ctx.db.insert("rateLimits", { userId, action, timestamp: now });
    return { allowed: true, retryAfterMs: 0 };
  },
});

export const cleanupOldEntries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h — stale entries only
    const entries = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action")
      .take(200);
    let deleted = 0;
    for (const entry of entries) {
      if (entry.timestamp < cutoff) {
        await ctx.db.delete(entry._id);
        deleted++;
      }
    }
    // Self-schedule continuation if we hit the batch limit and deleted any
    if (entries.length === 200 && deleted > 0) {
      await ctx.scheduler.runAfter(0, internal.rateLimit.cleanupOldEntries, {});
    }
    return null;
  },
});
