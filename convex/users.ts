import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { workstreamValidator } from "./schema";
import { getAuthUserId, storeUser } from "./authHelpers";
import { deleteTaskAttachments } from "./tasks";
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

export const generateTelegramLinkToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    // Convex runtime seeds Math.random() per invocation for determinism.
    // Using it with a large character set + 32 chars gives sufficient entropy
    // for a short-lived 10-minute linking token.
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    await ctx.db.patch(userId, {
      telegramLinkToken: token,
      telegramLinkExpiry: expiry,
    });

    return token;
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
      if (task.scheduledReminderId) {
        await ctx.scheduler.cancel(task.scheduledReminderId);
      }
      // Cascade-delete subtasks
      const subtasks = await ctx.db
        .query("subtasks")
        .withIndex("by_parentTaskId_and_sortOrder", (q) =>
          q.eq("parentTaskId", task._id),
        )
        .take(50);
      for (const subtask of subtasks) {
        await ctx.db.delete(subtask._id);
      }
      await deleteTaskAttachments(ctx, task._id);
      await ctx.db.delete(task._id);
    }

    // If more tasks remain, schedule continuation
    if (tasks.length === 200) {
      await ctx.scheduler.runAfter(0, internal.users.deleteAccountCleanup, { userId });
      return null;
    }

    // Delete push subscriptions
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    for (const sub of subs) {
      await ctx.db.delete(sub._id);
    }

    // Delete rate limit entries
    const limits = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action", (q) => q.eq("userId", userId))
      .take(200);
    for (const entry of limits) {
      await ctx.db.delete(entry._id);
    }

    await ctx.db.delete(userId);
    return null;
  },
});

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
      if (task.scheduledReminderId) {
        await ctx.scheduler.cancel(task.scheduledReminderId);
      }
      // Cascade-delete subtasks
      const subtasks = await ctx.db
        .query("subtasks")
        .withIndex("by_parentTaskId_and_sortOrder", (q) =>
          q.eq("parentTaskId", task._id),
        )
        .take(50);
      for (const subtask of subtasks) {
        await ctx.db.delete(subtask._id);
      }
      await deleteTaskAttachments(ctx, task._id);
      await ctx.db.delete(task._id);
    }

    if (tasks.length === 200) {
      await ctx.scheduler.runAfter(0, internal.users.deleteAccountCleanup, { userId });
      return null;
    }

    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    for (const sub of subs) {
      await ctx.db.delete(sub._id);
    }

    // Delete rate limit entries
    const limits = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action", (q) => q.eq("userId", userId))
      .take(200);
    for (const entry of limits) {
      await ctx.db.delete(entry._id);
    }

    await ctx.db.delete(userId);
    return null;
  },
});
