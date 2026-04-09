import { v } from "convex/values";
import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { workstreamValidator } from "./schema";
import { getAuthUserId, storeUser } from "./authHelpers";
import { deleteTaskCascade } from "./tasks";
import { validateTimezone, validateDigestTime } from "./validation";

export const getMe = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      timezone: v.optional(v.string()),
      digestTime: v.optional(v.string()),
      telegramChatId: v.optional(v.string()),
      lastUsedWorkstream: v.optional(workstreamValidator),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    let userId;
    try {
      userId = await getAuthUserId(ctx);
    } catch {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      timezone: user.timezone,
      digestTime: user.digestTime,
      telegramChatId: user.telegramChatId,
      lastUsedWorkstream: user.lastUsedWorkstream,
    };
  },
});

export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    return await storeUser(ctx);
  },
});

export const updateSettings = mutation({
  args: {
    timezone: v.optional(v.string()),
    digestTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, updates) => {
    const userId = await getAuthUserId(ctx);

    if (updates.timezone !== undefined) validateTimezone(updates.timezone);
    if (updates.digestTime !== undefined) validateDigestTime(updates.digestTime);

    await ctx.db.patch(userId, updates);
    return null;
  },
});

// Token generation moved to convex/secureToken.ts (Node action with crypto.randomBytes).
// This internal mutation stores the token — called from the action.
export const storeTelegramLinkToken = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiry: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, token, expiry }) => {
    await ctx.db.patch(userId, {
      telegramLinkToken: token,
      telegramLinkExpiry: expiry,
    });
    return null;
  },
});

// Internal — called from Telegram webhook handler, not client
export const linkTelegram = internalMutation({
  args: {
    token: v.string(),
    chatId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { token, chatId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramLinkToken", (q) => q.eq("telegramLinkToken", token))
      .first();
    if (!user || !user.telegramLinkExpiry || user.telegramLinkExpiry <= Date.now()) {
      return false;
    }

    await ctx.db.patch(user._id, {
      telegramChatId: chatId,
      telegramLinkToken: undefined,
      telegramLinkExpiry: undefined,
    });

    return true;
  },
});

export const unlinkTelegram = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    await ctx.db.patch(userId, {
      telegramChatId: undefined,
      telegramLinkToken: undefined,
      telegramLinkExpiry: undefined,
    });
    return null;
  },
});

export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    // Delete tasks in batches to stay within transaction limits
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
      .take(200);

    for (const task of tasks) {
      await deleteTaskCascade(ctx, task);
    }

    // If more tasks remain, schedule continuation
    if (tasks.length === 200) {
      await ctx.scheduler.runAfter(0, internal.users.deleteAccountCleanup, { userId });
      return null;
    }

    await deleteAccountNonTaskData(ctx, userId);
    await ctx.db.delete(userId);
    return null;
  },
});

/** Shared cleanup for non-task user data. */
async function deleteAccountNonTaskData(ctx: MutationCtx, userId: Id<"users">) {
  const staff = await ctx.db
    .query("staffMembers")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .take(200);
  for (const s of staff) await ctx.db.delete(s._id);

  const templates = await ctx.db
    .query("taskTemplates")
    .withIndex("by_userId_category", (q) => q.eq("userId", userId))
    .take(200);
  for (const t of templates) await ctx.db.delete(t._id);

  const subs = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(200);
  for (const sub of subs) await ctx.db.delete(sub._id);

  const limits = await ctx.db
    .query("rateLimits")
    .withIndex("by_userId_action", (q) => q.eq("userId", userId))
    .take(200);
  for (const entry of limits) await ctx.db.delete(entry._id);
}

// Internal continuation for large account deletion
export const deleteAccountCleanup = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
      .take(200);

    for (const task of tasks) {
      await deleteTaskCascade(ctx, task);
    }

    if (tasks.length === 200) {
      await ctx.scheduler.runAfter(0, internal.users.deleteAccountCleanup, { userId });
      return null;
    }

    await deleteAccountNonTaskData(ctx, userId);
    await ctx.db.delete(userId);
    return null;
  },
});
