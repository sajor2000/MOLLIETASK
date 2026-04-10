import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const COOLDOWNS: Record<string, number> = {
  parseTaskIntent: 2000,
  suggestSubtasks: 10000,
};

/** Inline rate limit check for use inside mutations (cannot call runMutation from a mutation). */
export async function enforceRateLimit(
  ctx: MutationCtx,
  userId: Id<"users">,
  action: string,
  cooldownMs: number,
) {
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_userId_action", (q) =>
      q.eq("userId", userId).eq("action", action),
    )
    .order("desc")
    .first();
  const now = Date.now();
  if (existing && now - existing.timestamp < cooldownMs) {
    throw new Error("Too many requests. Please wait a moment.");
  }
  if (existing) {
    await ctx.db.patch(existing._id, { timestamp: now });
  } else {
    await ctx.db.insert("rateLimits", { userId, action, timestamp: now });
  }
}

/** Atomically check rate limit and record the hit in a single mutation. */
export const checkAndRecord = internalMutation({
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

    // Upsert — cap table at O(users × actions) rather than growing per call
    const hit = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action", (q) =>
        q.eq("userId", userId).eq("action", action),
      )
      .first();
    if (hit) {
      await ctx.db.patch(hit._id, { timestamp: Date.now() });
    } else {
      await ctx.db.insert("rateLimits", { userId, action, timestamp: Date.now() });
    }
    return { allowed: true, retryAfterMs: 0 };
  },
});

export const cleanupOldEntries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const entries = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action")
      .take(201);
    for (const entry of entries) {
      if (entry.timestamp < cutoff) {
        await ctx.db.delete(entry._id);
      }
    }
    // Self-schedule continuation if more entries may exist
    if (entries.length > 200) {
      await ctx.scheduler.runAfter(0, internal.rateLimit.cleanupOldEntries, {});
    }
    return null;
  },
});
