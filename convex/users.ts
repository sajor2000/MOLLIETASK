import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { workstreamValidator, workspaceRoleValidator } from "./schema";
import { getAuthUserId, requireOwner, getWorkspaceContext, storeUser, generateSecureToken } from "./authHelpers";
import { deleteTaskAttachments } from "./tasks";
import { validateTimezone, validateDigestTime } from "./validation";
import { enforceRateLimit } from "./rateLimit";

export const getMe = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      timezone: v.optional(v.string()),
      digestTime: v.optional(v.string()),
      isTelegramLinked: v.boolean(),
      lastUsedWorkstream: v.optional(workstreamValidator),
      activeWorkspaceId: v.optional(v.id("workspaces")),
      workspaceRole: v.optional(workspaceRoleValidator),
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

    // Look up workspace role if user has an active workspace
    let workspaceRole: "owner" | "member" | undefined;
    if (user.activeWorkspaceId) {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId_userId", (q) =>
          q.eq("workspaceId", user.activeWorkspaceId!).eq("userId", user._id),
        )
        .unique();
      if (membership) {
        workspaceRole = membership.role;
      }
    }

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      digestTime: user.digestTime,
      isTelegramLinked: !!user.telegramChatId,
      lastUsedWorkstream: user.lastUsedWorkstream,
      activeWorkspaceId: user.activeWorkspaceId,
      workspaceRole,
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
    // digestTime controls workspace digest scheduling — owner-only
    const wsCtx = updates.digestTime !== undefined
      ? await requireOwner(ctx)
      : await getWorkspaceContext(ctx);

    if (updates.timezone !== undefined) validateTimezone(updates.timezone);
    if (updates.digestTime !== undefined) validateDigestTime(updates.digestTime);

    await ctx.db.patch(wsCtx.userId, updates);
    return null;
  },
});

export const generateTelegramLinkToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const wsCtx = await requireOwner(ctx); // Telegram integration is owner-only
    await enforceRateLimit(ctx, wsCtx.userId, "generateTelegramLinkToken", 30_000);

    const token = generateSecureToken();

    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    await ctx.db.patch(wsCtx.userId, {
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
    await enforceRateLimit(ctx, userId, "deleteAccount", 60_000);
    // Delegate all deletion work to the internal continuation, which
    // self-schedules in batches. This eliminates the duplicate cleanup
    // logic that previously existed in both this mutation and deleteAccountCleanup.
    await ctx.scheduler.runAfter(0, internal.users.deleteAccountCleanup, { userId });
    return null;
  },
});

// Handles all account deletion work in batches. Self-schedules for continuation
// when the task count exceeds 200. Single source of truth for deletion cascade.
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

    // All tasks deleted — clean up remaining records
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    for (const sub of subs) {
      await ctx.db.delete(sub._id);
    }

    const limits = await ctx.db
      .query("rateLimits")
      .withIndex("by_userId_action", (q) => q.eq("userId", userId))
      .take(200);
    for (const entry of limits) {
      await ctx.db.delete(entry._id);
    }

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(50);
    for (const m of memberships) {
      if (m.role === "owner") {
        const wsMembers = await ctx.db
          .query("workspaceMembers")
          .withIndex("by_workspaceId", (q) => q.eq("workspaceId", m.workspaceId))
          .take(100);
        for (const wm of wsMembers) {
          await ctx.db.delete(wm._id);
        }
        const wsInvites = await ctx.db
          .query("workspaceInvites")
          .withIndex("by_workspaceId", (q) => q.eq("workspaceId", m.workspaceId))
          .take(100);
        for (const inv of wsInvites) {
          await ctx.db.delete(inv._id);
        }
        await ctx.db.delete(m.workspaceId);
      } else {
        await ctx.db.delete(m._id);
      }
    }

    const linkedStaff = await ctx.db
      .query("staffMembers")
      .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", userId))
      .take(50);
    for (const s of linkedStaff) {
      await ctx.db.patch(s._id, { linkedUserId: undefined });
    }

    await ctx.db.delete(userId);
    return null;
  },
});
