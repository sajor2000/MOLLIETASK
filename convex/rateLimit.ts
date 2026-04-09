import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

const COOLDOWNS: Record<string, number> = {
  parseTaskIntent: 2000,
  suggestSubtasks: 10000,
};

export const checkRateLimit = internalQuery({
  args: {
    userId: v.id("users"),
    action: v.string(),
  },
  returns: v.object({ allowed: v.boolean(), retryAfterMs: v.number() }),
  handler: async (ctx, { userId, action }) => {
    const cooldown = COOLDOWNS[action] ?? 2000;
    const cutoff = Date.now() - cooldown;

    const recent = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action", (q) =>
        q.eq("userId", userId).eq("action", action).gte("timestamp", cutoff),
      )
      .first();

    if (recent) {
      return {
        allowed: false,
        retryAfterMs: recent.timestamp + cooldown - Date.now(),
      };
    }
    return { allowed: true, retryAfterMs: 0 };
  },
});

export const recordRateLimitHit = internalMutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, action }) => {
    await ctx.db.insert("rateLimits", { userId, action, timestamp: Date.now() });
    return null;
  },
});

export const cleanupOldEntries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const entries = await ctx.db.query("rateLimits").take(200);
    for (const entry of entries) {
      if (entry.timestamp < cutoff) {
        await ctx.db.delete(entry._id);
      }
    }
    return null;
  },
});
